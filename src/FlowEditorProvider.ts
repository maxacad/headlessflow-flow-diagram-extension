import * as vscode from 'vscode';
import * as http from 'http';
import * as https from 'https';
import * as fs from 'fs';
import * as path from 'path';
import { onPipeletDragStart, onPipeletInsertRequest, onEndpointDragStart, onEndpointInsertRequest } from './DragBridge';
import { NodeDetailViewProvider, type PipeletDetailEntry, type FlowHost, type HttpCallRequest, type NodeDetailContext } from './NodeDetailViewProvider';
import { DagDebugService } from './DagDebugService';
import { DagCommandType } from './dagDebugTypes';

export class FlowEditorProvider implements vscode.CustomTextEditorProvider, FlowHost {
  public static readonly viewType = 'reactdnd.flowEditor';
  private readonly activeWebviews = new Set<vscode.Webview>();
  private readonly activeEditors = new Set<{ panel: vscode.WebviewPanel; document: vscode.TextDocument }>();
  private pendingPipeletPayload: { name: string; uri: string; content: string } | null = null;
  private pendingGotoNode: { nodeId: string } | null = null;
  private readonly dagDebug: DagDebugService;

  public static register(context: vscode.ExtensionContext, nodeDetail: NodeDetailViewProvider): vscode.Disposable {
    const provider = new FlowEditorProvider(context, nodeDetail);
    void provider.updateDagDebugContext();
    return vscode.Disposable.from(
      vscode.window.registerCustomEditorProvider(
        FlowEditorProvider.viewType,
        provider,
        {
          webviewOptions: { retainContextWhenHidden: true },
          supportsMultipleEditorsPerDocument: false,
        }
      ),
      vscode.commands.registerCommand('reactdnd.toggleDagDebugMode', async (uri?: vscode.Uri) => {
        await provider.toggleDebugMode(uri);
      }),
      vscode.commands.registerCommand('reactdnd.enableDagDebugMode', async (uri?: vscode.Uri) => {
        await provider.setDebugMode(uri, true);
      }),
      vscode.commands.registerCommand('reactdnd.disableDagDebugMode', async (uri?: vscode.Uri) => {
        await provider.setDebugMode(uri, false);
      })
    );
  }

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly nodeDetail: NodeDetailViewProvider,
  ) {
    this.dagDebug = new DagDebugService(context);
    this.context.subscriptions.push(this.dagDebug);
    this.nodeDetail.setFlowHost(this);

    this.context.subscriptions.push(
      onPipeletDragStart((payload) => {
        this.pendingPipeletPayload = payload;
        for (const webview of this.activeWebviews) {
          webview.postMessage({ type: 'external-pipelet-drag-start', payload });
        }
      })
    );

    this.context.subscriptions.push(
      onPipeletInsertRequest((payload) => {
        for (const webview of this.activeWebviews) {
          webview.postMessage({ type: 'external-pipelet-insert-center', payload });
        }
      })
    );

    this.context.subscriptions.push(
      onEndpointDragStart((payload) => {
        for (const webview of this.activeWebviews) {
          webview.postMessage({ type: 'external-endpoint-drag-start', payload });
        }
      })
    );

    this.context.subscriptions.push(
      onEndpointInsertRequest((payload) => {
        for (const webview of this.activeWebviews) {
          webview.postMessage({ type: 'external-endpoint-insert-center', payload });
        }
      })
    );
  }

  async resolveCustomTextEditor(
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken
  ): Promise<void> {
    webviewPanel.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.context.extensionUri, 'dist'),
      ],
    };

    webviewPanel.webview.html = this.getHtmlForWebview(webviewPanel.webview);
    this.activeWebviews.add(webviewPanel.webview);
    const editorEntry = { panel: webviewPanel, document };
    this.activeEditors.add(editorEntry);
    const debugWebviewSubscription = this.dagDebug.attachWebview(webviewPanel.webview, document);
    void this.updateDagDebugContext(document.uri);

    if (this.pendingPipeletPayload) {
      webviewPanel.webview.postMessage({
        type: 'external-pipelet-drag-start',
        payload: this.pendingPipeletPayload,
      });
    }

    const updateWebview = () => {
      try {
        const data = JSON.parse(document.getText() || '{}');
        webviewPanel.webview.postMessage({ type: 'update', data });
      } catch {
        const defaultFlow = {
          nodes: [
            { id: 'node-1', type: 'custom', position: { x: 0, y: 0 }, data: { label: 'Input' } },
            { id: 'node-2', type: 'custom', position: { x: 0, y: 200 }, data: { label: 'Process' } },
            { id: 'node-3', type: 'custom', position: { x: 0, y: 400 }, data: { label: 'Output' } },
          ],
          edges: [
            { id: 'edge-1-2', source: 'node-1', target: 'node-2', sourceHandle: 'output', targetHandle: 'input' },
            { id: 'edge-2-3', source: 'node-2', target: 'node-3', sourceHandle: 'output', targetHandle: 'input' },
          ],
        };
        webviewPanel.webview.postMessage({ type: 'update', data: defaultFlow });
      }
    };

    let lastAppliedContent: string | null = null;

    const changeDocumentSubscription = vscode.workspace.onDidChangeTextDocument(
      (e) => {
        if (e.document.uri.toString() !== document.uri.toString()) { return; }
        const currentText = document.getText();
        // Skip if this change was applied by us (webview → document sync)
        if (lastAppliedContent !== null && currentText === lastAppliedContent) {
          lastAppliedContent = null;
          return;
        }
        lastAppliedContent = null;
        updateWebview();
      }
    );

    const viewStateSubscription = webviewPanel.onDidChangeViewState(() => {
      if (webviewPanel.active) {
        void this.updateDagDebugContext(document.uri);
      }
    });

    webviewPanel.onDidDispose(() => {
      changeDocumentSubscription.dispose();
      debugWebviewSubscription.dispose();
      viewStateSubscription.dispose();
      this.activeWebviews.delete(webviewPanel.webview);
      this.activeEditors.delete(editorEntry);
      void this.updateDagDebugContext();
    });

    webviewPanel.webview.onDidReceiveMessage((message) => {
      if (message.type === 'ready') {
        updateWebview();
        // Send pending goto-node if this editor was opened via open-flow-and-goto-node
        if (this.pendingGotoNode) {
          const pending = this.pendingGotoNode;
          this.pendingGotoNode = null;
          setTimeout(() => {
            webviewPanel.webview.postMessage({ type: 'goto-node', nodeId: pending.nodeId });
          }, 300);
        }
        // Scan workspace for .pipelet files and send the list to the webview
        void this.readPipeletFiles().then((files) => {
          webviewPanel.webview.postMessage({ type: 'pipelet-files', files });
        });
        // Scan workspace for .webform files and send the list to the webview
        void vscode.workspace.findFiles('**/*.webform', '**/node_modules/**').then((uris) => {
          const files = uris
            .map((uri) => ({
              name: uri.fsPath.split('/').pop()?.replace(/\.webform$/i, '') ?? '',
              uri: uri.toString(),
            }))
            .filter((f) => f.name);
          webviewPanel.webview.postMessage({ type: 'webform-files', files });
        });
      }

      if (message.type === 'request-pipelet-files') {
        void this.readPipeletFiles().then((files) => {
          webviewPanel.webview.postMessage({ type: 'pipelet-files', files });
        });
      }

      if (message.type === 'request-webform-files') {
        void vscode.workspace.findFiles('**/*.webform', '**/node_modules/**').then((uris) => {
          const files = uris
            .map((uri) => ({
              name: uri.fsPath.split('/').pop()?.replace(/\.webform$/i, '') ?? '',
              uri: uri.toString(),
            }))
            .filter((f) => f.name);
          webviewPanel.webview.postMessage({ type: 'webform-files', files });
        });
      }

      if (message.type === 'open-flow-and-goto-node'
          && typeof message.flow === 'string'
          && typeof message.nodeId === 'string') {
        void this.handleOpenFlowAndGotoNode(String(message.flow), String(message.nodeId));
      }

      if (message.type === 'request-flow-start-nodes') {
        void this.fetchFlowsFromEngine()
          .then((data) => {
            webviewPanel.webview.postMessage({
              type: 'flow-start-nodes-response',
              data,
            });
          })
          .catch((err: Error) => {
            webviewPanel.webview.postMessage({
              type: 'flow-start-nodes-response',
              data: { success: false, flows: [], error: err.message },
            });
          });
      }

      if (message.type === 'flow-changed') {
        const mergedFlow = this.mergeFlowWithCurrentDocument(document, message.data);
        const newContent = JSON.stringify(mergedFlow, null, 2);
        lastAppliedContent = newContent;
        void this.updateDocument(document, mergedFlow, newContent);
      }

      if (message.type === 'request-save') {
        void this.bumpFlowVersionAndSave(document);
      }

      if (message.type === 'save') {
        // legacy fallback
        const mergedFlow = this.mergeFlowWithCurrentDocument(document, message.data);
        const newContent = JSON.stringify(mergedFlow, null, 2);
        lastAppliedContent = newContent;
        void this.updateDocument(document, mergedFlow, newContent).then(async () => {
          await document.save();
        });
      }

      if (message.type === 'pipelet-dropped' && typeof message.name === 'string') {
        void vscode.window.showInformationMessage(
          `Pipelet dropped on flow: ${message.name}`
        );
      }

      if (message.type === 'node-selected' && message.id) {
        const nodeType = String(message.nodeType ?? 'custom');
        void this.buildNodeDetailContext(document, nodeType).then((context) => {
          this.nodeDetail.showNode({
            id: String(message.id),
            nodeType,
            data: (message.data as Record<string, unknown>) ?? {},
            context,
          }, webviewPanel.webview);
        });
      }

      if (message.type === 'start-flow' && typeof message.nodeId === 'string') {
        void this.handleStartFlow(document, message.nodeId);
      }

      if (message.type === 'start-flow-debug' && typeof message.nodeId === 'string') {
        void this.handleStartFlowWithDebug(document, message.nodeId);
      }

      if (message.type === 'dag-debug-toggle-breakpoint' && typeof message.nodeId === 'string') {
        void this.dagDebug.toggleBreakpoint(document, {
          nodeId: message.nodeId,
          nodeLabel: typeof message.nodeLabel === 'string' ? message.nodeLabel : undefined,
          condition: typeof message.condition === 'string' ? message.condition : undefined,
        });
      }

      if (message.type === 'dag-debug-command' && typeof message.command === 'string') {
        void this.dagDebug.sendCommand(message.command as DagCommandType, (message.payload as Record<string, unknown> | undefined) ?? undefined);
      }

      // ── HTTP Method Call Node ──────────────────────────────────────────────
      if (message.type === 'http-call-execute' && typeof message.url === 'string') {
        void this.executeHttpCall(
          webviewPanel.webview,
          String(message.nodeId ?? ''),
          String(message.method ?? 'GET'),
          String(message.url),
          (message.headers as Record<string, string> | undefined) ?? {},
          typeof message.body === 'string' ? message.body : undefined,
          typeof message.baseUrl === 'string' ? message.baseUrl : undefined,
        );
      }

      if (message.type === 'request-api-token' && typeof message.baseUrl === 'string') {
        const tokens = this.readAuthTokens();
        const key = this.normalizeBaseUrl(message.baseUrl);
        const token = tokens[key]?.token ?? null;
        webviewPanel.webview.postMessage({
          type: 'api-token-response',
          reqId: message.reqId,
          baseUrl: message.baseUrl,
          token,
        });
      }

      if (message.type === 'store-api-token'
          && typeof message.baseUrl === 'string'
          && typeof message.token === 'string') {
        this.writeAuthToken(message.baseUrl, message.token);
        webviewPanel.webview.postMessage({
          type: 'api-token-stored',
          baseUrl: message.baseUrl,
        });
      }
    });

  }

  private async toggleDebugMode(uri?: vscode.Uri): Promise<void> {
    const entry = this.findEditorEntry(uri);
    if (!entry) {
      void vscode.window.showWarningMessage('Open a .flow file with Flow Node Editor to toggle DAG debug mode.');
      await this.updateDagDebugContext();
      return;
    }
    await this.dagDebug.toggleDebugMode(entry.document);
    await this.updateDagDebugContext(entry.document.uri);
  }

  private async setDebugMode(uri: vscode.Uri | undefined, enabled: boolean): Promise<void> {
    const entry = this.findEditorEntry(uri);
    if (!entry) {
      void vscode.window.showWarningMessage('Open a .flow file with Flow Node Editor to toggle DAG debug mode.');
      await this.updateDagDebugContext();
      return;
    }

    if (enabled) {
      await this.dagDebug.enableDebugMode(entry.document);
    } else {
      await this.dagDebug.disableDebugMode(entry.document);
    }
    await this.updateDagDebugContext(entry.document.uri);
  }

  private async updateDagDebugContext(uri?: vscode.Uri): Promise<void> {
    const entry = this.findEditorEntry(uri);
    const active = entry ? this.dagDebug.isDebugModeActive(entry.document) : false;
    await vscode.commands.executeCommand('setContext', 'reactdnd.dagDebugModeActive', active);
  }

  private findEditorEntry(uri?: vscode.Uri): { panel: vscode.WebviewPanel; document: vscode.TextDocument } | undefined {
    if (uri) {
      const uriString = uri.toString();
      const byUri = Array.from(this.activeEditors).find((entry) => entry.document.uri.toString() === uriString);
      if (byUri) { return byUri; }
    }
    return Array.from(this.activeEditors).find((entry) => entry.panel.active)
      ?? Array.from(this.activeEditors).find((entry) => entry.panel.visible)
      ?? Array.from(this.activeEditors)[0];
  }

  private async handleOpenFlowAndGotoNode(flowName: string, nodeId: string): Promise<void> {
    const pattern = `**/${flowName}.flow`;
    const uris = await vscode.workspace.findFiles(pattern, '**/node_modules/**', 1);
    if (uris.length === 0) {
      void vscode.window.showWarningMessage(`Flow file not found: ${flowName}.flow`);
      return;
    }
    this.pendingGotoNode = { nodeId };
    await vscode.commands.executeCommand('vscode.openWith', uris[0], FlowEditorProvider.viewType);
  }

  private async handleStartFlow(document: vscode.TextDocument, nodeId: string): Promise<void> {
    if (this.dagDebug.isDebugModeActive(document)) {
      const flowData = await this.prepareFlowForRun(document, nodeId);
      if (!flowData) { return; }
      await this.dagDebug.startWithDebug(document, nodeId, flowData);
      return;
    }

    // 1. Parse current flow JSON and inject startNodeId
    let flowData: Record<string, unknown>;
    try {
      flowData = JSON.parse(document.getText() || '{}') as Record<string, unknown>;
    } catch {
      void vscode.window.showErrorMessage('Flow file contains invalid JSON.');
      return;
    }

    flowData.startNodeId = nodeId;

    // 2. Merge saved node configs (script, label, etc.) into each node's data
    const nodes = Array.isArray(flowData.nodes)
      ? (flowData.nodes as Array<Record<string, unknown>>)
      : [];

    const mergedNodes = await Promise.all(
      nodes.map(async (node) => {
        const nid = typeof node.id === 'string' ? node.id : null;
        if (!nid) { return node; }
        const savedConfig = await this.loadNodeConfig(nid);
        if (!savedConfig) { return node; }
        return {
          ...node,
          data: { ...(node.data as Record<string, unknown> ?? {}), ...savedConfig },
        };
      })
    );

    flowData.nodes = mergedNodes;

    // 3. Persist the updated JSON back to the file
    await this.updateDocument(document, flowData);
    await vscode.commands.executeCommand('workbench.action.files.save');

    // 3. POST to http://localhost:3033/flow/run
    const body = JSON.stringify(flowData);
    const result = await new Promise<string>((resolve, reject) => {
      const req = http.request(
        {
          hostname: 'localhost',
          port: 3033,
          path: '/flow/run',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(body),
          },
        },
        (res) => {
          let data = '';
          res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
          res.on('end', () => resolve(data));
        }
      );
      req.on('error', reject);
      req.write(body);
      req.end();
    }).catch((err: Error) => `Error: ${err.message}`);

    // 4. Show response as notification
    void vscode.window.showInformationMessage(`Flow run response: ${result}`);
  }

  private async handleStartFlowWithDebug(document: vscode.TextDocument, nodeId: string): Promise<void> {
    const flowData = await this.prepareFlowForRun(document, nodeId);
    if (!flowData) { return; }
    await this.dagDebug.enableDebugMode(document);
    await this.dagDebug.startWithDebug(document, nodeId, flowData);
  }

  private async prepareFlowForRun(document: vscode.TextDocument, nodeId: string): Promise<Record<string, unknown> | null> {
    let flowData: Record<string, unknown>;
    try {
      flowData = JSON.parse(document.getText() || '{}') as Record<string, unknown>;
    } catch {
      void vscode.window.showErrorMessage('Flow file contains invalid JSON.');
      return null;
    }

    flowData.startNodeId = nodeId;

    const nodes = Array.isArray(flowData.nodes)
      ? (flowData.nodes as Array<Record<string, unknown>>)
      : [];

    flowData.nodes = await Promise.all(
      nodes.map(async (node) => {
        const nid = typeof node.id === 'string' ? node.id : null;
        if (!nid) { return node; }
        const savedConfig = await this.loadNodeConfig(nid);
        if (!savedConfig) { return node; }
        return {
          ...node,
          data: { ...(node.data as Record<string, unknown> ?? {}), ...savedConfig },
        };
      })
    );

    await this.updateDocument(document, flowData);
    await vscode.commands.executeCommand('workbench.action.files.save');
    return flowData;
  }

  private loadNodeConfig(nodeId: string): Promise<Record<string, unknown> | null> {
    return NodeDetailViewProvider.loadNodeConfig(nodeId);
  }

  private mergeFlowWithCurrentDocument(document: vscode.TextDocument, nextFlow: unknown): Record<string, unknown> {
    const current = this.readFlowObject(document.getText());
    const next = typeof nextFlow === 'object' && nextFlow !== null
      ? nextFlow as Record<string, unknown>
      : {};
    return {
      ...current,
      ...next,
    };
  }

  private readFlowObject(text: string): Record<string, unknown> {
    try {
      const parsed = JSON.parse(text || '{}');
      return typeof parsed === 'object' && parsed !== null
        ? parsed as Record<string, unknown>
        : {};
    } catch {
      return {};
    }
  }

  private async bumpFlowVersionAndSave(document: vscode.TextDocument): Promise<void> {
    const current = this.readFlowObject(document.getText());
    const existingVersion = typeof current.version === 'number' && Number.isFinite(current.version)
      ? Math.max(0, Math.floor(current.version))
      : 0;
    const next = {
      ...current,
      version: existingVersion + 1,
      updatedAt: new Date().toISOString(),
    };
    await this.updateDocument(document, next, JSON.stringify(next, null, 2));
    await document.save();
  }

  private fetchFlowsFromEngine(): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const req = http.request(
        {
          hostname: 'localhost',
          port: 3033,
          path: '/flows',
          method: 'GET',
          timeout: 5000,
        },
        (res) => {
          let out = '';
          res.on('data', (chunk: Buffer) => { out += chunk.toString(); });
          res.on('end', () => {
            if ((res.statusCode ?? 500) >= 400) {
              reject(new Error(`HTTP ${res.statusCode ?? 500}`));
              return;
            }
            try {
              resolve(JSON.parse(out));
            } catch {
              resolve({ success: false, flows: [] });
            }
          });
        }
      );
      req.on('timeout', () => req.destroy(new Error('Request timeout')));
      req.on('error', reject);
      req.end();
    });
  }

  /** Node tipine gore dokuman/motor kaynakli baglami toplar. */
  private async buildNodeDetailContext(
    document: vscode.TextDocument,
    nodeType: string,
  ): Promise<NodeDetailContext | undefined> {
    if (nodeType === 'jump') {
      return { flowNodes: this.readFlowNodes(document) };
    }
    if (nodeType === 'call') {
      try {
        const raw = await this.fetchFlowsFromEngine() as {
          flows?: Array<{ name?: string; startNodes?: Array<{ id?: string; label?: string }>; startNodeIds?: string[] }>;
        };
        const flows = (raw.flows ?? []).map((flow) => {
          const fromStartNodes = (flow.startNodes ?? [])
            .map((n) => ({ id: String(n.id ?? ''), label: String(n.label ?? n.id ?? '') }))
            .filter((n) => n.id);
          const fromIds = (flow.startNodeIds ?? []).map((fid) => ({ id: String(fid), label: String(fid) }));
          return {
            name: String(flow.name ?? 'Unnamed Flow'),
            startNodes: fromStartNodes.length > 0 ? fromStartNodes : fromIds,
          };
        });
        return { flows };
      } catch {
        return { flows: [] };
      }
    }
    return undefined;
  }

  /** Acik .flow dokumanindaki node'lari id/label/tip uclusu olarak okur. */
  private readFlowNodes(document: vscode.TextDocument): Array<{ id: string; label: string; nodeType: string }> {
    try {
      const parsed = JSON.parse(document.getText()) as {
        nodes?: Array<{ id?: string; type?: string; data?: { label?: string } }>;
      };
      return (parsed.nodes ?? [])
        .filter((n) => typeof n.id === 'string')
        .map((n) => ({
          id: String(n.id),
          label: String(n.data?.label ?? n.id),
          nodeType: String(n.type ?? 'custom'),
        }));
    } catch {
      return [];
    }
  }

  // ── Auth token helpers ───────────────────────────────────────────────────────

  private authConfigPath(): string | undefined {
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    return root ? path.join(root, '.openapi-auth.json') : undefined;
  }

  private readAuthTokens(): Record<string, { token: string; storedAt: string }> {
    const cfgPath = this.authConfigPath();
    if (!cfgPath) { return {}; }
    try {
      const raw = fs.readFileSync(cfgPath, 'utf8');
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      return (typeof parsed.tokens === 'object' && parsed.tokens !== null)
        ? parsed.tokens as Record<string, { token: string; storedAt: string }>
        : {};
    } catch {
      return {};
    }
  }

  private writeAuthToken(baseUrl: string, token: string): void {
    const cfgPath = this.authConfigPath();
    if (!cfgPath) { return; }
    const existing = this.readAuthTokens();
    const key = this.normalizeBaseUrl(baseUrl);
    existing[key] = { token, storedAt: new Date().toISOString() };
    try {
      fs.writeFileSync(cfgPath, JSON.stringify({ tokens: existing }, null, 2), 'utf8');
    } catch { /* read-only workspace */ }
  }

  normalizeBaseUrl(baseUrl: string): string {
    try {
      const u = new URL(baseUrl);
      return `${u.protocol}//${u.host}`;
    } catch {
      return baseUrl;
    }
  }

  // ── HTTP Method Call executor ─────────────────────────────────────────────

  public getApiToken(baseUrl: string): string | undefined {
    const tokens = this.readAuthTokens();
    return tokens[this.normalizeBaseUrl(baseUrl)]?.token;
  }

  public storeApiTokenFor(baseUrl: string, token: string): void {
    this.writeAuthToken(baseUrl, token);
  }

  public async executeHttpCallRequest(req: HttpCallRequest): Promise<{ status: number; body: string }> {
    const headers: Record<string, string> = { ...req.headers };
    if (req.baseUrl) {
      const stored = this.getApiToken(req.baseUrl);
      if (stored) { headers['Authorization'] = stored; }
    }

    try {
      const parsed = new URL(req.url);
      const isHttps = parsed.protocol === 'https:';
      const transport = isHttps ? https : http;
      const port = parsed.port ? parseInt(parsed.port, 10) : (isHttps ? 443 : 80);

      const bodyBuf = req.body ? Buffer.from(req.body, 'utf8') : undefined;
      if (bodyBuf) { headers['Content-Length'] = String(bodyBuf.length); }

      return await new Promise<{ status: number; body: string }>((resolve, reject) => {
        const request = transport.request(
          {
            hostname: parsed.hostname,
            port,
            path: `${parsed.pathname}${parsed.search}`,
            method: req.method.toUpperCase(),
            headers,
            timeout: 15000,
          },
          (res) => {
            let out = '';
            res.on('data', (chunk: Buffer) => { out += chunk.toString(); });
            res.on('end', () => resolve({ status: res.statusCode ?? 0, body: out }));
          },
        );
        request.on('timeout', () => request.destroy(new Error('Request timeout')));
        request.on('error', reject);
        if (bodyBuf) { request.write(bodyBuf); }
        request.end();
      });
    } catch (err) {
      return { status: 0, body: `Error: ${(err as Error).message}` };
    }
  }

  private async executeHttpCall(
    webview: vscode.Webview,
    nodeId: string,
    method: string,
    url: string,
    extraHeaders: Record<string, string>,
    body: string | undefined,
    baseUrl: string | undefined,
  ): Promise<void> {
    const result = await this.executeHttpCallRequest({ method, url, headers: extraHeaders, body, baseUrl });
    void webview.postMessage({
      type: 'http-call-response',
      nodeId,
      status: result.status,
      body: result.body,
    });
  }

  private async updateDocument(document: vscode.TextDocument, data: unknown, preSerialised?: string): Promise<void> {
    const content = preSerialised ?? JSON.stringify(data, null, 2);
    const edit = new vscode.WorkspaceEdit();
    edit.replace(
      document.uri,
      new vscode.Range(0, 0, document.lineCount, 0),
      content
    );
    await vscode.workspace.applyEdit(edit);
  }

  private async readPipeletFiles(): Promise<PipeletDetailEntry[]> {
    const uris = await vscode.workspace.findFiles('**/*.pipelet', '**/node_modules/**');
    const entries = await Promise.all(uris.map(async (uri) => {
      const bytes = await vscode.workspace.fs.readFile(uri);
      const content = Buffer.from(bytes).toString('utf-8');
      const parsed = this.parsePipeletContent(content);
      const name = parsed.name || uri.fsPath.split('/').pop()?.replace(/\.pipelet$/i, '') || 'unknown';
      const handlerUri = parsed.handler ? await this.resolvePipeletHandlerUri(uri, parsed.handler) : undefined;
      return {
        name,
        uri: uri.toString(),
        content,
        handler: parsed.handler,
        handlerUri,
        inputs: parsed.inputs,
        outputs: parsed.outputs,
        ai: parsed.ai,
      } satisfies PipeletDetailEntry;
    }));
    return entries.sort((a, b) => a.name.localeCompare(b.name));
  }

  private parsePipeletContent(content: string): { name?: string; handler?: string; inputs: Record<string, string>; outputs: Record<string, string>; ai?: Record<string, unknown> } {
    const result: { name?: string; handler?: string; inputs: Record<string, string>; outputs: Record<string, string>; ai?: Record<string, unknown> } = { inputs: {}, outputs: {} };
    let section: 'inputs' | 'outputs' | 'ai' | undefined;
    let aiListKey: string | undefined;
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.replace(/\s+#.*$/, '');
      const topLevel = line.match(/^([A-Za-z][\w-]*)\s*:\s*(.*?)\s*$/);
      if (topLevel && !/^\s/.test(line)) {
        section = undefined;
        aiListKey = undefined;
        const [, key, value] = topLevel;
        if (key === 'name' && value) { result.name = this.unquote(value); }
        if ((key === 'handler' || key === 'function' || key === 'functionHandler') && value) { result.handler = this.unquote(value); }
        if (key === 'inputs' || key === 'outputs' || key === 'ai') {
          section = key;
          if (key === 'ai') { result.ai = {}; }
        }
        continue;
      }
      const field = line.match(/^\s{2,}([A-Za-z][\w-]*)\s*:\s*(.*?)\s*$/);
      if (field && (section === 'inputs' || section === 'outputs')) {
        result[section][field[1]] = this.unquote(field[2]);
      } else if (field && section === 'ai') {
        result.ai ??= {};
        aiListKey = undefined;
        const [, key, value] = field;
        if (value) {
          result.ai[key] = this.parseScalarOrInlineList(value);
        } else if (key === 'tags' || key === 'capabilities') {
          result.ai[key] = [];
          aiListKey = key;
        }
      }
      const listItem = line.match(/^\s{4,}-\s*(.*?)\s*$/);
      if (listItem && section === 'ai' && aiListKey && Array.isArray(result.ai?.[aiListKey])) {
        (result.ai[aiListKey] as string[]).push(this.unquote(listItem[1]));
      }
    }
    return result;
  }

  private parseScalarOrInlineList(value: string): string | string[] {
    const trimmed = value.trim();
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      return trimmed.slice(1, -1).split(',').map((item) => this.unquote(item)).filter(Boolean);
    }
    return this.unquote(trimmed);
  }

  private unquote(value: string): string {
    return value.trim().replace(/^['"]|['"]$/g, '');
  }

  private async resolvePipeletHandlerUri(pipeletUri: vscode.Uri, handler: string): Promise<string | undefined> {
    const handlerUri = vscode.Uri.file(path.resolve(path.dirname(pipeletUri.fsPath), handler));
    try {
      const stat = await vscode.workspace.fs.stat(handlerUri);
      return stat.type === vscode.FileType.File ? handlerUri.toString() : undefined;
    } catch {
      return undefined;
    }
  }

  private getHtmlForWebview(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview.js')
    );
    const nonce = getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none';
             style-src 'unsafe-inline';
             script-src 'nonce-${nonce}';
             connect-src ws://localhost:3033 http://localhost:3033 http://localhost:4000 ws://localhost:4001 http://localhost:9240;" />
  <title>Flow Editor</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body, #root { width: 100%; height: 100%; overflow: hidden; }
  </style>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

function getNonce(): string {
  let text = '';
  const possible =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
