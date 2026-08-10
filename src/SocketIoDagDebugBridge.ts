import { io, Socket } from 'socket.io-client';
import { DagDebugConfig, DagDebugEventEnvelope } from './dagDebugTypes';

interface Logger {
  appendLine(message: string): void;
}

export class SocketIoDagDebugBridge {
  private socket?: Socket;
  private activeSessionId: string | undefined;
  private activeWorkspaceId: string | undefined;

  constructor(
    private readonly config: DagDebugConfig,
    private readonly logger: Logger,
    private readonly onEvent: (event: DagDebugEventEnvelope) => void,
  ) {}

  connect(): void {
    if (this.socket) {
      return;
    }

    this.socket = io(`${this.config.orchestratorWsUrl.replace(/\/+$/, '')}/ws/debug`, {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      forceNew: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      timeout: 5000,
    });

    this.socket.on('connect', () => {
      this.logger.appendLine(`[dag-debug] debug gateway connected ${this.socket?.id ?? ''}`.trim());
    });

    this.socket.on('connect_error', (err: Error) => {
      this.logger.appendLine(`[dag-debug] debug gateway connect_error ${err.message}`);
    });

    this.socket.on('debug:event', (event: DagDebugEventEnvelope) => {
      const data = event.data && typeof event.data === 'object' ? event.data as Record<string, unknown> : undefined;
      const runtime = event.runtime ?? (typeof data?.runtime === 'string' ? data.runtime : undefined);
      const workspaceId = event.workspaceId ?? (typeof data?.workspaceId === 'string' ? data.workspaceId : undefined);
      if (runtime && runtime !== 'dag') { return; }
      if (event.service !== this.config.service) { return; }
      if (this.activeWorkspaceId && workspaceId && workspaceId !== this.activeWorkspaceId) { return; }
      if (this.activeSessionId && event.sessionId && event.sessionId !== this.activeSessionId) { return; }
      this.onEvent({ ...event, runtime: runtime ?? 'dag', workspaceId });
    });
  }

  setActiveSession(sessionId: string | undefined): void {
    this.activeSessionId = sessionId;
  }

  setActiveWorkspace(workspaceId: string | undefined): void {
    this.activeWorkspaceId = workspaceId;
  }

  dispose(): void {
    this.socket?.disconnect();
    this.socket = undefined;
  }
}
