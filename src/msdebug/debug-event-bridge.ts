import { io, Socket } from 'socket.io-client';

export interface DebugEvent {
  type: string;
  traceId?: string;
  sessionId?: string;
  service?: string;
  runtime?: string;
  workspaceId?: string;
  timestamp: number;
  data: unknown;
}

interface DebugEventCompatMessage {
  type?: string;
  traceId?: string;
  sessionId?: string;
  service?: string;
  runtime?: string;
  workspaceId?: string;
  timestamp?: number;
  data?: unknown;
  payload?: unknown;
}

type Handler = (event: DebugEvent) => void | Promise<void>;
type StatusHandler = (message: string) => void;

export class DebugEventBridge {
  private socket: Socket | null = null;
  private readonly breakpointHitHandlers: Handler[] = [];
  private readonly spanEndedHandlers: Handler[] = [];
  private readonly anyEventHandlers: Handler[] = [];
  private readonly statusHandlers: StatusHandler[] = [];

  constructor(private readonly wsUrl: string) {}

  connect(): Promise<void> {
    this.socket = io(this.wsUrl + '/ws/debug', {
      path: '/socket.io',
      transports: ['websocket'],
      forceNew: true,
      reconnection: true,
      reconnectionDelay: 2000,
      timeout: 5000,
    });

    this.socket.on('connect', () => {
      this.emitStatus(`connected ${this.wsUrl}/ws/debug socket=${this.socket?.id ?? '?'}`);
    });

    this.socket.on('connect_error', (err) => {
      this.emitStatus(`connect_error ${err.message}`);
    });

    this.socket.on('disconnect', (reason) => {
      this.emitStatus(`disconnected ${reason}`);
    });

    this.socket.io.on('reconnect_attempt', (attempt) => {
      this.emitStatus(`reconnect_attempt ${attempt}`);
    });

    this.socket.io.on('reconnect', (attempt) => {
      this.emitStatus(`reconnected after ${attempt} attempt(s)`);
    });

    this.socket.on('debug:event', (msg: DebugEventCompatMessage) => {
      this.handleEvent(normalizeEvent(msg));
    });

    this.socket.on('debug-event', (msg: DebugEventCompatMessage) => {
      this.handleEvent(normalizeCompatEvent(msg));
    });

    return Promise.resolve();
  }

  onBreakpointHit(handler: Handler): void {
    this.breakpointHitHandlers.push(handler);
  }

  onSpanEnded(handler: Handler): void {
    this.spanEndedHandlers.push(handler);
  }

  onAnyEvent(handler: Handler): void {
    this.anyEventHandlers.push(handler);
  }

  onStatus(handler: StatusHandler): void {
    this.statusHandlers.push(handler);
  }

  private emitStatus(message: string): void {
    for (const handler of this.statusHandlers) {
      handler(message);
    }
  }

  private handleEvent(msg: DebugEvent): void {
    this.anyEventHandlers.forEach((h) => {
      void h(msg);
    });
    switch (msg.type) {
      case 'debug.breakpoint.hit':
        // Only show notification for breakpoint.hit, not execution.paused
        // to avoid duplicate notifications
        this.breakpointHitHandlers.forEach((h) => {
          void h(msg);
        });
        break;
      case 'debug.execution.paused':
        // execution.paused is used for internal state updates only
        // Don't trigger notification handlers
        break;
      case 'trace.span.ended':
      case 'graph.node.completed':
        this.spanEndedHandlers.forEach((h) => {
          void h(msg);
        });
        break;
    }
  }

  dispose(): void {
    this.socket?.disconnect();
    this.socket = null;
  }
}

function normalizeEvent(msg: DebugEventCompatMessage): DebugEvent {
  const data = msg.data ?? msg.payload ?? null;
  const type = msg.type ?? readString(data, 'eventType') ?? 'unknown';
  return {
    type,
    traceId: msg.traceId ?? readString(data, 'traceId'),
    sessionId: msg.sessionId ?? readString(data, 'sessionId'),
    service: normalizeService(type, msg.service, data),
    runtime: msg.runtime ?? readString(data, 'runtime'),
    workspaceId: msg.workspaceId ?? readWorkspaceId(data),
    timestamp: msg.timestamp ?? Date.now(),
    data,
  };
}

function normalizeCompatEvent(msg: DebugEventCompatMessage): DebugEvent {
  const payload = isRecord(msg.payload) ? msg.payload : {};
  const data = payload['data'] ?? msg.data ?? msg.payload ?? null;
  const type = readString(payload, 'eventType') ?? msg.type ?? 'unknown';
  return {
    type,
    traceId: msg.traceId ?? readString(payload, 'traceId') ?? readString(data, 'traceId'),
    sessionId: msg.sessionId ?? readString(payload, 'sessionId') ?? readString(data, 'sessionId'),
    service: normalizeService(type, msg.service ?? readString(payload, 'service'), data),
    runtime: msg.runtime ?? readString(payload, 'runtime') ?? readString(data, 'runtime'),
    workspaceId: msg.workspaceId ?? readString(payload, 'workspaceId') ?? readWorkspaceId(data),
    timestamp: msg.timestamp ?? Date.now(),
    data,
  };
}

function normalizeService(type: string, envelopeService: string | undefined, data: unknown): string | undefined {
  const payloadService = readString(data, 'service');
  if (type.startsWith('agent.') && payloadService) return payloadService;
  // Runtime debug events may arrive with transport-level envelope services
  // like java-sidecar/cdp-sidecar. Prefer payload service when present.
  if (type.startsWith('debug.') && payloadService) return payloadService;
  if (payloadService && envelopeService?.endsWith('-sidecar')) return payloadService;
  return envelopeService ?? payloadService;
}

function readWorkspaceId(value: unknown): string | undefined {
  const direct = readString(value, 'workspaceId');
  if (direct) return direct;
  if (!isRecord(value)) return undefined;
  return readString(value['metadata'], 'workspaceId');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readString(value: unknown, key: string): string | undefined {
  if (!isRecord(value)) return undefined;
  const candidate = value[key];
  return typeof candidate === 'string' && candidate.trim() ? candidate.trim() : undefined;
}
