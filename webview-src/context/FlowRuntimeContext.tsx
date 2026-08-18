import React, { createContext, useContext, useEffect, useRef, useState } from 'react';

const WS_URL = 'ws://localhost:3033/ws';
const RECONNECT_DELAY_MS = 3033;

// ── Types ──────────────────────────────────────────────────────────────────────

export type NodeStatus = 'idle' | 'running' | 'done' | 'error';

export interface NodeRunState {
  status: NodeStatus;
  progress?: number; // 0–100
  output?: unknown;
  error?: string;
}

interface FlowRuntimeCtx {
  nodeStates: Record<string, NodeRunState>;
  connected: boolean;
}

interface DagDebugRuntimeState {
  sessionId?: string;
  workspaceId?: string;
  service?: string;
  flowId?: string;
  flowRunId?: string;
  debugMode?: boolean;
}

// ── Context ────────────────────────────────────────────────────────────────────

const FlowRuntimeContext = createContext<FlowRuntimeCtx>({
  nodeStates: {},
  connected: false,
});

// ── Provider ───────────────────────────────────────────────────────────────────

export function FlowRuntimeProvider({ children }: { children: React.ReactNode }) {
  const [nodeStates, setNodeStates] = useState<Record<string, NodeRunState>>({});
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unmountedRef = useRef(false);
  const debugStateRef = useRef<DagDebugRuntimeState>({});

  function sendEditorState(ws: WebSocket | null = wsRef.current) {
    if (!ws || ws.readyState !== WebSocket.OPEN) { return; }
    const state = debugStateRef.current;
    ws.send(JSON.stringify({
      type: 'editor:debug-state',
      source: 'vscode-dag-editor',
      runtime: 'dag',
      workspaceId: state.workspaceId,
      service: state.service,
      sessionId: state.sessionId,
      flowId: state.flowId,
      flowRunId: state.flowRunId,
      debugMode: state.debugMode,
    }));
  }

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const message = event.data;
      if (message?.type === 'dag-debug-state') {
        debugStateRef.current = {
          sessionId: typeof message.sessionId === 'string' ? message.sessionId : undefined,
          workspaceId: typeof message.workspaceId === 'string' ? message.workspaceId : undefined,
          service: typeof message.service === 'string' ? message.service : undefined,
          flowId: typeof message.flowId === 'string' ? message.flowId : undefined,
          flowRunId: typeof message.flowRunId === 'string' ? message.flowRunId : undefined,
          debugMode: Boolean(message.debugMode),
        };
        sendEditorState();
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  useEffect(() => {
    unmountedRef.current = false;

    function connect() {
      if (unmountedRef.current) { return; }

      let ws: WebSocket;
      try {
        ws = new WebSocket(WS_URL);
      } catch {
        // Server not available — retry later
        reconnectRef.current = setTimeout(connect, RECONNECT_DELAY_MS);
        return;
      }
      wsRef.current = ws;

      ws.onopen = () => {
        if (!unmountedRef.current) { setConnected(true); }
        sendEditorState(ws);
      };

      ws.onclose = () => {
        if (unmountedRef.current) { return; }
        setConnected(false);
        wsRef.current = null;
        reconnectRef.current = setTimeout(connect, RECONNECT_DELAY_MS);
      };

      ws.onerror = () => ws.close();

      ws.onmessage = (event) => {
        if (unmountedRef.current) { return; }
        let msg: unknown;
        try { msg = JSON.parse(String(event.data)); } catch { return; }
        if (!msg || typeof msg !== 'object') { return; }

        const m = msg as Record<string, unknown>;
        const messageWorkspaceId = typeof m['workspaceId'] === 'string' ? m['workspaceId'] : undefined;
        const workspaceId = debugStateRef.current.workspaceId;
        if (workspaceId && messageWorkspaceId && messageWorkspaceId !== workspaceId) { return; }
        // Server uses 'event' key (e.g. "node:start"), not 'type'
        const eventKey = m['event'] ?? m['type'];

        switch (eventKey) {
          case 'debug:event':
            window.dispatchEvent(new MessageEvent('message', {
              data: { type: 'dag-debug-event', event: m },
            }));
            break;

          case 'flow:start':
            setNodeStates({});
            break;

          case 'node:start': {
            const nodeId = m['nodeId'];
            if (typeof nodeId === 'string') {
              setNodeStates((prev) => ({
                ...prev,
                [nodeId]: { status: 'running', progress: 0 },
              }));
            }
            break;
          }

          case 'node:progress': {
            const nodeId = m['nodeId'];
            const progress = m['progress'];
            if (typeof nodeId === 'string') {
              setNodeStates((prev) => ({
                ...prev,
                [nodeId]: {
                  ...prev[nodeId],
                  status: 'running',
                  progress: typeof progress === 'number' ? Math.min(100, Math.max(0, progress)) : undefined,
                },
              }));
            }
            break;
          }

          case 'node:done': {
            const nodeId = m['nodeId'];
            if (typeof nodeId === 'string') {
              setNodeStates((prev) => ({
                ...prev,
                [nodeId]: { status: 'done', output: m['output'] },
              }));
            }
            break;
          }

          case 'node:jump': {
            const targetNodeId = m['targetNodeId'] ?? m['jumpTargetId'];
            if (typeof targetNodeId === 'string' && targetNodeId.trim()) {
              const nodeId = targetNodeId.trim();
              window.dispatchEvent(new CustomEvent('dag-goto-node', {
                detail: { nodeId },
              }));
              window.dispatchEvent(new MessageEvent('message', {
                data: { type: 'goto-node', nodeId },
              }));
            }
            break;
          }

          case 'node:error': {
            const nodeId = m['nodeId'];
            const error = typeof m['error'] === 'string' ? m['error'] : 'Unknown error';
            if (typeof nodeId === 'string') {
              setNodeStates((prev) => ({
                ...prev,
                [nodeId]: { status: 'error', error },
              }));
            }
            break;
          }

          case 'flow:done':
            // Nothing extra — individual node:done events already updated states
            break;

          case 'flow:error': {
            // flow-level error — mark any in-progress nodes as errored
            const nodeId = m['nodeId'];
            const error = typeof m['error'] === 'string' ? m['error'] : 'Unknown error';
            if (typeof nodeId === 'string') {
              setNodeStates((prev) => ({
                ...prev,
                [nodeId]: { status: 'error', error },
              }));
            } else {
              // no specific nodeId — mark all running nodes as errored
              setNodeStates((prev) => {
                const next = { ...prev };
                for (const nid of Object.keys(next)) {
                  if (next[nid].status === 'running') {
                    next[nid] = { status: 'error', error };
                  }
                }
                return next;
              });
            }
            break;
          }

          default:
            break;
        }
      };
    }

    connect();

    return () => {
      unmountedRef.current = true;
      if (reconnectRef.current) { clearTimeout(reconnectRef.current); }
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, []);

  return (
    <FlowRuntimeContext.Provider value={{ nodeStates, connected }}>
      {children}
    </FlowRuntimeContext.Provider>
  );
}

// ── Hook ───────────────────────────────────────────────────────────────────────

export function useNodeRunState(nodeId: string): NodeRunState {
  const { nodeStates } = useContext(FlowRuntimeContext);
  return nodeStates[nodeId] ?? { status: 'idle' };
}

export function useFlowRuntime() {
  return useContext(FlowRuntimeContext);
}
