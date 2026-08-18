import * as http from 'http';
import { AddressInfo } from 'net';
import WebSocket from 'ws';
import { breakpointKey, DagAgentCommand, DagBreakpoint, DagDebugConfig, DagDebugEventEnvelope } from './dagDebugTypes';
import { OrchestratorClient } from './OrchestratorClient';

interface Logger {
  appendLine(message: string): void;
}

export class LocalDagDebugAgent {
  private server?: http.Server;
  private runtimeWs?: WebSocket;
  private readonly breakpoints = new Map<string, DagBreakpoint>();
  private activeSessionId: string | undefined;
  private activeWorkspaceId: string | undefined;
  private activeFlowId: string | undefined;
  private orchestratorConnected = false;
  private reconnectTimer: NodeJS.Timeout | undefined;

  constructor(
    private readonly config: DagDebugConfig,
    private readonly client: OrchestratorClient,
    private readonly logger: Logger,
    private readonly onEvent: (event: DagDebugEventEnvelope) => void,
  ) {}

  async start(): Promise<void> {
    if (this.server) {
      return;
    }

    const port = this.localAgentPort();
    this.server = http.createServer((req, res) => {
      void this.handleRequest(req, res);
    });

    await new Promise<void>((resolve, reject) => {
      this.server?.once('error', reject);
      this.server?.listen(port, 'localhost', () => resolve());
    });

    const address = this.server.address() as AddressInfo | null;
    this.logger.appendLine(`[dag-debug] local agent listening on localhost:${address?.port ?? port}`);
    await this.registerAndConnect();
  }

  dispose(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
    this.runtimeWs?.close();
    this.runtimeWs = undefined;
    this.server?.close();
    this.server = undefined;
  }

  upsertBreakpoint(breakpoint: DagBreakpoint): void {
    this.breakpoints.set(breakpointKey(breakpoint.flowId, breakpoint.nodeId), breakpoint);
    this.activeSessionId = breakpoint.sessionId;
    this.activeFlowId = breakpoint.flowId;
  }

  removeBreakpoint(input: { flowId?: string; nodeId?: string; breakpointId?: string }): void {
    if (input.flowId && input.nodeId) {
      this.breakpoints.delete(breakpointKey(input.flowId, input.nodeId));
      return;
    }
    if (input.breakpointId) {
      for (const [key, value] of this.breakpoints.entries()) {
        if (value.id === input.breakpointId) {
          this.breakpoints.delete(key);
          return;
        }
      }
    }
  }

  emitRuntimeEvent(event: DagDebugEventEnvelope): void {
    const envelope: DagDebugEventEnvelope = {
      workspaceId: this.config.workspaceId ?? this.activeWorkspaceId,
      service: this.config.service,
      runtime: 'dag',
      timestamp: Date.now(),
      ...event,
    };
    this.onEvent(envelope);
    if (this.runtimeWs?.readyState === WebSocket.OPEN) {
      this.runtimeWs.send(JSON.stringify({
        type: 'agent:event',
        envelope: {
          subject: envelope.subject ?? this.subjectFor(envelope),
          ...envelope,
        },
      }));
    }
  }

  private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const method = req.method ?? 'GET';
    const path = (req.url ?? '').split('?')[0];

    try {
      if (method === 'GET' && path === '/api/v1/health') {
        this.json(res, 200, {
          ok: true,
          service: this.config.service,
          runtime: 'dag',
          orchestratorConnected: this.orchestratorConnected,
          activeSessionId: this.activeSessionId,
          activeWorkspaceId: this.activeWorkspaceId,
          activeFlowId: this.activeFlowId,
          breakpoints: this.breakpoints.size,
        });
        return;
      }

      if (method === 'POST' && path === '/api/v1/agent/command') {
        const command = await this.readJson<DagAgentCommand>(req);
        const result = this.handleCommand(command);
        this.json(res, 200, { ok: true, result });
        return;
      }

      this.json(res, 404, { ok: false, error: 'Not found' });
    } catch (err) {
      this.logger.appendLine(`[dag-debug] local agent error: ${(err as Error).message}`);
      this.json(res, 500, { ok: false, error: (err as Error).message });
    }
  }

  private handleCommand(command: DagAgentCommand): unknown {
    this.activeSessionId = command.sessionId || this.activeSessionId;
    this.activeWorkspaceId = command.workspaceId || this.activeWorkspaceId || this.config.workspaceId;
    this.activeFlowId = command.flowId || this.activeFlowId;

    if (command.type === 'SET_BREAKPOINT') {
      if (!command.flowId || !command.nodeId) {
        throw new Error('SET_BREAKPOINT requires flowId and nodeId');
      }
      const breakpoint: DagBreakpoint = {
        id: command.breakpointId,
        sessionId: command.sessionId,
        workspaceId: command.workspaceId ?? this.config.workspaceId,
        service: this.config.service,
        runtime: 'dag',
        flowId: command.flowId,
        nodeId: command.nodeId,
        condition: command.condition,
        enabled: true,
        verified: true,
      };
      this.upsertBreakpoint(breakpoint);
      return breakpoint;
    }

    if (command.type === 'REMOVE_BREAKPOINT') {
      this.removeBreakpoint({
        breakpointId: command.breakpointId,
        flowId: command.flowId,
        nodeId: command.nodeId,
      });
      return { removed: true };
    }

    this.emitRuntimeEvent({
      type: this.eventTypeForCommand(command.type),
      sessionId: command.sessionId,
      workspaceId: command.workspaceId ?? this.config.workspaceId,
      flowId: command.flowId ?? this.activeFlowId,
      threadId: command.threadId,
      data: { command: command.type, ...(command.payload ?? {}) },
    });
    return { accepted: true };
  }

  private async registerAndConnect(): Promise<void> {
    try {
      await this.client.registerAgent({
        service: this.config.service,
        runtime: 'dag',
        runtimeVersion: '1.0.0',
        agentUrl: this.config.localAgentUrl,
        workspaceId: this.config.workspaceId,
        capabilities: [
          'breakpoints',
          'node-breakpoints',
          'continue',
          'pause',
          'step-over',
          'step-into',
          'step-out',
          'variables',
          'flow-state',
        ],
        metadata: {
          workspace: 'dag-project',
          workspaceId: this.config.workspaceId,
          debugModel: 'flow-diagram',
        },
      });
      this.orchestratorConnected = true;
      this.logger.appendLine('[dag-debug] agent registered with orchestrator');
    } catch (err) {
      this.orchestratorConnected = false;
      this.logger.appendLine(`[dag-debug] agent registration failed: ${(err as Error).message}`);
    }

    this.connectRuntimeWs();
  }

  private connectRuntimeWs(): void {
    try {
      this.runtimeWs = new WebSocket(this.config.runtimeAgentWsUrl);
    } catch (err) {
      this.scheduleReconnect(`runtime ws create failed: ${(err as Error).message}`);
      return;
    }

    this.runtimeWs.on('open', () => {
      this.logger.appendLine('[dag-debug] runtime-agent websocket connected');
      this.orchestratorConnected = true;
    });

    this.runtimeWs.on('message', (raw) => {
      let parsed: unknown;
      try { parsed = JSON.parse(raw.toString()); } catch { return; }
      if (!parsed || typeof parsed !== 'object') { return; }
      const event = (parsed as { envelope?: DagDebugEventEnvelope }).envelope;
      if (event?.runtime === 'dag') {
        if (this.config.workspaceId && event.workspaceId && event.workspaceId !== this.config.workspaceId) { return; }
        this.onEvent(event);
      }
    });

    this.runtimeWs.on('close', () => {
      this.orchestratorConnected = false;
      this.scheduleReconnect('runtime ws closed');
    });

    this.runtimeWs.on('error', (err) => {
      this.logger.appendLine(`[dag-debug] runtime-agent websocket error: ${err.message}`);
    });
  }

  private scheduleReconnect(reason: string): void {
    this.logger.appendLine(`[dag-debug] ${reason}; reconnecting`);
    if (this.reconnectTimer) {
      return;
    }
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      void this.registerAndConnect();
    }, 2000);
  }

  private localAgentPort(): number {
    try {
      const url = new URL(this.config.localAgentUrl);
      return Number(url.port || 9240);
    } catch {
      return 9240;
    }
  }

  private subjectFor(event: DagDebugEventEnvelope): string {
    const sessionId = event.sessionId ?? this.activeSessionId ?? 'unknown';
    const suffix = String(event.type || 'event').toLowerCase().replace(/_/g, '.');
    return `debug.session.${sessionId}.dag.${suffix}`;
  }

  private eventTypeForCommand(type: string): string {
    switch (type) {
      case 'CONTINUE': return 'RESUMED';
      case 'PAUSE': return 'PAUSED';
      case 'STEP_OVER':
      case 'STEP_INTO':
      case 'STEP_OUT': return 'STEP';
      case 'STOP': return 'STOPPED';
      case 'RESTART': return 'RESTARTED';
      default: return type;
    }
  }

  private readJson<T>(req: http.IncomingMessage): Promise<T> {
    return new Promise((resolve, reject) => {
      let raw = '';
      req.on('data', (chunk: Buffer) => { raw += chunk.toString(); });
      req.on('end', () => {
        try {
          resolve((raw ? JSON.parse(raw) : {}) as T);
        } catch (err) {
          reject(err);
        }
      });
      req.on('error', reject);
    });
  }

  private json(res: http.ServerResponse, status: number, body: unknown): void {
    const payload = Buffer.from(JSON.stringify(body), 'utf8');
    res.writeHead(status, {
      'Content-Type': 'application/json',
      'Content-Length': String(payload.length),
    });
    res.end(payload);
  }
}
