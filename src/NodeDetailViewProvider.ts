import * as vscode from 'vscode';
import * as path from 'path';

export interface PipeletDetailEntry {
  name: string;
  uri: string;
  content: string;
  handler?: string;
  handlerUri?: string;
  inputs: Record<string, string>;
  outputs: Record<string, string>;
  ai?: Record<string, unknown>;
}

export interface NodeDetailContext {
  /** workspace kaynakli - NodeDetailViewProvider doldurur */
  pipeletFiles?: PipeletDetailEntry[];
  webformFiles?: Array<{ name: string; uri: string }>;
  /** dokuman kaynakli - FlowEditorProvider doldurur */
  flowNodes?: Array<{ id: string; label: string; nodeType: string }>;
  flows?: Array<{ name: string; startNodes: Array<{ id: string; label: string }> }>;
}

export interface NodeDetailPayload {
  id: string;
  nodeType: string;
  data: Record<string, unknown>;
  context?: NodeDetailContext;
}

export interface HttpCallRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: string;
  baseUrl?: string;
}

/** Panelin eklenti host'undaki flow editorune eristigi dar arayuz */
export interface FlowHost {
  executeHttpCallRequest(req: HttpCallRequest): Promise<{ status: number; body: string }>;
  getApiToken(baseUrl: string): string | undefined;
  storeApiTokenFor(baseUrl: string, token: string): void;
}

function getNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let r = '';
  for (let i = 0; i < 32; i++) r += chars[Math.floor(Math.random() * chars.length)];
  return r;
}

export class NodeDetailViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'reactdnd.nodeDetailView';
  private _view?: vscode.WebviewView;
  private _activeFlowWebview?: vscode.Webview;
  private _flowHost?: FlowHost;

  constructor(private readonly context: vscode.ExtensionContext) {}

  setFlowHost(host: FlowHost): void {
    this._flowHost = host;
  }

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this._view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, 'dist')],
    };
    webviewView.webview.html = this.buildHtml(webviewView.webview);

    webviewView.webview.onDidReceiveMessage((msg) => {
      if (msg.type === 'save-node' && typeof msg.id === 'string') {
        const fields = (msg.fields ?? {}) as Record<string, unknown>;
        void this.saveNodeConfig(msg.id, fields);
        // Update the node data live on the flow canvas
        if (this._activeFlowWebview) {
          void this._activeFlowWebview.postMessage({
            type: 'update-node-data',
            id: msg.id,
            data: fields,
          });
        }
      }

      if (msg.type === 'http-call-execute' && this._flowHost) {
        const req: HttpCallRequest = {
          method: String(msg.method ?? 'GET'),
          url: String(msg.url ?? ''),
          headers: (msg.headers as Record<string, string> | undefined) ?? {},
          body: typeof msg.body === 'string' ? msg.body : undefined,
          baseUrl: typeof msg.baseUrl === 'string' ? msg.baseUrl : undefined,
        };
        void this._flowHost.executeHttpCallRequest(req).then((result) => {
          void webviewView.webview.postMessage({
            type: 'http-call-response',
            nodeId: msg.nodeId,
            status: result.status,
            body: result.body,
          });
        });
      }

      if (msg.type === 'request-api-token' && typeof msg.baseUrl === 'string' && this._flowHost) {
        void webviewView.webview.postMessage({
          type: 'api-token-response',
          reqId: msg.reqId,
          baseUrl: msg.baseUrl,
          token: this._flowHost.getApiToken(msg.baseUrl) ?? null,
        });
      }

      if (msg.type === 'store-api-token'
          && typeof msg.baseUrl === 'string'
          && typeof msg.token === 'string'
          && this._flowHost) {
        this._flowHost.storeApiTokenFor(msg.baseUrl, msg.token);
        void webviewView.webview.postMessage({
          type: 'api-token-stored',
          baseUrl: msg.baseUrl,
        });
      }
    });
  }

  showNode(payload: NodeDetailPayload, flowWebview?: vscode.Webview): void {
    if (!this._view) return;
    this._activeFlowWebview = flowWebview;
    this._view.show(true);

    const sendPayload = async (base: NodeDetailPayload) => {
      const context: NodeDetailContext = { ...(base.context ?? {}) };
      if (base.nodeType === 'approval') {
        context.webformFiles = await this.readWebformFiles();
      }
      if (base.nodeType === 'process') {
        context.pipeletFiles = await this.readPipeletFiles();
      }
      void this._view!.webview.postMessage({
        type: 'show-node',
        payload: { ...base, context },
      });
    };

    // Load saved config and merge before sending to webview
    void this.loadNodeConfig(payload.id).then((saved) => {
      const merged: NodeDetailPayload = saved
        ? { ...payload, data: { ...payload.data, ...saved } }
        : payload;
      sendPayload(merged);
    });
  }

  static getConfigDir(): vscode.Uri | null {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) { return null; }
    return vscode.Uri.joinPath(folders[0].uri, '.nodeconfig');
  }

  static async loadNodeConfig(nodeId: string): Promise<Record<string, unknown> | null> {
    const configDir = NodeDetailViewProvider.getConfigDir();
    if (!configDir) { return null; }
    const configFile = vscode.Uri.joinPath(configDir, `${nodeId}.json`);
    try {
      const bytes = await vscode.workspace.fs.readFile(configFile);
      return JSON.parse(Buffer.from(bytes).toString('utf-8')) as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  private async saveNodeConfig(nodeId: string, fields: Record<string, unknown>): Promise<void> {
    const configDir = NodeDetailViewProvider.getConfigDir();
    if (!configDir) {
      void vscode.window.showErrorMessage('No workspace folder open.');
      return;
    }
    try {
      await vscode.workspace.fs.createDirectory(configDir);
    } catch { /* already exists */ }
    const configFile = vscode.Uri.joinPath(configDir, `${nodeId}.json`);
    const content = JSON.stringify(fields, null, 2);
    await vscode.workspace.fs.writeFile(configFile, Buffer.from(content, 'utf-8'));
    void vscode.window.showInformationMessage(`Node "${nodeId}" config saved.`);
  }

  private async loadNodeConfig(nodeId: string): Promise<Record<string, unknown> | null> {
    return NodeDetailViewProvider.loadNodeConfig(nodeId);
  }

  private async readWebformFiles(): Promise<Array<{ name: string; uri: string }>> {
    const uris = await vscode.workspace.findFiles('**/*.webform', '**/node_modules/**');
    return uris
      .map((uri) => ({
        name: uri.fsPath.split('/').pop()?.replace(/\.webform$/i, '') ?? '',
        uri: uri.toString(),
      }))
      .filter((f) => f.name);
  }

  private async readPipeletFiles(): Promise<PipeletDetailEntry[]> {
    const uris = await vscode.workspace.findFiles('**/*.pipelet', '**/node_modules/**');
    const entries = await Promise.all(uris.map(async (uri) => {
      const contentBytes = await vscode.workspace.fs.readFile(uri);
      const content = Buffer.from(contentBytes).toString('utf-8');
      const parsed = this.parsePipeletContent(content);
      const name = parsed.name || uri.fsPath.split('/').pop()?.replace(/\.pipelet$/i, '') || 'unknown';
      const handler = parsed.handler;
      const handlerUri = handler ? await this.resolvePipeletHandlerUri(uri, handler) : undefined;
      return {
        name,
        uri: uri.toString(),
        content,
        handler,
        handlerUri,
        inputs: parsed.inputs,
        outputs: parsed.outputs,
        ai: parsed.ai,
      } satisfies PipeletDetailEntry;
    }));
    return entries.sort((a, b) => a.name.localeCompare(b.name));
  }

  private parsePipeletContent(content: string): { name?: string; handler?: string; inputs: Record<string, string>; outputs: Record<string, string>; ai?: Record<string, unknown> } {
    const result: { name?: string; handler?: string; inputs: Record<string, string>; outputs: Record<string, string>; ai?: Record<string, unknown> } = {
      inputs: {},
      outputs: {},
    };
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

  private buildHtml(webview: vscode.Webview): string {
    const nonce = getNonce();
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'nodeDetail.js')
    );

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <meta http-equiv="Content-Security-Policy"
        content="default-src 'none'; style-src 'unsafe-inline' ${webview.cspSource}; script-src 'nonce-${nonce}' ${webview.cspSource};"/>
  <title>Node Detail</title>
  <style>body{margin:0;padding:0;}</style>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}
