import * as vscode from 'vscode';
import * as http from 'http';
import { basename } from 'path';
import WebSocket from 'ws';
import { DagBreakpoint, DagCommandType, DagDebugConfig, DagDebugEventEnvelope, breakpointKey } from './dagDebugTypes';
import { getWorkspaceIdentity } from './workspaceIdentity';
import { OrchestratorClient } from './OrchestratorClient';
import { SocketIoDagDebugBridge } from './SocketIoDagDebugBridge';

interface WebviewEntry {
  webview: vscode.Webview;
  documentUri: string;
  flowId: string;
}

export class DagDebugService implements vscode.Disposable {
  private readonly output = vscode.window.createOutputChannel('DAG Flow Debug');
  private readonly webviews = new Set<WebviewEntry>();
  private readonly breakpoints = new Map<string, DagBreakpoint>();
  private readonly client: OrchestratorClient;
  private readonly socketBridge: SocketIoDagDebugBridge;
  private readonly debugModeFlowIds = new Set<string>();
  private sessionId: string | undefined;
  private activeFlowId: string | undefined;
  private activeFlowRunId: string | undefined;

  constructor(private readonly context: vscode.ExtensionContext) {
    const config = this.readConfig();
    this.client = new OrchestratorClient(config.orchestratorUrl);
    this.socketBridge = new SocketIoDagDebugBridge(config, this.output, (event) => this.handleDebugEvent(event));
    this.socketBridge.setActiveWorkspace(config.workspaceId);
    this.context.subscriptions.push(this.output);
    this.socketBridge.connect();
  }

  isDebugModeActive(document: vscode.TextDocument): boolean {
    return this.debugModeFlowIds.has(this.flowIdForDocument(document));
  }

  async toggleDebugMode(document: vscode.TextDocument): Promise<void> {
    if (this.isDebugModeActive(document)) {
      await this.disableDebugMode(document);
      return;
    }
    await this.enableDebugMode(document);
  }

  attachWebview(webview: vscode.Webview, document: vscode.TextDocument): vscode.Disposable {
    const entry: WebviewEntry = {
      webview,
      documentUri: document.uri.toString(),
      flowId: this.flowIdForDocument(document),
    };
    this.webviews.add(entry);
    this.postState(entry);
    return new vscode.Disposable(() => this.webviews.delete(entry));
  }

  async setBreakpoint(document: vscode.TextDocument, input: { nodeId: string; nodeLabel?: string; condition?: string }): Promise<void> {
    const flowId = this.flowIdForDocument(document);
    const config = this.readConfig();
    const sessionId = this.debugModeFlowIds.has(flowId) ? await this.ensureSession(flowId) : '';
    const key = breakpointKey(flowId, input.nodeId);
    const existing = this.breakpoints.get(key);
    if (existing?.enabled) {
      this.broadcastState();
      return;
    }

    const breakpoint: DagBreakpoint = {
      id: existing?.id,
      sessionId,
      workspaceId: config.workspaceId,
      service: config.service,
      runtime: 'dag',
      flowId,
      file: this.flowFileForDocument(document),
      nodeId: input.nodeId,
      nodeLabel: input.nodeLabel,
      condition: input.condition,
      enabled: true,
      verified: this.debugModeFlowIds.has(flowId) ? undefined : false,
    };
    this.breakpoints.set(key, breakpoint);
    await this.syncFlowEngineBreakpoints(flowId);
    this.broadcastState();
  }

  async removeBreakpoint(document: vscode.TextDocument, input: { nodeId: string }): Promise<void> {
    const flowId = this.flowIdForDocument(document);
    const key = breakpointKey(flowId, input.nodeId);
    const existing = this.breakpoints.get(key);
    this.breakpoints.delete(key);
    await this.syncFlowEngineBreakpoints(flowId);
    this.broadcastState();
  }

  async toggleBreakpoint(document: vscode.TextDocument, input: { nodeId: string; nodeLabel?: string; condition?: string }): Promise<void> {
    const key = breakpointKey(this.flowIdForDocument(document), input.nodeId);
    if (this.breakpoints.get(key)?.enabled) {
      await this.removeBreakpoint(document, { nodeId: input.nodeId });
      return;
    }
    await this.setBreakpoint(document, input);
  }

  async enableDebugMode(document: vscode.TextDocument): Promise<void> {
    const flowId = this.flowIdForDocument(document);
    let sessionId = await this.ensureSession(flowId);
    const config = this.readConfig();
    this.debugModeFlowIds.add(flowId);
    this.activeFlowId = flowId;

    const flowData = this.stripDebugBreakpointsFromFlow(this.readFlowObject(document.getText()));
    const buildModeMessage = (id: string) => ({
      sessionId: id,
      workspaceId: config.workspaceId,
      service: config.service,
      runtime: 'dag',
      flowId,
      enabled: true,
      flow: {
        ...flowData,
        flowId,
        workspaceId: config.workspaceId,
      },
    });

    // Yumurta-tavuk: motor ancak bu mode mesajini alinca agent olarak
    // kaydoluyor, session ise agent kayitli olmadan acilamiyor. Bu yuzden
    // mesaji ONCE gonderiyoruz -- kimligimiz henuz bos olsa bile.
    await this.sendFlowEngineDebugMode(buildModeMessage(sessionId)).catch((err: Error) => {
      this.output.appendLine(`[dag-debug] flow engine debug mode sync failed: ${err.message}`);
    });

    if (!sessionId) {
      sessionId = await this.openSession(flowId);
      if (sessionId) {
        // Motor bos kimlik gordugunde kendi kimligini uretti; gercek kimligi
        // simdi bildiriyoruz ki oturumunu ona tasisin. Aksi halde bundan sonraki
        // her mesaj (breakpoint'ler, akis baslatma) motorda hicbir oturuma
        // denk gelmez: breakpoint'ler islenmez, akis debug kapali kosar.
        await this.sendFlowEngineDebugMode(buildModeMessage(sessionId)).catch((err: Error) => {
          this.output.appendLine(`[dag-debug] flow engine debug mode re-sync failed: ${err.message}`);
        });
      } else {
        this.output.appendLine('[dag-debug] Could not open an orchestrator session; debug mode is running unattached.');
      }
    }

    this.sessionId = sessionId;
    this.socketBridge.setActiveWorkspace(config.workspaceId);
    this.socketBridge.setActiveSession(sessionId);
    this.applySessionToFlowBreakpoints(flowId, sessionId, config.service, true);
    await this.syncFlowEngineBreakpoints(flowId);

    this.handleDebugEvent({
      type: 'DEBUG_MODE_ENABLED',
      sessionId,
      workspaceId: config.workspaceId,
      service: config.service,
      runtime: 'dag',
      flowId,
      data: { debugMode: true },
    });
    this.broadcastState();
    void vscode.window.showInformationMessage(`DAG debug mode enabled for ${flowId}.`);
  }

  async disableDebugMode(document: vscode.TextDocument): Promise<void> {
    const flowId = this.flowIdForDocument(document);
    if (!this.debugModeFlowIds.has(flowId)) {
      this.broadcastState();
      return;
    }

    const config = this.readConfig();
    const sessionId = this.activeFlowId === flowId ? this.sessionId : undefined;
    this.debugModeFlowIds.delete(flowId);
    this.applySessionToFlowBreakpoints(flowId, '', config.service, false);

    await this.sendFlowEngineDebugMode({
      sessionId,
      workspaceId: config.workspaceId,
      service: config.service,
      runtime: 'dag',
      flowId,
      enabled: false,
    }).catch((err: Error) => {
      this.output.appendLine(`[dag-debug] flow engine debug mode stop failed: ${err.message}`);
    });

    // Session'i acan taraf kapatir. Acan biziz (enableDebugMode -> openSession),
    // dolayisiyla kapatmak da bize dusuyor; aksi halde orkestratorde yasayan
    // session birikir ve sonraki acilis onu yeniden kullanir.
    if (sessionId) {
      await this.client.stopSession({
        sessionId,
        workspaceId: config.workspaceId,
        service: config.service,
        flowId,
      }).catch((err: Error) => {
        this.output.appendLine(`[dag-debug] orchestrator session stop failed: ${err.message}`);
      });
    }

    if (this.activeFlowId === flowId) {
      this.activeFlowId = undefined;
      this.activeFlowRunId = undefined;
      this.sessionId = undefined;
      this.socketBridge.setActiveSession('');
    }

    this.broadcast({
      type: 'dag-debug-event',
      event: {
        type: 'DEBUG_MODE_DISABLED',
        sessionId,
        workspaceId: config.workspaceId,
        service: config.service,
        runtime: 'dag',
        flowId,
        data: { debugMode: false },
      },
    });
    this.broadcastState();
    void vscode.window.showInformationMessage(`DAG debug mode disabled for ${flowId}.`);
  }

  async startWithDebug(document: vscode.TextDocument, nodeId: string, flowData: Record<string, unknown>): Promise<void> {
    const flowId = this.flowIdForDocument(document);
    if (!this.debugModeFlowIds.has(flowId)) {
      await this.enableDebugMode(document);
    }
    const sessionId = await this.ensureSession(flowId);
    const config = this.readConfig();
    const cleanFlowData = this.stripDebugBreakpointsFromFlow(flowData);
    const enrichedFlow = {
      ...cleanFlowData,
      startNodeId: nodeId,
      debug: true,
      debugSessionId: sessionId,
      debugWorkspaceId: config.workspaceId,
      workspaceId: config.workspaceId,
      debugService: config.service,
      runtime: 'dag',
      flowId,
      debugOptions: {
        enabled: true,
        sessionId,
        workspaceId: config.workspaceId,
        service: config.service,
        runtime: 'dag',
        flowId,
      },
    };

    this.handleDebugEvent({
      type: 'FLOW_STARTED',
      sessionId,
      workspaceId: config.workspaceId,
      service: config.service,
      runtime: 'dag',
      flowId,
      nodeId,
      data: { debug: true },
    });

    enrichedFlow.debugOptions = {
      enabled: true,
      sessionId,
      workspaceId: config.workspaceId,
      service: config.service,
      runtime: 'dag',
      flowId,
    };
    await this.syncFlowEngineBreakpoints(flowId);

    try {
      await this.sendFlowEngineStartDebug(enrichedFlow);
      this.output.appendLine('[dag-debug] sent debug start to flow engine over websocket');
    } catch (err) {
      this.output.appendLine(`[dag-debug] flow engine websocket start-debug failed: ${(err as Error).message}`);
      await this.postFlowEngineStartDebug(enrichedFlow);
    }
  }

  async sendCommand(type: DagCommandType, payload?: Record<string, unknown>): Promise<void> {
    const payloadSessionId = typeof payload?.sessionId === 'string' ? payload.sessionId : undefined;
    const payloadFlowId = typeof payload?.flowId === 'string' ? payload.flowId : undefined;
    const payloadFlowRunId = typeof payload?.flowRunId === 'string'
      ? payload.flowRunId
      : typeof payload?.threadId === 'string'
        ? payload.threadId
        : undefined;

    const effectiveSessionId = this.sessionId ?? payloadSessionId;
    if (!effectiveSessionId) {
      void vscode.window.showWarningMessage('No active DAG debug session.');
      return;
    }
    const config = this.readConfig();
    const workspaceId = config.workspaceId;
    const effectiveFlowId = this.activeFlowId ?? payloadFlowId;
    const effectiveFlowRunId = this.activeFlowRunId ?? payloadFlowRunId;
    this.sessionId = effectiveSessionId;
    this.activeFlowId = effectiveFlowId;
    this.activeFlowRunId = effectiveFlowRunId;
    this.socketBridge.setActiveWorkspace(workspaceId);
    this.socketBridge.setActiveSession(effectiveSessionId);
    const command = {
      sessionId: effectiveSessionId,
      workspaceId,
      service: config.service,
      type,
      flowId: effectiveFlowId,
      flowRunId: effectiveFlowRunId,
      threadId: effectiveFlowRunId,
      payload: {
        flowId: effectiveFlowId,
        workspaceId,
        flowRunId: effectiveFlowRunId,
        ...(payload ?? {}),
      },
    };
    // Tek komut yolu: orkestrator. Oradan agent'a (flow engine) HTTP ile iner.
    // Eskiden komut once dogrudan motora, sonra orkestratore gidiyordu; motor
    // ayni durusu iki kez cozmeye calisiyordu.
    try {
      await this.client.sendCommand(command);
    } catch (err) {
      this.output.appendLine(`[dag-debug] orchestrator command failed: ${(err as Error).message}`);
    }
  }

  dispose(): void {
    this.socketBridge.dispose();
  }

  /**
   * Bu akis icin elimizdeki session kimligi. Session ACMAZ -- acma isi
   * enableDebugMode -> openSession yolunda, yani yalnizca kullanici DAG
   * editorunde debug action'ina bastiginda olur.
   */
  private async ensureSession(flowId: string): Promise<string> {
    if (this.sessionId && this.activeFlowId === flowId) {
      return this.sessionId;
    }
    return '';
  }

  /**
   * Orkestrator session'ini acar. Bu, DAG debug oturumunun TEK acilis noktasi.
   *
   * Once agent kaydini bekleriz: agent kayitli degilken session acilirsa
   * orchestrator-client'in resolveSessionService'i sessizce
   * `runtime: 'java', agentUrl: http://localhost:9250` uyduruyor ve yanlis
   * runtime'li bir session olusuyor.
   *
   * register-or-get ucu idempotent: ayni workspace ve servis icin yasayan bir
   * session varsa onu dondurur, yenisini uretmez.
   */
  private async openSession(flowId: string): Promise<string> {
    const config = this.readConfig();
    if (!await this.waitForAgent(config.service)) {
      this.output.appendLine(`[dag-debug] Agent ${config.service} did not register; not opening a session.`);
      return '';
    }

    try {
      const session = await this.client.registerOrGetSession(config.service, flowId, config.workspaceId);
      const sessionId = session.sessionId;
      if (!sessionId) {
        this.output.appendLine('[dag-debug] Orchestrator returned a session without an id.');
        return '';
      }
      this.sessionId = sessionId;
      this.activeFlowId = flowId;
      this.socketBridge.setActiveWorkspace(config.workspaceId);
      this.socketBridge.setActiveSession(sessionId);
      this.broadcastState();
      this.output.appendLine(`[dag-debug] Debug session ${sessionId} opened for flow ${flowId}.`);
      return sessionId;
    } catch (err) {
      this.output.appendLine(`[dag-debug] Opening a debug session failed: ${(err as Error).message}`);
      return '';
    }
  }

  /** Motorun agent olarak kaydolmasini bekler. */
  private async waitForAgent(service: string, attempts = 5, delayMs = 400): Promise<boolean> {
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        const agent = await this.client.getAgent(service);
        if (agent) return true;
      } catch (err) {
        this.output.appendLine(`[dag-debug] agent lookup failed: ${(err as Error).message}`);
      }
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    return false;
  }

  private handleDebugEvent(event: DagDebugEventEnvelope): void {
    const config = this.readConfig();
    if (event.runtime && event.runtime !== 'dag') { return; }
    if (event.service && event.service !== config.service) { return; }
    const eventWorkspaceId = event.workspaceId ?? (typeof event.data?.workspaceId === 'string' ? event.data.workspaceId : undefined);
    if (config.workspaceId && eventWorkspaceId && eventWorkspaceId !== config.workspaceId) { return; }
    const normalizedEvent: DagDebugEventEnvelope = {
      ...event,
      workspaceId: eventWorkspaceId ?? config.workspaceId,
    };
    this.socketBridge.setActiveWorkspace(config.workspaceId);
    if (normalizedEvent.sessionId && !this.sessionId) {
      this.sessionId = normalizedEvent.sessionId;
      this.socketBridge.setActiveSession(normalizedEvent.sessionId);
    }
    if (normalizedEvent.flowId) {
      this.activeFlowId = normalizedEvent.flowId;
    }
    const flowRunId = typeof normalizedEvent.flowRunId === 'string'
      ? normalizedEvent.flowRunId
      : typeof normalizedEvent.threadId === 'string'
        ? normalizedEvent.threadId
        : typeof normalizedEvent.data?.flowRunId === 'string'
          ? normalizedEvent.data.flowRunId
          : undefined;
    if (flowRunId) {
      this.activeFlowRunId = flowRunId;
    }
    this.broadcast({ type: 'dag-debug-event', event: normalizedEvent });
  }

  private postState(entry: WebviewEntry): void {
    const config = this.readConfig();
    entry.webview.postMessage({
      type: 'dag-debug-state',
      service: config.service,
      workspaceId: config.workspaceId,
      sessionId: this.sessionId,
      flowId: entry.flowId,
      flowRunId: this.activeFlowRunId,
      debugMode: this.debugModeFlowIds.has(entry.flowId),
      breakpoints: Array.from(this.breakpoints.values()).filter((bp) => bp.flowId === entry.flowId),
    });
  }

  private broadcastState(): void {
    for (const entry of this.webviews) {
      this.postState(entry);
    }
  }

  private broadcast(message: unknown): void {
    for (const entry of this.webviews) {
      entry.webview.postMessage(message);
    }
  }

  private flowIdForDocument(document: vscode.TextDocument): string {
    const parsed = this.readFlowObject(document.getText());
    const existing = parsed.flowId ?? parsed.id ?? parsed.name;
    return typeof existing === 'string' && existing.trim()
      ? existing.trim()
      : basename(document.uri.fsPath).replace(/\.flow$/i, '');
  }

  /**
   * Breakpoint kaydinda kullanilacak dosya adi. Kaydedilmemis (untitled)
   * belgelerde fsPath anlamli olmadigi icin `<flowId>.flow` uretiyoruz.
   */
  private flowFileForDocument(document: vscode.TextDocument): string {
    if (document.uri.scheme === 'untitled') {
      return `${this.flowIdForDocument(document)}.flow`;
    }
    return document.uri.fsPath;
  }

  private readFlowObject(text: string): Record<string, unknown> {
    try {
      const parsed = JSON.parse(text || '{}');
      return typeof parsed === 'object' && parsed !== null ? parsed as Record<string, unknown> : {};
    } catch {
      return {};
    }
  }

  private readConfig(): DagDebugConfig {
    const cfg = vscode.workspace.getConfiguration('dagDebug');
    const workspaceId = getWorkspaceIdentity();
    const orchestratorUrl = cfg.get<string>('orchestratorUrl') || 'http://localhost:4000/api/v1';
    return {
      workspaceId,
      service: cfg.get<string>('defaultService') || 'dag-flow-service',
      orchestratorUrl,
      orchestratorWsUrl: cfg.get<string>('orchestratorWsUrl') || 'http://localhost:4000',
      localAgentUrl: cfg.get<string>('localAgentUrl') || 'http://localhost:9240/api/v1',
      runtimeAgentWsUrl: cfg.get<string>('runtimeAgentWsUrl') || 'ws://localhost:4001',
      flowEngineUrl: cfg.get<string>('flowEngineUrl') || 'http://localhost:3033',
      flowEngineWsUrl: cfg.get<string>('flowEngineWsUrl') || 'ws://localhost:3033/ws',
    };
  }

  private stripDebugBreakpointsFromFlow(flowData: Record<string, unknown>): Record<string, unknown> {
    const cleanFlow = { ...flowData };
    delete cleanFlow.breakpoints;

    const debugOptions = cleanFlow.debugOptions && typeof cleanFlow.debugOptions === 'object'
      ? { ...(cleanFlow.debugOptions as Record<string, unknown>) }
      : undefined;
    if (debugOptions) {
      delete debugOptions.breakpoints;
      cleanFlow.debugOptions = debugOptions;
    }

    const debug = cleanFlow.debug && typeof cleanFlow.debug === 'object'
      ? { ...(cleanFlow.debug as Record<string, unknown>) }
      : undefined;
    if (debug) {
      delete debug.breakpoints;
      const dag = debug.dag && typeof debug.dag === 'object'
        ? { ...(debug.dag as Record<string, unknown>) }
        : undefined;
      if (dag) {
        delete dag.breakpoints;
        debug.dag = dag;
      }
      cleanFlow.debug = debug;
    }

    const debugSession = cleanFlow.debugSession && typeof cleanFlow.debugSession === 'object'
      ? { ...(cleanFlow.debugSession as Record<string, unknown>) }
      : undefined;
    if (debugSession) {
      delete debugSession.breakpoints;
      cleanFlow.debugSession = debugSession;
    }

    return cleanFlow;
  }

  private selectedBreakpointsForFlow(flowId: string): Array<Record<string, unknown>> {
    return Array.from(this.breakpoints.values())
      .filter((bp) => bp.flowId === flowId && bp.enabled)
      .map((bp) => ({
        id: bp.id,
        sessionId: bp.sessionId,
        workspaceId: bp.workspaceId,
        service: bp.service,
        runtime: bp.runtime,
        flowId: bp.flowId,
        file: bp.file,
        nodeId: bp.nodeId,
        nodeLabel: bp.nodeLabel,
        condition: bp.condition,
        enabled: bp.enabled,
        verified: bp.verified,
      }));
  }

  private applySessionToFlowBreakpoints(flowId: string, sessionId: string, service: string, verified: boolean): void {
    for (const bp of this.breakpoints.values()) {
      if (bp.flowId !== flowId) { continue; }
      bp.sessionId = sessionId;
      bp.workspaceId = this.readConfig().workspaceId;
      bp.service = service;
      bp.verified = verified;
    }
  }

  private sendFlowEngineStartDebug(flowData: Record<string, unknown>): Promise<void> {
    const config = this.readConfig();
    return new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(config.flowEngineWsUrl);
      const timer = setTimeout(() => {
        ws.close();
        reject(new Error('Flow engine websocket timeout'));
      }, 5000);

      ws.on('open', () => {
        ws.send(JSON.stringify({
          type: 'flow:start-debug',
          event: 'flow:start-debug',
          service: config.service,
          runtime: 'dag',
          sessionId: flowData.debugSessionId,
          workspaceId: flowData.workspaceId ?? flowData.debugWorkspaceId,
          flowId: flowData.flowId,
          startNodeId: flowData.startNodeId,
          flow: flowData,
        }), (err) => {
          clearTimeout(timer);
          ws.close();
          if (err) {
            reject(err);
            return;
          }
          resolve();
        });
      });

      ws.on('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });
  }

  private async syncFlowEngineBreakpoints(flowId: string): Promise<void> {
    if (!this.debugModeFlowIds.has(flowId)) { return; }
    const config = this.readConfig();
    const sessionId = await this.ensureSession(flowId);
    const breakpoints = this.selectedBreakpointsForFlow(flowId);
    const message = {
      sessionId,
      workspaceId: config.workspaceId,
      service: config.service,
      runtime: 'dag',
      flowId,
      breakpoints,
    };
    await this.sendFlowEngineBreakpoints(message).catch((err: Error) => {
      this.output.appendLine(`[dag-debug] flow engine breakpoint sync failed: ${err.message}`);
    });
  }

  private async sendFlowEngineDebugMode(message: Record<string, unknown>): Promise<void> {
    try {
      await this.sendFlowEngineWsMessage({ type: 'flow:debug-mode', event: 'flow:debug-mode', ...message }, 'debug mode');
      return;
    } catch (err) {
      this.output.appendLine(`[dag-debug] flow engine websocket debug mode failed: ${(err as Error).message}`);
    }
    const url = `${this.readConfig().flowEngineUrl.replace(/\/+$/, '')}/flow/debug/session`;
    await this.client.postToAbsoluteUrl<unknown>(url, message);
  }

  private async sendFlowEngineBreakpoints(message: Record<string, unknown>): Promise<void> {
    try {
      await this.sendFlowEngineWsMessage({ type: 'flow:breakpoints', event: 'flow:breakpoints', ...message }, 'breakpoints');
      return;
    } catch (err) {
      this.output.appendLine(`[dag-debug] flow engine websocket breakpoints failed: ${(err as Error).message}`);
    }
    const url = `${this.readConfig().flowEngineUrl.replace(/\/+$/, '')}/flow/debug/breakpoints`;
    await this.client.postToAbsoluteUrl<unknown>(url, message);
  }

  private sendFlowEngineWsMessage(message: Record<string, unknown>, label: string): Promise<void> {
    const config = this.readConfig();
    return new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(config.flowEngineWsUrl);
      const timer = setTimeout(() => {
        ws.close();
        reject(new Error(`Flow engine ${label} websocket timeout`));
      }, 5000);

      ws.on('open', () => {
        ws.send(JSON.stringify(message), (err) => {
          clearTimeout(timer);
          ws.close();
          if (err) {
            reject(err);
            return;
          }
          resolve();
        });
      });

      ws.on('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });
  }

  private async postFlowEngineStartDebug(flowData: Record<string, unknown>): Promise<void> {
    const base = this.readConfig().flowEngineUrl.replace(/\/+$/, '');
    const attempts = [
      `${base}/flow/start-debug`,
      `${base}/flow/run`,
    ];
    let lastError: Error | undefined;
    for (const url of attempts) {
      try {
        await this.client.postToAbsoluteUrl<unknown>(url, flowData);
        this.output.appendLine(`[dag-debug] sent debug start to flow engine over POST ${url}`);
        return;
      } catch (err) {
        lastError = err as Error;
        this.output.appendLine(`[dag-debug] flow engine POST failed ${url}: ${lastError.message}`);
      }
    }
    throw lastError ?? new Error('Flow engine POST failed');
  }

  private postFlowRun(flowData: Record<string, unknown>): Promise<string> {
    const body = JSON.stringify(flowData);
    return new Promise<string>((resolve, reject) => {
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
        },
      );
      req.on('error', reject);
      req.write(body);
      req.end();
    });
  }
}
