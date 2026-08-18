import { belongsToWorkspace } from '../workspaceIdentity';
// ─── Orchestrator REST Client ─────────────────────────────────────────────────

export interface SessionDto {
  id: string;
  name: string;
  status: string;
  services: string[];
  createdAt: string;
  workspaceId?: string;
}

export interface BreakpointDto {
  id: string;
  service: string;
  runtime?: string;
  file: string;
  line: number;
  /** DAG runtime'inda breakpoint'in gercek kimligi. Kaynak-kod breakpoint'lerinde yok. */
  nodeId?: string;
  condition?: string;
  hitCount: number;
  verified: boolean;
}

export interface AgentDto {
  service: string;
  runtime: string;
  debugState?: 'idle' | 'active' | 'debugging';
  agentId?: string;
  agentUrl?: string;
  healthy?: boolean;
  workspaceId?: string;
}

export interface TraceDto {
  traceId: string;
  rootService: string;
  spanCount: number;
  duration: number;
  status: string;
  startTime: number;
}

export class OrchestratorClient {
  constructor(private readonly baseUrl: string) {}

  private readonly activeStatuses = new Set(['running', 'active', 'initializing', 'paused', 'stepping', 'replaying', 'stopping']);

  // ── Sessions ────────────────────────────────────────────────────────────

  async startSession(body: { name: string; services: string[]; workspaceId?: string }): Promise<SessionDto> {
    const serviceConfigs = await Promise.all(
      body.services.map(async (service) => this.resolveSessionService(service, body.workspaceId)),
    );

    const res = await this.post<{ session: { sessionId: string; name: string; status: string; createdAt: number } }>(
      '/debug/session/start',
      {
        name: body.name,
        configuration: { stopOnEntry: false, workspaceId: body.workspaceId },
        metadata: body.workspaceId ? { workspaceId: body.workspaceId } : undefined,
        workspaceId: body.workspaceId,
        services: serviceConfigs,
      },
    );
    const s = res.session;
    return { id: s.sessionId, name: s.name, status: s.status, services: body.services, createdAt: new Date(s.createdAt).toISOString(), workspaceId: body.workspaceId };
  }

  async stopSession(sessionId: string): Promise<void> {
    await this.post<void>('/debug/session/stop', { sessionId });
  }

  async listSessions(): Promise<SessionDto[]> {
    const res = await this.get<{ sessions: Array<{ sessionId: string; name: string; status: string; services: Array<{ service: string }>; createdAt: number; metadata?: Record<string, unknown>; configuration?: Record<string, unknown> }> }>('/debug/session');
    return (res.sessions ?? []).map((s) => ({
      id: s.sessionId,
      name: s.name,
      status: s.status,
      services: (s.services ?? []).map((sv) => sv.service),
      createdAt: new Date(s.createdAt).toISOString(),
      workspaceId: readWorkspaceId(s),
    }));
  }

  async getActiveSession(preferredService?: string, workspaceId?: string): Promise<SessionDto | null> {
    const sessions = await this.listSessions();
    const active = sessions
      .filter((s) => this.activeStatuses.has(s.status))
      .filter((s) => !preferredService || s.services.includes(preferredService))
      .filter((s) => belongsToWorkspace(s.workspaceId, workspaceId));
    if (!active.length) return null;
    active.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    return active[0];
  }

  async getSession(sessionId: string): Promise<SessionDto> {
    const res = await this.get<{ session: { sessionId: string; name: string; status: string; services: Array<{ service: string }>; createdAt: number; metadata?: Record<string, unknown>; configuration?: Record<string, unknown> } }>(`/debug/session/${sessionId}`);
    const s = res.session;
    return { id: s.sessionId, name: s.name, status: s.status, services: (s.services ?? []).map((sv) => sv.service), createdAt: new Date(s.createdAt).toISOString(), workspaceId: readWorkspaceId(s) };
  }

  async listAgentServices(workspaceId?: string): Promise<string[]> {
    const agents = await this.listAgents(workspaceId);
    return agents.map((agent) => agent.service);
  }

  async listAgents(workspaceId?: string): Promise<AgentDto[]> {
    try {
      const res = await this.get<{
        agents: AgentDto[];
      }>('/agent');

      const unique = new Map<string, AgentDto>();
      for (const agent of res.agents ?? []) {
        if (!agent?.service) continue;
        if (agent.healthy === false) continue;
        // Skip workspace filter - show all healthy agents
        unique.set(agent.service, agent);
      }
      return Array.from(unique.values());
    } catch {
      return [];
    }
  }

  async getPreferredService(
    preferredNames: string[] = [],
    preferredRuntime?: string,
    workspaceId?: string,
  ): Promise<string | null> {
    const agents = await this.listAgents(workspaceId);
    if (!agents.length) return null;
    const normalizedPreferred = preferredNames.map((name) => name.toLowerCase());
    const exact = agents.find((agent) => normalizedPreferred.includes(agent.service.toLowerCase()));
    if (exact) return exact.service;

    const runtime = normalizeRuntime(preferredRuntime);
    if (runtime) {
      const runtimeMatch = agents.find((agent) => normalizeRuntime(agent.runtime) === runtime);
      if (runtimeMatch) return runtimeMatch.service;
    }

    return agents[0]?.service ?? null;
  }

  async getAgent(service: string, workspaceId?: string): Promise<AgentDto | null> {
    try {
      const res = await this.get<{ agent: AgentDto | null }>(`/agent/${encodeURIComponent(service)}`);
      if (workspaceId && res.agent?.workspaceId && res.agent.workspaceId !== workspaceId) return null;
      return res.agent ?? null;
    } catch {
      return null;
    }
  }

  async getSessionInfo(sessionId: string, service: string): Promise<{
    sessionId: string;
    state: string;
    framesCount: number;
    scopesCount: number;
    variablesCount: number;
    lastUpdated: number;
  } | null> {
    try {
      const res = await this.post<{
        sessionId: string;
        state: string;
        framesCount: number;
        scopesCount: number;
        variablesCount: number;
        lastUpdated: number;
      } | null>('/debug/session-info', { sessionId, service });
      return res;
    } catch {
      return null;
    }
  }

  async getServiceRuntime(service: string, workspaceId?: string): Promise<string> {
    const agent = await this.getAgent(service, workspaceId);
    return agent?.runtime ?? 'java';
  }

  // ── Agent Registration ──────────────────────────────────────────────────

  async registerAgent(body: {
    agentId: string;
    service: string;
    runtime: string;
    agentUrl: string;
    workspaceId?: string;
    metadata?: Record<string, unknown>;
  }): Promise<{ accepted: boolean; orchestratorWsUrl: string; workspaceId?: string }> {
    const res = await this.post<{
      accepted: boolean;
      orchestratorWsUrl: string;
      workspaceId?: string;
    }>('/agent/register', body);
    return res;
  }

  async deregisterAgent(agentId: string): Promise<void> {
    await this.post<void>('/agent/deregister', { agentId });
  }

  // ── Breakpoints ─────────────────────────────────────────────────────────

  async listBreakpoints(sessionId?: string, service?: string, workspaceId?: string): Promise<BreakpointDto[]> {
    let resolvedSessionId = sessionId;
    if (!resolvedSessionId) {
      resolvedSessionId = (await this.getActiveSession(service, workspaceId))?.id;
    }
    if (!resolvedSessionId) {
      resolvedSessionId = (await this.getActiveSession(undefined, workspaceId))?.id;
    }
    if (!resolvedSessionId) return [];
    const qsParts = [`sessionId=${encodeURIComponent(resolvedSessionId)}`];
    if (service) qsParts.push(`service=${encodeURIComponent(service)}`);
    const qs = `?${qsParts.join('&')}`;
    const res = await this.get<{ breakpoints: Array<{ id: string; service?: string; runtime?: string; location?: { file?: string; line?: number }; file?: string; line?: number; nodeId?: string; condition?: string; hitCount?: number; verified?: boolean }> }>(`/debug/breakpoint${qs}`);
    return (res.breakpoints ?? []).map((b) => ({
      id: b.id,
      service: b.service ?? '',
      runtime: b.runtime,
      file: b.location?.file ?? b.file ?? '',
      line: b.location?.line ?? b.line ?? 0,
      nodeId: b.nodeId,
      condition: b.condition,
      hitCount: b.hitCount ?? 0,
      verified: b.verified ?? false,
    }));
  }

  async setBreakpoint(body: {
    sessionId: string;
    service: string;
    runtime?: string;
    file: string;
    line: number;
    condition?: string;
  }): Promise<BreakpointDto> {
    const res = await this.post<{ breakpoint: { id: string; service?: string; file?: string; line?: number; condition?: string; hitCount?: number; verified?: boolean } }>('/debug/breakpoint', {
      sessionId: body.sessionId,
      breakpoint: {
        service: body.service,
        runtime: body.runtime ?? 'java',
        file: body.file,
        line: body.line,
        scope: 'session',
        condition: body.condition,
      },
    });
    const b = res.breakpoint;
    return { id: b.id, service: b.service ?? body.service, runtime: body.runtime, file: b.file ?? body.file, line: b.line ?? body.line, condition: b.condition, hitCount: b.hitCount ?? 0, verified: b.verified ?? false };
  }

  async removeBreakpoint(id: string, sessionId?: string, service?: string, workspaceId?: string): Promise<void> {
    const resolvedSessionId = sessionId ?? (await this.getActiveSession(service, workspaceId))?.id;
    if (!resolvedSessionId) return;
    await this.delete(`/debug/breakpoint/${encodeURIComponent(id)}?sessionId=${encodeURIComponent(resolvedSessionId)}`);
  }

  // ── Traces ───────────────────────────────────────────────────────────────

  async listTraces(limit = 20): Promise<TraceDto[]> {
    const res = await this.get<{ traces: Array<{ traceId: string; rootService?: string; spanCount?: number; duration?: number; status?: string; startTime?: number }> }>(`/trace?limit=${limit}`);
    return (res.traces ?? []).map((t) => ({
      traceId: t.traceId,
      rootService: t.rootService ?? 'unknown',
      spanCount: t.spanCount ?? 0,
      duration: t.duration ?? 0,
      status: t.status ?? 'unknown',
      startTime: t.startTime ?? 0,
    }));
  }

  async getGraph(traceId: string): Promise<unknown> {
    return this.get(`/debug/graph/${traceId}`);
  }

  // ── Debug Operations ──────────────────────────────────────────────────────

  async continueExecution(sessionId: string, service?: string, traceId = ''): Promise<void> {
    await this.post(`/debug/continue`, { sessionId, service, traceId });
  }

  async pauseExecution(sessionId: string, service?: string): Promise<void> {
    await this.post(`/debug/pause`, { sessionId, service });
  }

  async step(sessionId: string, stepType: 'over' | 'into' | 'out', service?: string, traceId = ''): Promise<void> {
    await this.post(`/debug/step`, { sessionId, stepType, service, traceId });
  }

  async getVariables(
    sessionId: string,
    service: string,
    traceId = '',
    variablesReference?: string,
  ): Promise<Array<{ name: string; value: string; type: string; variablesReference?: number }>> {
    try {
      const res = await this.post<{ variables: Array<{ name: string; value: string; type: string; variablesReference?: number }> }>(
        `/debug/variables`,
        { sessionId, traceId, service, frameIndex: 0, variablesReference },
      );
      return res.variables ?? [];
    } catch {
      return [];
    }
  }

  async evaluate(sessionId: string, expression: string, service?: string): Promise<{ result: string; type?: string }> {
    return this.post<{ result: string; type?: string }>(`/debug/evaluate`, {
      sessionId,
      expression,
      service,
    });
  }

  // ── HTTP Helpers ──────────────────────────────────────────────────────────

  private async get<T>(path: string): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`GET ${path} → ${res.status}`);
    if (res.status === 204) return undefined as T;
    const text = await res.text();
    if (!text) return undefined as T;
    return JSON.parse(text) as T;
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`POST ${path} → ${res.status}`);
    if (res.status === 204) return undefined as T;
    const text = await res.text();
    if (!text) return undefined as T;
    return JSON.parse(text) as T;
  }

  private async delete(path: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'DELETE',
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`DELETE ${path} → ${res.status}`);
  }

  private async resolveSessionService(service: string, workspaceId?: string): Promise<{ service: string; runtime: string; agentUrl: string }> {
    try {
      const res = await this.get<{
        agent: {
          runtime?: string;
          agentUrl?: string;
          workspaceId?: string;
        } | null;
      }>(`/agent/${encodeURIComponent(service)}`);

      if (workspaceId && res.agent?.workspaceId && res.agent.workspaceId !== workspaceId) {
        return { service, runtime: 'java', agentUrl: 'http://localhost:9250' };
      }
      const runtime = res.agent?.runtime ?? 'java';
      const agentUrl = res.agent?.agentUrl ?? 'http://localhost:9250';
      return { service, runtime, agentUrl };
    } catch {
      return { service, runtime: 'java', agentUrl: 'http://localhost:9250' };
    }
  }
}

function normalizeRuntime(runtime: string | undefined): string {
  const value = (runtime ?? '').toLowerCase();
  if (value === 'node' || value === 'nodejs' || value === 'javascript') return 'nodejs';
  if (value === 'jvm') return 'java';
  return value;
}

function readWorkspaceId(session: { metadata?: Record<string, unknown>; configuration?: Record<string, unknown> }): string | undefined {
  const fromMetadata = session.metadata?.['workspaceId'];
  if (typeof fromMetadata === 'string' && fromMetadata.trim()) return fromMetadata.trim();
  const fromConfiguration = session.configuration?.['workspaceId'];
  if (typeof fromConfiguration === 'string' && fromConfiguration.trim()) return fromConfiguration.trim();
  return undefined;
}
