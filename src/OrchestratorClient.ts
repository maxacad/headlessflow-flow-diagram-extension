import * as http from 'http';
import * as https from 'https';
import { URL } from 'url';
import { AgentDto, BreakpointDto, DebugSessionDto } from './dagDebugTypes';

export class OrchestratorClient {
  constructor(private readonly baseUrl: string) {}

  async registerOrGetSession(service: string, flowId: string, workspaceId?: string): Promise<DebugSessionDto> {
    const res = await this.requestWithFallback<DebugSessionDto | { session: Record<string, unknown> }>(
      [
        { method: 'POST', path: '/debug/sessions/register-or-get' },
        { method: 'POST', path: '/sessions/register-or-get' },
        { method: 'POST', path: '/sessions' },
      ],
      { service, runtime: 'dag', flowId, workspaceId, metadata: workspaceId ? { workspaceId } : undefined },
    );
    return this.normalizeSession(res, service, flowId, workspaceId);
  }

  async listSessions(service?: string): Promise<DebugSessionDto[]> {
    const suffix = service ? `?service=${encodeURIComponent(service)}` : '';
    return this.requestWithFallback<DebugSessionDto[]>([
      { method: 'GET', path: `/debug/sessions${suffix}` },
      { method: 'GET', path: `/sessions${suffix}` },
    ]);
  }

  async listAgents(): Promise<AgentDto[]> {
    return this.requestWithFallback<AgentDto[]>([
      { method: 'GET', path: '/agents' },
      { method: 'GET', path: '/agent/list' },
    ]);
  }

  async getAgent(service: string): Promise<AgentDto | null> {
    try {
      return await this.requestWithFallback<AgentDto>([
        { method: 'GET', path: `/agents/${encodeURIComponent(service)}` },
        { method: 'GET', path: `/agent/${encodeURIComponent(service)}` },
      ]);
    } catch {
      return null;
    }
  }

  async setDagBreakpoint(input: {
    sessionId: string;
    workspaceId?: string;
    service: string;
    flowId: string;
    nodeId: string;
    nodeLabel?: string;
    condition?: string;
  }): Promise<BreakpointDto> {
    return this.requestWithFallback<BreakpointDto>(
      [
        { method: 'POST', path: '/debug/breakpoints' },
        { method: 'POST', path: '/breakpoints' },
      ],
      { ...input, runtime: 'dag', enabled: true },
    );
  }

  async removeBreakpoint(input: {
    sessionId: string;
    workspaceId?: string;
    breakpointId?: string;
    service: string;
    flowId?: string;
    nodeId?: string;
  }): Promise<void> {
    const idPath = input.breakpointId ? `/${encodeURIComponent(input.breakpointId)}` : '';
    await this.requestWithFallback<unknown>(
      [
        { method: 'DELETE', path: `/debug/breakpoints${idPath}` },
        { method: 'DELETE', path: `/breakpoints${idPath}` },
        { method: 'POST', path: '/debug/breakpoints/remove' },
        { method: 'POST', path: '/breakpoints/remove' },
      ],
      { ...input, runtime: 'dag' },
    );
  }

  async sendCommand(input: {
    sessionId: string;
    workspaceId?: string;
    service: string;
    type: string;
    payload?: Record<string, unknown>;
  }): Promise<unknown> {
    return this.requestWithFallback<unknown>(
      [
        { method: 'POST', path: '/debug/command' },
        { method: 'POST', path: '/agent/command' },
        { method: 'POST', path: '/commands' },
      ],
      { ...input, runtime: 'dag' },
    );
  }

  async stopSession(input: {
    sessionId: string;
    workspaceId?: string;
    service?: string;
    flowId?: string;
    terminateDebuggee?: boolean;
  }): Promise<void> {
    await this.requestWithFallback<unknown>(
      [
        { method: 'POST', path: '/debug/session/stop' },
        { method: 'POST', path: '/sessions/stop' },
        { method: 'POST', path: '/debug/command' },
      ],
      {
        ...input,
        runtime: 'dag',
        type: 'DISCONNECT',
        command: 'DISCONNECT',
        terminateDebuggee: input.terminateDebuggee ?? false,
      },
    );
  }

  async registerAgent(input: Record<string, unknown>): Promise<unknown> {
    return this.request<unknown>('POST', '/agent/register', input);
  }

  private normalizeSession(
    raw: DebugSessionDto | { session: Record<string, unknown> },
    service: string,
    flowId: string,
    fallbackWorkspaceId?: string,
  ): DebugSessionDto {
    const source = ('session' in raw ? raw.session : raw) as Record<string, unknown>;
    const metadata = source.metadata && typeof source.metadata === 'object' ? source.metadata as Record<string, unknown> : undefined;
    const configuration = source.configuration && typeof source.configuration === 'object' ? source.configuration as Record<string, unknown> : undefined;
    const sessionId = typeof source.sessionId === 'string'
      ? source.sessionId
      : typeof source.id === 'string'
        ? source.id
        : '';
    const resolvedWorkspaceId = typeof source.workspaceId === 'string'
      ? source.workspaceId
      : typeof metadata?.workspaceId === 'string'
        ? metadata.workspaceId
        : typeof configuration?.workspaceId === 'string'
          ? configuration.workspaceId
          : fallbackWorkspaceId;
    return {
      id: sessionId,
      sessionId,
      workspaceId: resolvedWorkspaceId,
      service,
      runtime: 'dag',
      flowId,
      status: typeof source.status === 'string' ? source.status : undefined,
    };
  }

  async postToAbsoluteUrl<T>(absoluteUrl: string, body: unknown): Promise<T> {
    return this.requestAbsolute<T>('POST', absoluteUrl, body);
  }

  private async requestWithFallback<T>(
    attempts: Array<{ method: string; path: string }>,
    body?: unknown,
  ): Promise<T> {
    let lastError: Error | undefined;
    for (const attempt of attempts) {
      try {
        return await this.request<T>(attempt.method, attempt.path, body);
      } catch (err) {
        lastError = err as Error;
      }
    }
    throw lastError ?? new Error('Orchestrator request failed');
  }

  private request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const base = this.baseUrl.replace(/\/+$/, '');
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    return this.requestAbsolute<T>(method, `${base}${normalizedPath}`, body);
  }

  private requestAbsolute<T>(method: string, absoluteUrl: string, body?: unknown): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      let parsed: URL;
      try {
        parsed = new URL(absoluteUrl);
      } catch (err) {
        reject(err);
        return;
      }

      const payload = body === undefined ? undefined : Buffer.from(JSON.stringify(body), 'utf8');
      const transport = parsed.protocol === 'https:' ? https : http;
      const req = transport.request(
        {
          hostname: parsed.hostname,
          port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
          path: `${parsed.pathname}${parsed.search}`,
          method,
          timeout: 7000,
          headers: payload
            ? {
                'Content-Type': 'application/json',
                'Content-Length': String(payload.length),
              }
            : undefined,
        },
        (res) => {
          let out = '';
          res.on('data', (chunk: Buffer) => { out += chunk.toString(); });
          res.on('end', () => {
            const status = res.statusCode ?? 500;
            if (status >= 400) {
              reject(new Error(`HTTP ${status}: ${out || res.statusMessage || 'request failed'}`));
              return;
            }
            if (!out.trim()) {
              resolve(undefined as T);
              return;
            }
            try {
              resolve(JSON.parse(out) as T);
            } catch {
              resolve(out as T);
            }
          });
        },
      );
      req.on('timeout', () => req.destroy(new Error('Request timeout')));
      req.on('error', reject);
      if (payload) { req.write(payload); }
      req.end();
    });
  }
}
