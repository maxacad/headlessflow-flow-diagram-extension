import { useCallback, useEffect, useRef, useState, type DragEvent } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Panel,
  useReactFlow,
  useViewport,
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
  Connection,
  ConnectionLineType,
  NodeChange,
  EdgeChange,
  Node,
  Edge,
  DefaultEdgeOptions,
  NodeTypes,
  type OnConnectStartParams,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import FlowBackground from './components/FlowBackground';
import { DnDProvider, useDnD } from './context/DnDContext';
import { FlowRuntimeProvider, useFlowRuntime } from './context/FlowRuntimeContext';
import { DagDebugProvider, useDagDebug } from './context/DagDebugContext';
import { PipeletFilesProvider, NodeUpdateProvider, type PipeletFileEntry } from './context/PipeletFilesContext';
import { WebFormFilesProvider, type WebFormFileEntry } from './context/WebFormFilesContext';
import { GotoProvider, useGoto } from './context/GotoContext';
import { FlowEdge, MazeEdge } from './edges';
import {
  FunctionNode, ProcessNode, DecisionNode, ScriptNode, StopNode, EndNode,
  ViewNode, LoopNode, CallNode, JoinNode, StartNode, MethodCallNode, JumpNode,
  ApprovalNode,
} from './nodes';
import CustomNode from './nodes/CustomNode';
import { GRID_WIDTH, GRID_HEIGHT, NODE_WIDTH, NODE_HEIGHT } from './constants';
import vscodeApi from './vscodeApi';

const nodeTypes: NodeTypes = {
  fn:         FunctionNode,
  process:    ProcessNode,
  decision:   DecisionNode,
  script:     ScriptNode,
  stop:       StopNode,
  end:        EndNode,
  view:       ViewNode,
  loop:       LoopNode,
  call:       CallNode,
  join:       JoinNode,
  start:      StartNode,
  httpCall:   MethodCallNode,
  methodCall: MethodCallNode,
  custom:     CustomNode,
  jump:       JumpNode,
  approval:   ApprovalNode,
};

const NODE_BY_TYPE: Record<string, { label: string; subtitle: string }> = {
  input:    { label: 'Input',    subtitle: 'Entry Event'     },
  process:  { label: 'Process',  subtitle: 'Transform Data'  },
  output:   { label: 'Output',   subtitle: 'Publish Result'  },
  fn:       { label: 'Function', subtitle: 'Execute Logic'   },
  decision: { label: 'Decision', subtitle: 'Branch Flow'     },
  script:   { label: 'Script',   subtitle: 'Run Code'        },
  stop:     { label: 'Stop',     subtitle: 'Halt Execution'  },
  end:      { label: 'End',      subtitle: 'Complete Flow'   },
  view:     { label: 'View',     subtitle: 'Render Output'   },
  loop:     { label: 'Loop',     subtitle: 'Iterate Items'   },
  call:     { label: 'Call',     subtitle: 'Invoke Function' },
  join:     { label: 'Join',     subtitle: 'Merge Flows'     },
  start:      { label: 'Start',      subtitle: 'Begin Flow'      },
  methodCall: { label: 'MethodCall', subtitle: 'Object method'   },
  custom:     { label: 'CustomNode', subtitle: 'Connectable'     },
  jump:       { label: '',     subtitle: ''                  },
  approval:   { label: 'Approval', subtitle: 'Human Review'      },
};

let createdNodeId = 4;

/** Local mirror of EndpointDragPayload from DragBridge (webview can't import src/ directly). */
interface EndpointPayload {
  method?: string;
  path?: string;
  label?: string;
  summary?: string;
  baseUrl?: string;
  params?: Array<{ name: string; in: string; required?: boolean; type?: string; description?: string }>;
  requestSample?: unknown;
  responses?: Array<{ status: string; description: string; sample?: unknown }>;
}

interface PipeletPayload {
  name?: string;
  uri?: string;
  content?: string;
  handler?: string;
  handlerUri?: string;
  inputs?: Record<string, string>;
  outputs?: Record<string, string>;
  ai?: Record<string, unknown>;
}

function normalizePipeletName(rawName: string): string {
  return rawName.split('/').pop()?.replace(/\.pipelet$/i, '') || 'Pipelet';
}

function parsePipeletContent(content: string): Partial<Pick<PipeletFileEntry, 'name' | 'handler' | 'inputs' | 'outputs' | 'ai'>> {
  const parsed: Pick<PipeletFileEntry, 'inputs' | 'outputs'> & { name?: string; handler?: string; ai?: Record<string, unknown> } = {
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
      if (key === 'name' && value) { parsed.name = value.trim().replace(/^['"]|['"]$/g, ''); }
      if ((key === 'handler' || key === 'function' || key === 'functionHandler') && value) {
        parsed.handler = value.trim().replace(/^['"]|['"]$/g, '');
      }
      if (key === 'inputs' || key === 'outputs' || key === 'ai') {
        section = key;
        if (key === 'ai') { parsed.ai = {}; }
      }
      continue;
    }
    const field = line.match(/^\s{2,}([A-Za-z][\w-]*)\s*:\s*(.*?)\s*$/);
    if (field && (section === 'inputs' || section === 'outputs')) {
      parsed[section] = { ...parsed[section], [field[1]]: field[2].trim().replace(/^['"]|['"]$/g, '') };
    } else if (field && section === 'ai') {
      parsed.ai ??= {};
      aiListKey = undefined;
      const [, key, value] = field;
      if (value) {
        parsed.ai[key] = parseScalarOrInlineList(value);
      } else if (key === 'tags' || key === 'capabilities') {
        parsed.ai[key] = [];
        aiListKey = key;
      }
    }
    const listItem = line.match(/^\s{4,}-\s*(.*?)\s*$/);
    if (listItem && section === 'ai' && aiListKey && Array.isArray(parsed.ai?.[aiListKey])) {
      (parsed.ai[aiListKey] as string[]).push(unquoteScalar(listItem[1]));
    }
  }
  return parsed;
}

function unquoteScalar(value: string): string {
  return value.trim().replace(/^['"]|['"]$/g, '');
}

function parseScalarOrInlineList(value: string): string | string[] {
  const trimmed = value.trim();
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    return trimmed.slice(1, -1).split(',').map(unquoteScalar).filter(Boolean);
  }
  return unquoteScalar(trimmed);
}

const edgeTypes = {
  customEdge: FlowEdge,
  mazeEdge: FlowEdge,
};

function getNodeId() {
  return `node-${createdNodeId++}`;
}

const defaultEdgeOptions: DefaultEdgeOptions = {
  type: 'mazeEdge',
};

const CUSTOM_NODE_WIDTH = NODE_WIDTH;
const CUSTOM_NODE_HEIGHT = NODE_HEIGHT;
type Rotation = 0 | 90 | 180 | 270;

function centerOf(position: { x: number; y: number }) {
  return {
    x: position.x + NODE_WIDTH / 2,
    y: position.y + NODE_HEIGHT / 2,
  };
}

function rotationForInputFacingSource(sourcePosition: { x: number; y: number }, targetPosition: { x: number; y: number }): Rotation {
  const sourceCenter = centerOf(sourcePosition);
  const targetCenter = centerOf(targetPosition);
  const dx = sourceCenter.x - targetCenter.x;
  const dy = sourceCenter.y - targetCenter.y;

  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx > 0 ? 90 : 270;
  }
  return dy > 0 ? 180 : 0;
}

function rotationForOutputFacingTarget(sourcePosition: { x: number; y: number }, targetPosition: { x: number; y: number }): Rotation {
  const sourceCenter = centerOf(sourcePosition);
  const targetCenter = centerOf(targetPosition);
  const dx = targetCenter.x - sourceCenter.x;
  const dy = targetCenter.y - sourceCenter.y;

  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx > 0 ? 270 : 90;
  }
  return dy > 0 ? 0 : 180;
}

function hasPipeletLikeDrag(dataTransfer: DataTransfer | null): boolean {
  if (!dataTransfer) {
    return false;
  }

  const types = Array.from(dataTransfer.types || []);
  return (
    types.includes('application/reactdnd.pipelet') ||
    types.includes('application/reactdnd.endpoint') ||
    types.includes('application/vnd.code.tree.reactdnd.pipeletExplorerView') ||
    types.includes('application/vnd.code.tree.reactdnd.openApiExplorerView') ||
    types.includes('text/uri-list')
  );
}

function WsStatusBadge() {
  const { connected } = useFlowRuntime();
  return (
    <div style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 5,
      padding: '3px 8px',
      borderRadius: 8,
      background: connected ? '#0be26e' : 'rgba(0,0,0,0.6)',
    //  border: `1px solid ${connected ? '#39ff14' : '#555'}`,
      fontSize: 11,
      fontWeight: 600,
      color: connected ? '#fff' : '#757575',
      userSelect: 'none',
      pointerEvents: 'none',
    }}>
      <span style={{
        width: 7, height: 7, borderRadius: '50%',
        background: connected ? 'rgba(0,0,0,0.35)' : '#555',
        flexShrink: 0,
      }} />
      {connected ? 'WS Connected' : 'WS Disconnected'}
    </div>
  );
}

function DagDebugBadge() {
  const { sessionId, selectedDebugNodeId, flowId } = useDagDebug();
  const active = Boolean(sessionId || selectedDebugNodeId);
  const detail = selectedDebugNodeId ?? flowId;

  return (
    <div className={`dag-debug-badge${active ? ' dag-debug-badge--active' : ''}`}>
      <span className="dag-debug-badge-dot" />
      <span>{active ? 'Debug Active' : 'Debug Idle'}</span>
      {detail ? <span className="dag-debug-badge-detail">{detail}</span> : null}
    </div>
  );
}

// ── Edge hit-testing helpers (used for draw2d-style "drop on connection") ────
const EDGE_HIT_THRESHOLD = 25; // flow-space px

function getHandlePos(node: Node, handleId: string | null | undefined) {
  const x = node.position.x;
  const y = node.position.y;
  switch (handleId) {
    case 'input':  return { x: x + 75, y };
    case 'output': return { x: x + 75, y: y + 200 };
    case 'error':  return { x: x + 150, y: y + 100 };
    default:       return { x: x + 75, y: y + 100 };
  }
}

function distPointToSegment(
  px: number, py: number,
  ax: number, ay: number,
  bx: number, by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function FlowCanvas() {
  const [dndType, setDndType] = useDnD();
  const { screenToFlowPosition } = useReactFlow();
  const gotoNode = useGoto();
  const { x, y, zoom } = useViewport();

  // Handle goto-node message sent by the extension (e.g. after opening a flow from CallNode)
  useEffect(() => {
    const onMsg = (event: MessageEvent) => {
      const msg = event.data;
      if (msg?.type === 'goto-node' && typeof msg.nodeId === 'string') {
        gotoNode(msg.nodeId);
      }
    };
    const onDagGotoNode = (event: Event) => {
      const nodeId = (event as CustomEvent<{ nodeId?: unknown }>).detail?.nodeId;
      if (typeof nodeId === 'string') {
        gotoNode(nodeId);
      }
    };
    window.addEventListener('message', onMsg);
    window.addEventListener('dag-goto-node', onDagGotoNode);
    return () => {
      window.removeEventListener('message', onMsg);
      window.removeEventListener('dag-goto-node', onDagGotoNode);
    };
  }, [gotoNode]);

  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [isExternalPipeletDrag, setIsExternalPipeletDrag] = useState(false);
  const [isExternalEndpointDrag, setIsExternalEndpointDrag] = useState(false);
  const [isLibraryNodeDrag, setIsLibraryNodeDrag] = useState(false);
  const [pipeletFiles, setPipeletFiles] = useState<PipeletFileEntry[]>([]);
  const pipeletFilesRef = useRef<PipeletFileEntry[]>([]);
  const [webFormFiles, setWebFormFiles] = useState<WebFormFileEntry[]>([]);
  const [isNodeDragActive, setIsNodeDragActive] = useState(false);
  const [hoveredCell, setHoveredCell] = useState<{ col: number; row: number } | null>(null);
  const [hoveredEdgeId, setHoveredEdgeId] = useState<string | null>(null);
  const dragStartPositions = useRef<Record<string, { x: number; y: number }>>({});
  const draggingNodeId = useRef<string | null>(null);
  const connectStartRef = useRef<OnConnectStartParams | null>(null);
  const connectFiredRef = useRef(false);
  const pendingChangeRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Stores the last serialized content that came FROM the file (or was just sent to the extension).
  // flow-changed is suppressed when the normalized content hasn't actually changed.
  const lastSyncedContentRef = useRef<string | null>(null);

  const clearExternalDragState = useCallback(() => {
    setIsExternalPipeletDrag(false);
    setIsExternalEndpointDrag(false);
  }, []);

  const clearLibraryDragState = useCallback(() => {
    setIsLibraryNodeDrag(false);
  }, []);

  const updateNodeData = useCallback((nodeId: string, newData: Record<string, unknown>) => {
    setNodes((prev) => prev.map((n) => n.id === nodeId ? { ...n, data: newData } : n));
  }, []);

  /** Returns the ID of the edge closest to the given flow-space point, or null if none is within threshold. */
  const getEdgeAtFlowPoint = useCallback((fx: number, fy: number): string | null => {
    const nodeMap = new Map(nodes.map((n) => [n.id, n]));
    let bestId: string | null = null;
    let bestDist = EDGE_HIT_THRESHOLD;
    for (const edge of edges) {
      const src = nodeMap.get(edge.source);
      const tgt = nodeMap.get(edge.target);
      if (!src || !tgt) continue;
      const sp = getHandlePos(src, edge.sourceHandle);
      const tp = getHandlePos(tgt, edge.targetHandle);
      const d = distPointToSegment(fx, fy, sp.x, sp.y, tp.x, tp.y);
      if (d < bestDist) { bestDist = d; bestId = edge.id; }
    }
    return bestId;
  }, [nodes, edges]);

  /** Removes an edge and creates two new edges inserting newNode in between.
   *  Computes the insertion slot (1 row below the source node).
   *  If that slot is occupied, shifts only the downstream nodes of this flow down by one row. */
  const insertNodeOnEdge = useCallback((edgeId: string, droppedNode: Node) => {
    const edge = edges.find((e) => e.id === edgeId);
    if (!edge || edge.source === droppedNode.id || edge.target === droppedNode.id) return;

    const sourceNode = nodes.find((n) => n.id === edge.source);
    if (!sourceNode) return;

    // Insertion slot: same column as source, one row below it
    const insertCol = Math.floor(sourceNode.position.x / GRID_WIDTH);
    const insertRow  = Math.floor(sourceNode.position.y / GRID_HEIGHT) + 1;
    const centerOffsetX = (GRID_WIDTH - CUSTOM_NODE_WIDTH) / 2;
    const centerOffsetY = (GRID_HEIGHT - CUSTOM_NODE_HEIGHT) / 2;
    const insertX = insertCol * GRID_WIDTH + centerOffsetX;
    const insertY = insertRow  * GRID_HEIGHT + centerOffsetY;

    // Is the target slot occupied by any node other than the one being inserted?
    const cellTaken = nodes.some(
      (n) =>
        n.id !== droppedNode.id &&
        Math.floor(n.position.x / GRID_WIDTH) === insertCol &&
        Math.floor(n.position.y / GRID_HEIGHT) === insertRow,
    );

    // Collect all descendants of sourceNode by following edges (BFS).
    // Only these nodes (the downstream flow) will be shifted down — unrelated nodes stay put.
    const getDownstreamIds = (startId: string, allEdges: Edge[]): Set<string> => {
      const visited = new Set<string>();
      const queue = [startId];
      while (queue.length > 0) {
        const cur = queue.shift()!;
        if (visited.has(cur)) continue;
        visited.add(cur);
        for (const e of allEdges) {
          if (e.source === cur && !visited.has(e.target)) {
            queue.push(e.target);
          }
        }
      }
      visited.delete(startId); // exclude the source itself
      return visited;
    };

    const downstreamIds = cellTaken ? getDownstreamIds(edge.source, edges) : new Set<string>();

    // Reposition nodes: place droppedNode at insertion slot,
    // and (if needed) push downstream nodes at insertRow or below down by one row.
    setNodes((prev) =>
      prev.map((n) => {
        if (n.id === droppedNode.id) {
          return { ...n, position: { x: insertX, y: insertY }, zIndex: 0 };
        }
        if (cellTaken && downstreamIds.has(n.id)) {
          const r = Math.floor(n.position.y / GRID_HEIGHT);
          if (r >= insertRow) {
            return { ...n, position: { ...n.position, y: n.position.y + GRID_HEIGHT } };
          }
        }
        return n;
      }),
    );

    // Replace original edge with two new edges through the inserted node
    setEdges((prev) => {
      const originalEdge = prev.find((e) => e.id === edgeId);
      if (!originalEdge) return prev;
      const ts = Date.now();
      return [
        ...prev.filter((e) => e.id !== edgeId),
        { id: `edge-split-${ts}-a`, source: originalEdge.source, sourceHandle: originalEdge.sourceHandle ?? 'output', target: droppedNode.id, targetHandle: 'input', type: 'mazeEdge' },
        { id: `edge-split-${ts}-b`, source: droppedNode.id, sourceHandle: 'output', target: originalEdge.target, targetHandle: originalEdge.targetHandle ?? 'input', type: 'mazeEdge' },
      ];
    });

    setHoveredEdgeId(null);
  }, [nodes, edges]);

  const updateHoveredCellFromClientPoint = useCallback(
    (clientX: number, clientY: number) => {
      const flowPosition = screenToFlowPosition({ x: clientX, y: clientY });
      setHoveredCell({
        col: Math.floor(flowPosition.x / GRID_WIDTH),
        row: Math.floor(flowPosition.y / GRID_HEIGHT),
      });
    },
    [screenToFlowPosition],
  );

  const getMagneticTopLeftFromClientPoint = useCallback(
    (clientX: number, clientY: number) => {
      const flowPosition = screenToFlowPosition({ x: clientX, y: clientY });
      // Use Math.floor so the node lands in the same cell the cursor is in,
      // matching the hover overlay highlight exactly.
      const col = Math.floor(flowPosition.x / GRID_WIDTH);
      const row = Math.floor(flowPosition.y / GRID_HEIGHT);
      const centerOffsetX = (GRID_WIDTH - CUSTOM_NODE_WIDTH) / 2;
      const centerOffsetY = (GRID_HEIGHT - CUSTOM_NODE_HEIGHT) / 2;
      return {
        x: col * GRID_WIDTH + centerOffsetX,
        y: row * GRID_HEIGHT + centerOffsetY,
      };
    },
    [screenToFlowPosition],
  );

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const message = event.data;

      if (message?.type === 'update' && message.data) {
        const { nodes: fileNodes, edges: fileEdges } = message.data as { nodes?: Node[]; edges?: Edge[] };
        const cleanNodes = Array.isArray(fileNodes)
          ? fileNodes.map(({ measured: _m, selected: _s, zIndex: _z, dragging: _d, ...n }) => {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const { internals: _i, ...clean } = n as any;
              return clean as Node;
            })
          : [];
        const cleanEdges = Array.isArray(fileEdges)
          ? fileEdges.map(({ selected: _s, zIndex: _z, ...e }) => e)
          : [];
        // Record the normalized baseline so flow-changed can skip if nothing really changed
        lastSyncedContentRef.current = JSON.stringify({ nodes: cleanNodes, edges: cleanEdges });
        if (Array.isArray(fileNodes)) {
          setNodes(cleanNodes);
          const maxId = fileNodes.reduce((max: number, n: Node) => {
            const m = String(n.id).match(/node-(\d+)/);
            return m ? Math.max(max, parseInt(m[1], 10)) : max;
          }, 0);
          if (maxId >= createdNodeId) createdNodeId = maxId + 1;
        }
        if (Array.isArray(fileEdges)) {
          setEdges(cleanEdges);
        }
        return; // don't trigger flow-changed after load
      }

      if (message?.type === 'external-pipelet-drag-start' && message.payload) {
        setIsExternalPipeletDrag(true);
      }

      if (message?.type === 'external-pipelet-insert-center' && message.payload) {
        createPipeletNodeFromPayload(
          message.payload as PipeletPayload,
          window.innerWidth / 2,
          window.innerHeight / 2,
        );
      }

      if (message?.type === 'external-endpoint-drag-start' && message.payload) {
        setIsExternalEndpointDrag(true);
      }

      if (message?.type === 'external-endpoint-insert-center' && message.payload) {
        createEndpointNodeAtCenter(
          message.payload as EndpointPayload
        );
      }

      if (message?.type === 'pipelet-files' && Array.isArray(message.files)) {
        pipeletFilesRef.current = message.files as PipeletFileEntry[];
        setPipeletFiles(message.files as PipeletFileEntry[]);
      }

      if (message?.type === 'webform-files' && Array.isArray(message.files)) {
        setWebFormFiles(message.files as WebFormFileEntry[]);
      }

      if (message?.type === 'update-node-data' && typeof message.id === 'string' && message.data) {
        setNodes((prev) =>
          prev.map((n) =>
            n.id === message.id ? { ...n, data: { ...n.data, ...(message.data as Record<string, unknown>) } } : n
          )
        );
      }
    };

    window.addEventListener('message', onMessage);
    return () => {
      window.removeEventListener('message', onMessage);
    };
  }, []);

  // Signal extension that webview is ready — extension will respond with 'update'
  useEffect(() => {
    vscodeApi?.postMessage({ type: 'ready' });
  }, []);

  useEffect(() => {
    const onWindowDragOver = (event: globalThis.DragEvent) => {
      if (!hasPipeletLikeDrag(event.dataTransfer)) {
        return;
      }

      event.preventDefault();
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = 'copy';
      }
      setIsExternalPipeletDrag(true);
    };

    const onWindowDragEnter = (event: globalThis.DragEvent) => {
      if (hasPipeletLikeDrag(event.dataTransfer)) {
        setIsExternalPipeletDrag(true);
      }
    };

    const onWindowDragLeave = (event: globalThis.DragEvent) => {
      if (event.clientX <= 0 && event.clientY <= 0) {
        clearExternalDragState();
      }
    };

    const onWindowDrop = () => clearExternalDragState();
    const onWindowDragEnd = () => clearExternalDragState();
    const onWindowBlur = () => clearExternalDragState();

    window.addEventListener('dragover', onWindowDragOver, true);
    window.addEventListener('dragenter', onWindowDragEnter, true);
    window.addEventListener('dragleave', onWindowDragLeave, true);
    window.addEventListener('drop', onWindowDrop, true);
    window.addEventListener('dragend', onWindowDragEnd, true);
    window.addEventListener('blur', onWindowBlur);

    return () => {
      window.removeEventListener('dragover', onWindowDragOver, true);
      window.removeEventListener('dragenter', onWindowDragEnter, true);
      window.removeEventListener('dragleave', onWindowDragLeave, true);
      window.removeEventListener('drop', onWindowDrop, true);
      window.removeEventListener('dragend', onWindowDragEnd, true);
      window.removeEventListener('blur', onWindowBlur);
    };
  }, [clearExternalDragState]);

  // Send flow-changed whenever nodes/edges change (debounced)
  useEffect(() => {
    if (nodes.length === 0 && edges.length === 0) return; // skip empty initial state
    if (pendingChangeRef.current) clearTimeout(pendingChangeRef.current);
    pendingChangeRef.current = setTimeout(() => {
      // Strip runtime-only fields (React Flow internals) — not persisted
      const nodesToSave = nodes.map(({ measured: _m, selected: _s, zIndex: _z, dragging: _d, ...n }) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { internals: _i, ...clean } = n as any;
        return clean as Node;
      });
      const edgesToSave = edges.map(({ selected: _s, zIndex: _z, ...e }) => e);
      const content = JSON.stringify({ nodes: nodesToSave, edges: edgesToSave });
      // Suppress if content is identical to what was last synced from/to the file
      if (content === lastSyncedContentRef.current) { return; }
      lastSyncedContentRef.current = content;
      vscodeApi?.postMessage({ type: 'flow-changed', data: { nodes: nodesToSave, edges: edgesToSave } });
    }, 300);
    return () => {
      if (pendingChangeRef.current) clearTimeout(pendingChangeRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, edges]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        vscodeApi?.postMessage({ type: 'request-save' });
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const createPipeletNodeFromPayload = useCallback(
    (payload: PipeletPayload | string, clientX: number, clientY: number): Node => {
      const rawPipeletName = typeof payload === 'string' ? payload : payload.name || 'pipelet.pipelet';
      const pipeletName = normalizePipeletName(rawPipeletName);
      const position = getMagneticTopLeftFromClientPoint(clientX, clientY);
      const payloadUri = typeof payload === 'string' ? undefined : payload.uri;
      const parsedContent = typeof payload === 'string' || !payload.content ? undefined : parsePipeletContent(payload.content);
      const availablePipeletFiles = pipeletFilesRef.current.length > 0 ? pipeletFilesRef.current : pipeletFiles;
      const pipeletMeta = availablePipeletFiles.find((file) =>
        file.uri === payloadUri ||
        file.name === pipeletName ||
        normalizePipeletName(file.name) === pipeletName,
      );
      const handler = pipeletMeta?.handler ?? (typeof payload === 'string' ? undefined : payload.handler) ?? parsedContent?.handler;
      const inputs = pipeletMeta?.inputs ?? (typeof payload === 'string' ? undefined : payload.inputs) ?? parsedContent?.inputs ?? {};
      const outputs = pipeletMeta?.outputs ?? (typeof payload === 'string' ? undefined : payload.outputs) ?? parsedContent?.outputs ?? {};
      const ai = pipeletMeta?.ai ?? (typeof payload === 'string' ? undefined : payload.ai) ?? parsedContent?.ai;

      const newPipeletNode: Node = {
        id: getNodeId(),
        type: 'process',
        position,
        data: {
          label: pipeletName,
          subtitle: handler || 'Pipelet Process',
          pipeletFile: pipeletMeta?.name ?? parsedContent?.name ?? pipeletName,
          pipeletUri: pipeletMeta?.uri ?? payloadUri,
          pipeletHandler: handler ?? '',
          pipeletHandlerUri: pipeletMeta?.handlerUri ?? (typeof payload === 'string' ? undefined : payload.handlerUri),
          pipeletSkill: typeof ai?.skill === 'string' ? ai.skill : undefined,
          pipeletAi: ai,
          pipeletInputs: inputs,
          pipeletOutputs: outputs,
          inputMapping: Object.fromEntries(Object.keys(inputs).map((name) => [name, name])),
          outputMapping: Object.fromEntries(Object.keys(outputs).map((name) => [name, name])),
        },
      };

      setNodes((currentNodes) => currentNodes.concat(newPipeletNode));
      setDndType(null);
      clearExternalDragState();

      vscodeApi?.postMessage({
        type: 'pipelet-dropped',
        name: pipeletName,
        position,
      });

      return newPipeletNode;
    },
    [clearExternalDragState, getMagneticTopLeftFromClientPoint, pipeletFiles, setDndType],
  );

  const createEndpointNodeAtCenter = useCallback(
    (ep: EndpointPayload): Node => {
      // Place at center of visible canvas viewport
      const cx = window.innerWidth / 2;
      const cy = window.innerHeight / 2;
      const position = getMagneticTopLeftFromClientPoint(cx, cy);
      const newNode: Node = {
        id: getNodeId(),
        type: 'httpCall',
        position,
        data: {
          label:   ep.path ?? ep.label ?? 'Endpoint',
          subtitle: ep.method ? ep.method.toUpperCase() : 'HTTP',
          method:  ep.method ?? 'get',
          path:    ep.path ?? '/',
          baseUrl: (ep as EndpointPayload & { baseUrl?: string }).baseUrl ?? '',
          summary: ep.summary,
          ...(ep.params        !== undefined && { params:         ep.params }),
          ...(ep.requestSample !== undefined && { requestSample: ep.requestSample }),
          ...(ep.responses     !== undefined && { responses:     ep.responses }),
        },
      };
      setNodes((cur) => cur.concat(newNode));
      setDndType(null);
      clearExternalDragState();
      return newNode;
    },
    [clearExternalDragState, getMagneticTopLeftFromClientPoint, setDndType],
  );

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => setNodes((nodesSnapshot) => applyNodeChanges(changes, nodesSnapshot)),
    [],
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => setEdges((edgesSnapshot) => applyEdgeChanges(changes, edgesSnapshot)),
    [],
  );

  const onConnectStart = useCallback((_: unknown, params: OnConnectStartParams) => {
    connectStartRef.current = params;
    connectFiredRef.current = false;
  }, []);

  const onConnect = useCallback(
    (params: Connection) => {
      connectFiredRef.current = true;

      // Auto-rotate target input toward the source, and StartNode output toward the target.
      if (params.source && params.target) {
        setNodes((prev) => {
          const sourceNode = prev.find((n) => n.id === params.source);
          const targetNode = prev.find((n) => n.id === params.target);
          if (!sourceNode || !targetNode) return prev;
          const targetRotation = rotationForInputFacingSource(sourceNode.position, targetNode.position);
          const sourceRotation = rotationForOutputFacingTarget(sourceNode.position, targetNode.position);

          return prev.map((n) =>
            n.id === params.target
              ? { ...n, data: { ...n.data, rotation: targetRotation } }
              : n.id === params.source && n.type === 'start'
                ? { ...n, data: { ...n.data, rotation: sourceRotation } }
                : n,
          );
        });
      }

      setEdges((edgesSnapshot) =>
        addEdge({ ...params, type: 'mazeEdge' }, edgesSnapshot),
      );
    },
    [],
  );

  const onConnectEnd = useCallback(
    (event: MouseEvent | TouchEvent) => {
      // Connection landed on a valid handle — nothing to do.
      if (connectFiredRef.current) return;

      const start = connectStartRef.current;
      if (!start?.nodeId || start.handleType !== 'source') return;
      const sourceNodeId: string = start.nodeId; // narrowed: null already excluded above

      const clientX = (event as MouseEvent).clientX ?? (event as TouchEvent).changedTouches?.[0]?.clientX;
      const clientY = (event as MouseEvent).clientY ?? (event as TouchEvent).changedTouches?.[0]?.clientY;
      if (clientX == null || clientY == null) return;

      const fp = screenToFlowPosition({ x: clientX, y: clientY });
      const edgeId = getEdgeAtFlowPoint(fp.x, fp.y);
      if (!edgeId) return;

      const targetEdge = edges.find((e) => e.id === edgeId);
      if (!targetEdge) return;
      // Block only if: dragged node is the target (self-loop to input), OR
      // dragging from the exact same handle that the edge originates from.
      const isSameHandle =
        targetEdge.source === sourceNodeId &&
        (targetEdge.sourceHandle ?? 'output') === (start.handleId ?? 'output');
      if (isSameHandle || targetEdge.target === sourceNodeId) return;

      const position = getMagneticTopLeftFromClientPoint(clientX, clientY);
      const joinId = getNodeId();
      const ts = Date.now();

      const joinNode: Node = {
        id: joinId,
        type: 'join',
        position,
        data: { label: 'Join', subtitle: 'Merge Flows' },
      };

      setNodes((prev) => prev.concat(joinNode));
      setEdges((prev) => [
        ...prev.filter((e) => e.id !== edgeId),
        // original source → JoinNode
        {
          id: `edge-join-${ts}-a`,
          source: targetEdge.source,
          sourceHandle: targetEdge.sourceHandle ?? 'output',
          target: joinId,
          targetHandle: 'centerInput',
          type: 'mazeEdge',
        },
        // dragged source → JoinNode
        {
          id: `edge-join-${ts}-b`,
          source: sourceNodeId,
          sourceHandle: start.handleId ?? 'output',
          target: joinId,
          targetHandle: 'centerInput',
          type: 'mazeEdge',
        },
        // JoinNode → original target
        {
          id: `edge-join-${ts}-c`,
          source: joinId,
          sourceHandle: 'output',
          target: targetEdge.target,
          targetHandle: targetEdge.targetHandle ?? 'input',
          type: 'mazeEdge',
        },
      ]);
    },
    [edges, getEdgeAtFlowPoint, getMagneticTopLeftFromClientPoint, screenToFlowPosition],
  );

  const onNodeDragStop = useCallback(
    (event: React.MouseEvent, node: Node) => {
      draggingNodeId.current = null;
      setIsNodeDragActive(false);

      // Edge-insertion mode: skip normal snap/occupied logic; insertNodeOnEdge handles everything.
      // But only if the hovered edge does NOT connect to/from the node being dragged —
      // otherwise insertNodeOnEdge returns early and we must fall through to normal snap.
      if (hoveredEdgeId) {
        const hoveredEdge = edges.find((e) => e.id === hoveredEdgeId);
        const isOwnEdge = hoveredEdge &&
          (hoveredEdge.source === node.id || hoveredEdge.target === node.id);
        if (!isOwnEdge) {
          delete dragStartPositions.current[node.id];
          insertNodeOnEdge(hoveredEdgeId, node);
          return;
        }
      }

      const snapped = getMagneticTopLeftFromClientPoint(event.clientX, event.clientY);
      const targetCol = Math.floor(snapped.x / GRID_WIDTH);
      const targetRow = Math.floor(snapped.y / GRID_HEIGHT);
      const occupied = nodes.some(
        (n) =>
          n.id !== node.id &&
          Math.floor(n.position.x / GRID_WIDTH) === targetCol &&
          Math.floor(n.position.y / GRID_HEIGHT) === targetRow,
      );
      const finalPosition = occupied
        ? (dragStartPositions.current[node.id] ?? node.position)
        : snapped;
      delete dragStartPositions.current[node.id];

      // Recalculate rotation for the dragged node and any StartNode whose
      // output points at it, based on the new snapped position.
      const incomingEdge = edges.find((e) => e.target === node.id);
      const outgoingEdge = edges.find((e) => e.source === node.id);

      setNodes((currentNodes) => {
        const updater = (item: Node) => {
          if (item.id !== node.id) {
            const edgeFromStartToDragged = item.type === 'start'
              ? edges.find((e) => e.source === item.id && e.target === node.id)
              : undefined;
            if (!edgeFromStartToDragged) return item;
            const rotation = rotationForOutputFacingTarget(item.position, finalPosition);
            return { ...item, data: { ...item.data, rotation } };
          }

          const base = { ...item, position: finalPosition, zIndex: 0 };
          if (item.type === 'start') {
            if (!outgoingEdge) return base;
            const targetNode = currentNodes.find((n) => n.id === outgoingEdge.target);
            if (!targetNode) return base;
            const rotation = rotationForOutputFacingTarget(finalPosition, targetNode.position);
            return { ...base, data: { ...base.data, rotation } };
          }

          if (!incomingEdge) return base;
          const sourceNode = currentNodes.find((n) => n.id === incomingEdge.source);
          if (!sourceNode) return base;
          const rotation = rotationForInputFacingSource(sourceNode.position, finalPosition);
          return { ...base, data: { ...base.data, rotation } };
        };
        return currentNodes.map(updater);
      });
    },
    [getMagneticTopLeftFromClientPoint, nodes, edges, hoveredEdgeId, insertNodeOnEdge],
  );

  const onNodeClick = useCallback((event: React.MouseEvent, node: Node) => {
    if ((event.ctrlKey || event.metaKey) && node.type === 'jump') {
      const jumpTargetId = (node.data as { jumpTargetId?: string }).jumpTargetId;
      if (jumpTargetId) {
        gotoNode(jumpTargetId);
        return;
      }
    }
    if ((event.ctrlKey || event.metaKey) && node.type === 'call') {
      const callTarget = (node.data as { callTarget?: { flow: string; nodeId: string } }).callTarget;
      if (callTarget?.flow && callTarget?.nodeId) {
        vscodeApi?.postMessage({ type: 'open-flow-and-goto-node', flow: callTarget.flow, nodeId: callTarget.nodeId });
        return;
      }
    }
    vscodeApi?.postMessage({
      type: 'node-selected',
      id: node.id,
      nodeType: node.type ?? 'custom',
      data: node.data,
    });
  }, [gotoNode]);

  const onNodeDragStart = useCallback((_event: React.MouseEvent, node: Node) => {
    dragStartPositions.current[node.id] = { ...node.position };
    draggingNodeId.current = node.id;
    setIsNodeDragActive(true);
    setNodes((currentNodes) =>
      currentNodes.map((n) =>
        n.id === node.id ? { ...n, zIndex: 1000 } : n,
      ),
    );
  }, []);

  const onNodeDrag = useCallback(
    (event: React.MouseEvent) => {
      updateHoveredCellFromClientPoint(event.clientX, event.clientY);
      const fp = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      setHoveredEdgeId(getEdgeAtFlowPoint(fp.x, fp.y));
    },
    [updateHoveredCellFromClientPoint, screenToFlowPosition, getEdgeAtFlowPoint],
  );

  const isDropPreviewActive =
    isExternalPipeletDrag || isExternalEndpointDrag || isLibraryNodeDrag || Boolean(dndType) || isNodeDragActive;

  // Compute the set of occupied cells, excluding the node currently being dragged.
  const occupiedCells = nodes
    .filter((n) => n.id !== draggingNodeId.current)
    .map((n) => ({
      col: Math.floor(n.position.x / GRID_WIDTH),
      row: Math.floor(n.position.y / GRID_HEIGHT),
    }));

  const isHoveredCellOccupied =
    hoveredCell !== null &&
    occupiedCells.some((c) => c.col === hoveredCell.col && c.row === hoveredCell.row);

  const onDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    updateHoveredCellFromClientPoint(event.clientX, event.clientY);

    // Edge hit detection during external/library drag
    const fp = screenToFlowPosition({ x: event.clientX, y: event.clientY });
    setHoveredEdgeId(getEdgeAtFlowPoint(fp.x, fp.y));

    const hasLibraryDrag = Array.from(event.dataTransfer.types || []).includes('application/reactflow');
    setIsLibraryNodeDrag(hasLibraryDrag);

    if (hasPipeletLikeDrag(event.dataTransfer)) {
      setIsExternalPipeletDrag(true);
      event.dataTransfer.dropEffect = 'copy';
      event.preventDefault();
      return;
    }

    if (dndType) {
      event.dataTransfer.dropEffect = 'move';
      event.preventDefault();
    }
  }, [dndType, updateHoveredCellFromClientPoint, screenToFlowPosition, getEdgeAtFlowPoint]);

  const onMouseMove = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      updateHoveredCellFromClientPoint(event.clientX, event.clientY);
    },
    [updateHoveredCellFromClientPoint],
  );

  const onPaneMouseMove = useCallback(
    (event: React.MouseEvent) => {
      updateHoveredCellFromClientPoint(event.clientX, event.clientY);
    },
    [updateHoveredCellFromClientPoint],
  );

  const onMouseEnter = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      updateHoveredCellFromClientPoint(event.clientX, event.clientY);
    },
    [updateHoveredCellFromClientPoint],
  );

  const onMouseLeave = useCallback(() => {
    clearLibraryDragState();
    setHoveredCell(null);
    setHoveredEdgeId(null);
  }, [clearLibraryDragState]);

  const onDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      clearExternalDragState();
      clearLibraryDragState();

      // Block drop on an already-occupied cell.
      const dropCol = Math.floor(screenToFlowPosition({ x: event.clientX, y: event.clientY }).x / GRID_WIDTH);
      const dropRow = Math.floor(screenToFlowPosition({ x: event.clientX, y: event.clientY }).y / GRID_HEIGHT);
      const targetOccupied = nodes.some(
        (n) =>
          Math.floor(n.position.x / GRID_WIDTH) === dropCol &&
          Math.floor(n.position.y / GRID_HEIGHT) === dropRow,
      );
      if (targetOccupied) {
        return;
      }

      const pipeletPayload =
        event.dataTransfer.getData('application/reactdnd.pipelet') ||
        event.dataTransfer.getData('application/vnd.code.tree.reactdnd.pipeletExplorerView');

      if (pipeletPayload) {
        let pipeletPayloadData: PipeletPayload | string = 'pipelet.pipelet';
        try {
          const parsed = JSON.parse(pipeletPayload) as PipeletPayload;
          pipeletPayloadData = parsed?.name || parsed?.uri ? parsed : pipeletPayloadData;
        } catch {
          pipeletPayloadData = pipeletPayload;
        }

        const newPipeletNode = createPipeletNodeFromPayload(pipeletPayloadData, event.clientX, event.clientY);
        if (hoveredEdgeId) { insertNodeOnEdge(hoveredEdgeId, newPipeletNode); }
        return;
      }

      // ── OpenAPI endpoint drop ──────────────────────────────────────────────
      const endpointPayload =
        event.dataTransfer.getData('application/reactdnd.endpoint') ||
        event.dataTransfer.getData('application/vnd.code.tree.reactdnd.openApiExplorerView');

      if (endpointPayload) {
        try {
          const ep = JSON.parse(endpointPayload) as EndpointPayload;
          const position = getMagneticTopLeftFromClientPoint(event.clientX, event.clientY);
          const newEndpointNode: Node = {
            id: getNodeId(),
            type: 'httpCall',
            position,
            data: {
              label:   ep.path ?? ep.label ?? 'Endpoint',
              subtitle: ep.method ? ep.method.toUpperCase() : 'HTTP',
              method:  ep.method ?? 'get',
              path:    ep.path ?? '/',
              baseUrl: (ep as EndpointPayload & { baseUrl?: string }).baseUrl ?? '',
              summary: ep.summary,
              ...(ep.params        !== undefined && { params:         ep.params }),
              ...(ep.requestSample !== undefined && { requestSample: ep.requestSample }),
              ...(ep.responses     !== undefined && { responses:      ep.responses }),
            },
          };
          setNodes((cur) => cur.concat(newEndpointNode));
          setDndType(null);
          clearExternalDragState();
          if (hoveredEdgeId) { insertNodeOnEdge(hoveredEdgeId, newEndpointNode); }
        } catch {
          // Malformed payload — silently ignore.
        }
        return;
      }

      const uriList = event.dataTransfer.getData('text/uri-list');
      if (uriList) {
        const firstUri = uriList
          .split('\n')
          .map((x) => x.trim())
          .find((x) => x.length > 0 && !x.startsWith('#'));

        if (firstUri) {
          const rawName = decodeURIComponent(firstUri.split('/').pop() || 'pipelet.pipelet');
          const newUriNode = createPipeletNodeFromPayload({ name: rawName, uri: firstUri }, event.clientX, event.clientY);
          if (hoveredEdgeId) { insertNodeOnEdge(hoveredEdgeId, newUriNode); }
          return;
        }
      }

      const droppedType = event.dataTransfer.getData('application/reactflow') || dndType;
      if (!droppedType) {
        return;
      }

      const position = getMagneticTopLeftFromClientPoint(
        event.clientX,
        event.clientY,
      );

      const nodeInfo = NODE_BY_TYPE[droppedType] ?? NODE_BY_TYPE.process;

      const newNode: Node = {
        id: getNodeId(),
        type: droppedType === 'input' || droppedType === 'output' ? 'fn' : droppedType,
        position,
        data: nodeInfo,
      };

      setNodes((currentNodes) => currentNodes.concat(newNode));
      setDndType(null);
      if (hoveredEdgeId) { insertNodeOnEdge(hoveredEdgeId, newNode); }
    },
    [
      clearExternalDragState,
      clearLibraryDragState,
      createPipeletNodeFromPayload,
      dndType,
      getMagneticTopLeftFromClientPoint,
      hoveredEdgeId,
      insertNodeOnEdge,
      nodes,
      screenToFlowPosition,
      setDndType,
    ],
  );

  const edgesWithHighlight = hoveredEdgeId
    ? edges.map((e) =>
        e.id === hoveredEdgeId
          ? { ...e, data: { ...(e.data ?? {}), highlighted: true } }
          : e,
      )
    : edges;

  return (
    <PipeletFilesProvider files={pipeletFiles}>
    <WebFormFilesProvider files={webFormFiles}>
    <NodeUpdateProvider onUpdate={updateNodeData}>
    <div
      className="flow-canvas"
      onDrop={onDrop}
      onDragOver={onDragOver}
      onMouseEnter={onMouseEnter}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
    >
      <ReactFlow
          nodes={nodes}
          edges={edgesWithHighlight}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodesChange={onNodesChange}
          onNodeClick={onNodeClick}
          onNodeDragStart={onNodeDragStart}
          onNodeDrag={onNodeDrag}
          onNodeDragStop={onNodeDragStop}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onConnectStart={onConnectStart}
          onConnectEnd={onConnectEnd}
          onPaneMouseMove={onPaneMouseMove}
          connectionLineType={ConnectionLineType.SmoothStep}
          defaultEdgeOptions={defaultEdgeOptions}
          fitView
        >
          <FlowBackground gridWidth={GRID_WIDTH} gridHeight={GRID_HEIGHT} />

          <Panel position="top-left">
            <div className="flow-status-badges">
              <WsStatusBadge />
              <DagDebugBadge />
            </div>
          </Panel>

          {hoveredCell && isDropPreviewActive ? (
            <div
              className={`flow-hover-cell-overlay${isHoveredCellOccupied ? ' flow-hover-cell-overlay--occupied' : ''}`}
              style={{
                left: hoveredCell.col * GRID_WIDTH * zoom + x,
                top: hoveredCell.row * GRID_HEIGHT * zoom + y,
                width: CUSTOM_NODE_WIDTH * zoom,
                height: CUSTOM_NODE_HEIGHT * zoom,
              }}
            />
          ) : null}
      </ReactFlow>
    </div>
    </NodeUpdateProvider>
    </WebFormFilesProvider>
    </PipeletFilesProvider>
  );
}

export default function App() {
  return (
    <FlowRuntimeProvider>
    <DagDebugProvider>
      <ReactFlowProvider>
        <GotoProvider>
        <DnDProvider>
          <FlowCanvas />
        </DnDProvider>
        </GotoProvider>
      </ReactFlowProvider>
    </DagDebugProvider>
    </FlowRuntimeProvider>
  );
}
