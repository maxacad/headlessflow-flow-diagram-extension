export const DAG_RUNTIME = 'dag' as const;

export type DagRuntime = typeof DAG_RUNTIME;

export type DagCommandType =
  | 'SET_BREAKPOINT'
  | 'REMOVE_BREAKPOINT'
  | 'CONTINUE'
  | 'PAUSE'
  | 'STEP_OVER'
  | 'STEP_INTO'
  | 'STEP_OUT'
  | 'GET_VARIABLES'
  | 'EVALUATE'
  | 'STOP'
  | 'RESTART';

export interface DagBreakpoint {
  id?: string;
  sessionId: string;
  workspaceId?: string;
  service: string;
  runtime: DagRuntime;
  flowId: string;
  nodeId: string;
  nodeLabel?: string;
  condition?: string;
  enabled: boolean;
  verified?: boolean;
}

export interface DagAgentCommand {
  type: DagCommandType;
  sessionId: string;
  workspaceId?: string;
  breakpointId?: string;
  flowId?: string;
  nodeId?: string;
  threadId?: string;
  condition?: string;
  expression?: string;
  payload?: Record<string, unknown>;
}

export interface DagDebugVariable {
  name: string;
  value: unknown;
  type?: string;
  variablesReference?: string;
}

export interface DagDebugEventEnvelope {
  subject?: string;
  type: string;
  sessionId?: string;
  workspaceId?: string;
  service?: string;
  runtime?: string;
  flowId?: string;
  nodeId?: string;
  nodeLabel?: string;
  flowRunId?: string;
  threadId?: string;
  timestamp?: number;
  data?: Record<string, unknown>;
}

export interface DebugSessionDto {
  id: string;
  sessionId?: string;
  workspaceId?: string;
  service: string;
  runtime?: string;
  flowId?: string;
  status?: string;
}

export interface AgentDto {
  id?: string;
  service: string;
  runtime: string;
  agentUrl?: string;
  connected?: boolean;
  capabilities?: string[];
}

export interface BreakpointDto {
  id: string;
  sessionId?: string;
  workspaceId?: string;
  service?: string;
  runtime?: string;
  flowId?: string;
  nodeId?: string;
  verified?: boolean;
}

export interface DagDebugConfig {
  workspaceId?: string;
  service: string;
  orchestratorUrl: string;
  orchestratorWsUrl: string;
  localAgentUrl: string;
  runtimeAgentWsUrl: string;
  flowEngineUrl: string;
  flowEngineWsUrl: string;
}

export function breakpointKey(flowId: string, nodeId: string): string {
  return `${flowId}:${nodeId}`;
}

export function sessionIdOf(session: DebugSessionDto): string {
  return session.sessionId || session.id;
}
