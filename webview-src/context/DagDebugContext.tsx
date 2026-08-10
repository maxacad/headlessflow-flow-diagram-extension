import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import vscodeApi from '../vscodeApi';

export type DagDebugStatus = 'idle' | 'running' | 'completed' | 'failed' | 'paused';

export interface DagBreakpointView {
  id?: string;
  sessionId: string;
  workspaceId?: string;
  service: string;
  runtime: 'dag';
  flowId: string;
  nodeId: string;
  nodeLabel?: string;
  condition?: string;
  enabled: boolean;
  verified?: boolean;
}

export interface DagDebugVariableView {
  name: string;
  value: unknown;
  type?: string;
  variablesReference?: string;
}

interface DagDebugEventView {
  type: string;
  sessionId?: string;
  workspaceId?: string;
  service?: string;
  runtime?: string;
  flowId?: string;
  nodeId?: string;
  nodeLabel?: string;
  threadId?: string;
  flowRunId?: string;
  data?: Record<string, unknown>;
}

interface DagDebugContextValue {
  breakpointsByNode: Record<string, DagBreakpointView>;
  nodeStatuses: Record<string, DagDebugStatus>;
  executionPath: string[];
  variables: DagDebugVariableView[];
  selectedDebugNodeId?: string;
  sessionId?: string;
  workspaceId?: string;
  flowId?: string;
  flowRunId?: string;
  service?: string;
  toggleBreakpoint: (nodeId: string, nodeLabel?: string) => void;
  sendCommand: (command: string) => void;
}

const DagDebugContext = createContext<DagDebugContextValue>({
  breakpointsByNode: {},
  nodeStatuses: {},
  executionPath: [],
  variables: [],
  toggleBreakpoint: () => undefined,
  sendCommand: () => undefined,
});

function normalizeVariables(raw: unknown): DagDebugVariableView[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw
    .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
    .map((item) => ({
      name: typeof item.name === 'string' ? item.name : 'value',
      value: item.value,
      type: typeof item.type === 'string' ? item.type : undefined,
      variablesReference: typeof item.variablesReference === 'string' ? item.variablesReference : undefined,
    }));
}

function eventStatus(type: string): DagDebugStatus | undefined {
  switch (type) {
    case 'FLOW_STARTED':
    case 'NODE_STARTED':
      return 'running';
    case 'NODE_COMPLETED':
    case 'FLOW_COMPLETED':
      return 'completed';
    case 'NODE_FAILED':
    case 'FLOW_FAILED':
      return 'failed';
    case 'BREAKPOINT_HIT':
    case 'PAUSED':
      return 'paused';
    case 'RESUMED':
    case 'STEP':
      return 'running';
    default:
      return undefined;
  }
}

export function DagDebugProvider({ children }: { children: React.ReactNode }) {
  const [breakpointsByNode, setBreakpointsByNode] = useState<Record<string, DagBreakpointView>>({});
  const [nodeStatuses, setNodeStatuses] = useState<Record<string, DagDebugStatus>>({});
  const [executionPath, setExecutionPath] = useState<string[]>([]);
  const [variables, setVariables] = useState<DagDebugVariableView[]>([]);
  const [selectedDebugNodeId, setSelectedDebugNodeId] = useState<string | undefined>();
  const [sessionId, setSessionId] = useState<string | undefined>();
  const [workspaceId, setWorkspaceId] = useState<string | undefined>();
  const [flowId, setFlowId] = useState<string | undefined>();
  const [flowRunId, setFlowRunId] = useState<string | undefined>();
  const [service, setService] = useState<string | undefined>();

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const message = event.data;
      if (message?.type === 'dag-debug-state') {
        setSessionId(typeof message.sessionId === 'string' ? message.sessionId : undefined);
        setWorkspaceId(typeof message.workspaceId === 'string' ? message.workspaceId : undefined);
        setFlowId(typeof message.flowId === 'string' ? message.flowId : undefined);
        setFlowRunId(typeof message.flowRunId === 'string' ? message.flowRunId : undefined);
        setService(typeof message.service === 'string' ? message.service : undefined);
        const breakpoints = Array.isArray(message.breakpoints) ? message.breakpoints as DagBreakpointView[] : [];
        setBreakpointsByNode(Object.fromEntries(breakpoints.filter((bp) => bp.enabled).map((bp) => [bp.nodeId, bp])));
        return;
      }

      if (message?.type !== 'dag-debug-event' || !message.event) {
        return;
      }

      const debugEvent = message.event as DagDebugEventView;
      if (debugEvent.runtime && debugEvent.runtime !== 'dag') {
        return;
      }
      if (workspaceId && debugEvent.workspaceId && debugEvent.workspaceId !== workspaceId) {
        return;
      }
      if (debugEvent.sessionId) {
        setSessionId(debugEvent.sessionId);
      }
      if (debugEvent.workspaceId) {
        setWorkspaceId(debugEvent.workspaceId);
      }
      if (debugEvent.flowId) {
        setFlowId(debugEvent.flowId);
      }
      const nextFlowRunId = debugEvent.flowRunId
        ?? debugEvent.threadId
        ?? (typeof debugEvent.data?.flowRunId === 'string' ? debugEvent.data.flowRunId : undefined)
        ?? (typeof debugEvent.data?.threadId === 'string' ? debugEvent.data.threadId : undefined);
      if (nextFlowRunId) {
        setFlowRunId(nextFlowRunId);
      }
      if (debugEvent.service) {
        setService(debugEvent.service);
      }

      const nodeId = debugEvent.nodeId ?? (typeof debugEvent.data?.currentNodeId === 'string' ? debugEvent.data.currentNodeId : undefined);
      const status = eventStatus(debugEvent.type);
      if (nodeId && status) {
        setSelectedDebugNodeId(nodeId);
        setNodeStatuses((prev) => ({ ...prev, [nodeId]: status }));
        setExecutionPath((prev) => prev.includes(nodeId) ? prev : prev.concat(nodeId));
      }

      const nextVariables = normalizeVariables(debugEvent.data?.variables);
      if (nextVariables.length > 0 || debugEvent.type === 'VARIABLES') {
        setVariables(nextVariables);
      }
    };

    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [workspaceId]);

  const toggleBreakpoint = useCallback((nodeId: string, nodeLabel?: string) => {
    vscodeApi?.postMessage({ type: 'dag-debug-toggle-breakpoint', nodeId, nodeLabel });
  }, []);

  const sendCommand = useCallback((command: string) => {
    vscodeApi?.postMessage({
      type: 'dag-debug-command',
      command,
      payload: {
        sessionId,
        workspaceId,
        flowId,
        flowRunId,
        threadId: flowRunId,
        service,
      },
    });
  }, [flowId, flowRunId, service, sessionId, workspaceId]);

  const value = useMemo<DagDebugContextValue>(() => ({
    breakpointsByNode,
    nodeStatuses,
    executionPath,
    variables,
    selectedDebugNodeId,
    sessionId,
    workspaceId,
    flowId,
    flowRunId,
    service,
    toggleBreakpoint,
    sendCommand,
  }), [breakpointsByNode, executionPath, flowId, flowRunId, nodeStatuses, selectedDebugNodeId, service, sessionId, workspaceId, sendCommand, toggleBreakpoint, variables]);

  return <DagDebugContext.Provider value={value}>{children}</DagDebugContext.Provider>;
}

export function useDagDebug() {
  return useContext(DagDebugContext);
}

export function useDagNodeDebug(nodeId: string) {
  const ctx = useDagDebug();
  return {
    breakpoint: ctx.breakpointsByNode[nodeId],
    status: ctx.nodeStatuses[nodeId] ?? 'idle',
    isOnExecutionPath: ctx.executionPath.includes(nodeId),
    isSelectedDebugNode: ctx.selectedDebugNodeId === nodeId,
    toggleBreakpoint: ctx.toggleBreakpoint,
  };
}
