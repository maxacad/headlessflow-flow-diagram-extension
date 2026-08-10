import React, { useEffect, useRef, useState } from 'react';
import { NodeProps, Node, Position } from '@xyflow/react';
import styled, { keyframes } from 'styled-components';
import { BaseNode, HandleDef } from './BaseNode';
import { useNodeDataUpdate } from '../context/PipeletFilesContext';
import vscodeApi from '../vscodeApi';

const handles: HandleDef[] = [
  { type: 'target', position: Position.Top,    id: 'input'  },
  { type: 'source', position: Position.Bottom, id: 'output' },
  { type: 'source', position: Position.Right,  id: 'error'  },
];

const ACCENT = '#e6a020';

const CallSvg = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    preserveAspectRatio="none"
    width="64px"
    height="64px"
    viewBox="0 0 64 64"
  >
    <defs>
      <linearGradient id="CallNodeSvg_Gradient_1" gradientUnits="userSpaceOnUse" x1="0.125" y1="38.05" x2="49.975" y2="38.05" spreadMethod="pad">
        <stop offset="0%" stopColor="#FFDC87" />
        <stop offset="100%" stopColor="#EEC04E" />
        <stop offset="100%" stopColor="#EEC04E" />
      </linearGradient>

      <linearGradient id="CallNodeSvg_Gradient_2" gradientUnits="userSpaceOnUse" x1="0" y1="11.85" x2="50" y2="11.85" spreadMethod="pad">
        <stop offset="0%" stopColor="#FFDC87" />
        <stop offset="100%" stopColor="#EEC04E" />
      </linearGradient>

      <linearGradient id="CallNodeSvg_Gradient_3" gradientUnits="userSpaceOnUse" x1="32.324999999999996" y1="44.5" x2="49.975" y2="44.5" spreadMethod="pad">
        <stop offset="0%" stopColor="#6695FF" />
        <stop offset="100%" stopColor="#47ADC6" />
      </linearGradient>

      <filter id="CallNodeSvg_Filter_1" x="-20%" y="-20%" width="140%" height="140%" colorInterpolationFilters="sRGB">
        <feColorMatrix in="SourceGraphic" type="matrix" values="1.2194942 -0.18464820000000004 -0.024846000000000003 0 -0.018333333333333354 -0.09350580000000001 1.1283518000000001 -0.024846000000000003 0 -0.018333333333333354 -0.09350580000000001 -0.18464820000000004 1.288154 0 -0.018333333333333354 0 0 0 1 0 " result="result1" />
      </filter>

      <g id="CallNodeSvg_Layer2_0_FILL">
        <path fill="url(#CallNodeSvg_Gradient_1)" stroke="none" d="M 50 35.8 L 50 26.7 0 26.7 0 36.6 13 50 28.65 50 28.65 35.8 50 35.8 Z" />
        <path fill="url(#CallNodeSvg_Gradient_2)" stroke="none" d="M 50 23.8 L 50 12.55 37.15 0 21.5 0 35.5 14.15 0 14.15 0 23.8 50 23.8 Z" />
      </g>

      <g id="CallNodeSvg_Layer1_0_FILL">
        <path fill="#FFF7D9" stroke="none" d="M 35.5 14.6 L 0.5 14.6 0.5 23.4 1.3 21.1 1.25 15.65 34.85 15.65 35.5 14.6 M 49.5 28.65 L 49.45 27.2 0.55 27.15 0.55 28.65 49.5 28.65 Z" />
      </g>

      <g id="CallNodeSvg_Layer0_0_FILL">
        <path fill="url(#CallNodeSvg_Gradient_3)" stroke="none" d="M 32.35 39.1 L 32.35 49.95 50 49.95 50 39.1 32.35 39.1 Z" />
        <path fill="#FFA800" stroke="none" d="M 28.15 35.8 L 26.85 37.05 26.85 49.5 28.15 49.5 28.15 35.8 M 48.25 11.6 L 48.2 23.3 49.5 23.3 49.5 12.8 48.25 11.6 Z" />
      </g>

      <path id="CallNodeSvg_Layer2_0_1_STROKES" stroke="#333333" strokeWidth="1" strokeLinejoin="bevel" strokeLinecap="round" fill="none" d="M 50 23.8 L 50 12.55 37.15 0 21.5 0 35.5 14.15 0 14.15 0 23.8 50 23.8 Z M 50 35.8 L 50 26.7 0 26.7 0 36.6 13 50 28.65 50 28.65 35.8 50 35.8 Z" />
      <path id="CallNodeSvg_Layer0_0_1_STROKES" stroke="#333333" strokeWidth="1" strokeLinejoin="bevel" strokeLinecap="round" fill="none" d="M 32.35 39.1 L 50 39.1 50 49.95 32.35 49.95 32.35 39.1 Z" />
    </defs>

    <g filter="url(#CallNodeSvg_Filter_1)" transform="matrix( 1, 0, 0, 1, 0,0) ">
      <g transform="matrix( 1, 0, 0, 1, 7,7.4) ">
        <g transform="matrix( 1, 0, 0, 1, 0,0) ">
          <use href="#CallNodeSvg_Layer2_0_FILL" />
          <use href="#CallNodeSvg_Layer2_0_1_STROKES" />
        </g>
        <g transform="matrix( 1, 0, 0, 1, 0,0) ">
          <use href="#CallNodeSvg_Layer1_0_FILL" />
        </g>
        <g transform="matrix( 1, 0, 0, 1, 0,0) ">
          <use href="#CallNodeSvg_Layer0_0_FILL" />
          <use href="#CallNodeSvg_Layer0_0_1_STROKES" />
        </g>
      </g>
    </g>
  </svg>
);

// ── Data & normalization ──────────────────────────────────────────────────────

interface StartNodeEntry { id: string; label: string; }
interface FlowEntry {
  name: string;
  startNodes?: Array<{ id?: string; label?: string }>;
  startNodeIds?: string[];
}
interface FlowsResponse { success?: boolean; flows?: FlowEntry[]; }
interface Data {
  label: string;
  subtitle?: string;
  callTarget?: { flow: string; nodeId: string; label: string };
  [k: string]: unknown;
}

function normalizeFlows(raw: FlowsResponse): Array<{ name: string; startNodes: StartNodeEntry[] }> {
  const incoming = Array.isArray(raw.flows) ? raw.flows : [];
  return incoming.map((flow) => {
    const fromStartNodes = Array.isArray(flow.startNodes)
      ? flow.startNodes
          .map((n) => ({ id: String(n.id ?? ''), label: String(n.label ?? n.id ?? '') }))
          .filter((n) => n.id)
      : [];
    const fromStartNodeIds = Array.isArray(flow.startNodeIds)
      ? flow.startNodeIds.map((id) => ({ id: String(id), label: String(id) }))
      : [];
    return {
      name: String(flow.name ?? 'Unnamed Flow'),
      startNodes: fromStartNodes.length > 0 ? fromStartNodes : fromStartNodeIds,
    };
  });
}

// ── Picker styles (matches JumpNode) ─────────────────────────────────────────

const fadeIn = keyframes`
  from { opacity: 0; transform: translateX(-50%) translateY(4px); }
  to   { opacity: 1; transform: translateX(-50%) translateY(0); }
`;

const PickerPanel = styled.div`
  position: absolute;
  top: calc(50% + 42px);
  left: 50%;
  transform: translateX(-50%);
  min-width: 210px;
  max-width: 300px;
  max-height: 280px;
  overflow-y: auto;
  background: #1a2535;
  border: 1px solid #2e4668;
  border-radius: 8px;
  z-index: 1000;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.55);
  animation: ${fadeIn} 0.12s ease;
  pointer-events: all;
`;

const PickerHeader = styled.div`
  padding: 6px 10px 5px;
  font-size: 8.5px;
  font-weight: 700;
  color: #e6a020;
  text-transform: uppercase;
  letter-spacing: 0.6px;
  border-bottom: 1px solid #2e4668;
  font-family: 'Consolas', 'Courier New', monospace;
  position: sticky;
  top: 0;
  background: #1a2535;
`;

const GroupHeader = styled.div`
  padding: 5px 10px 3px;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  color: #4a6a9a;
  font-family: 'Consolas', 'Courier New', monospace;
  border-top: 1px solid #1e3050;
  &:first-of-type { border-top: none; }
`;

const PickerItem = styled.div<{ $active: boolean }>`
  padding: 5px 10px 5px 12px;
  cursor: pointer;
  background: ${({ $active }) => ($active ? 'rgba(230,160,32,0.18)' : 'transparent')};
  border-left: 2px solid ${({ $active }) => ($active ? '#e6a020' : 'transparent')};
  transition: background 0.1s;

  &:hover { background: rgba(230, 160, 32, 0.1); }
`;

const PickerItemLabel = styled.div<{ $active: boolean }>`
  font-size: 11px;
  font-family: 'Consolas', 'Courier New', monospace;
  font-weight: 600;
  color: ${({ $active }) => ($active ? '#ffd066' : '#c8d8ee')};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const PickerItemMeta = styled.div`
  margin-top: 1px;
  font-size: 9.5px;
  font-family: 'Consolas', 'Courier New', monospace;
  color: #4a6a9a;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const StatusMsg = styled.div`
  padding: 12px 10px;
  font-size: 10px;
  color: #4a6a9a;
  text-align: center;
  font-family: 'Consolas', 'Courier New', monospace;
`;

const HintBadge = styled.div`
  position: absolute;
  bottom: -16px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 9px;
  color: #7c7c9c;
  white-space: nowrap;
  pointer-events: none;
  user-select: none;
`;

// ── Component ─────────────────────────────────────────────────────────────────

export const CallNode: React.FC<NodeProps<Node<Data>>> = ({ id, data }) => {
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [ctrlHeld, setCtrlHeld] = useState(false);
  const [flows, setFlows] = useState<Array<{ name: string; startNodes: StartNodeEntry[] }>>([]);
  const [loading, setLoading] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);
  const updateNodeData = useNodeDataUpdate();

  // Fetch flows when picker opens
  useEffect(() => {
    if (!isPickerOpen) return;
    setLoading(true);
    vscodeApi?.postMessage({ type: 'request-flow-start-nodes' });
  }, [isPickerOpen]);

  // Listen for flow-start-nodes-response
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type !== 'flow-start-nodes-response') return;
      setFlows(normalizeFlows((event.data.data ?? {}) as FlowsResponse));
      setLoading(false);
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  // Track Ctrl/Cmd key while hovered
  useEffect(() => {
    if (!hovered) { setCtrlHeld(false); return; }
    const onDown = (e: KeyboardEvent) => { if (e.key === 'Control' || e.key === 'Meta') setCtrlHeld(true); };
    const onUp   = (e: KeyboardEvent) => { if (e.key === 'Control' || e.key === 'Meta') setCtrlHeld(false); };
    document.addEventListener('keydown', onDown);
    document.addEventListener('keyup',   onUp);
    return () => {
      document.removeEventListener('keydown', onDown);
      document.removeEventListener('keyup',   onUp);
    };
  }, [hovered]);

  // Close picker when clicking outside
  useEffect(() => {
    if (!isPickerOpen) return;
    const handleOutside = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as unknown as globalThis.Node)) {
        setIsPickerOpen(false);
      }
    };
    const timer = setTimeout(() => document.addEventListener('mousedown', handleOutside), 50);
    return () => { clearTimeout(timer); document.removeEventListener('mousedown', handleOutside); };
  }, [isPickerOpen]);

  const handleSelect = (flowName: string, node: StartNodeEntry, e: React.MouseEvent) => {
    e.stopPropagation();
    updateNodeData(id, {
      ...(data as Record<string, unknown>),
      callTarget: { flow: flowName, nodeId: node.id, label: node.label },
      subtitle: `${flowName} › ${node.label}`,
    });
    setIsPickerOpen(false);
  };

  const canGoto = !!(ctrlHeld && hovered && data?.callTarget);
  const accentColor = canGoto ? '#4da6ff' : ACCENT;

  return (
    <BaseNode
      nodeId={id}
      selected={false}
      icon={<CallSvg />}
      label={data?.label || 'Call'}
      subtitle={data?.subtitle}
      handles={handles}
      accentColor={accentColor}
      transparentInner
      rotation={data?.rotation as 0 | 90 | 180 | 270 | undefined}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setCtrlHeld(false); }}
      onDoubleClick={(e) => { e.stopPropagation(); setIsPickerOpen(prev => !prev); }}
    >
      {data?.callTarget && !isPickerOpen && (
        <HintBadge>{data.callTarget.flow} › {data.callTarget.label}</HintBadge>
      )}

      {isPickerOpen && (
        <PickerPanel
          ref={pickerRef}
          className="nodrag nopan"
          onMouseDown={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <PickerHeader>Call Pipeline › Start Node</PickerHeader>

          {loading && <StatusMsg>Loading flows…</StatusMsg>}

          {!loading && flows.length === 0 && (
            <StatusMsg>No pipelines found</StatusMsg>
          )}

          {!loading && flows.map(flow => (
            <React.Fragment key={flow.name}>
              <GroupHeader>{flow.name}</GroupHeader>
              {flow.startNodes.length === 0 && <StatusMsg>No start nodes</StatusMsg>}
              {flow.startNodes.map(node => {
                const isActive = data?.callTarget?.flow === flow.name && data?.callTarget?.nodeId === node.id;
                return (
                  <PickerItem
                    key={node.id}
                    $active={isActive}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => handleSelect(flow.name, node, e)}
                  >
                    <PickerItemLabel $active={isActive}>{node.label}</PickerItemLabel>
                    <PickerItemMeta>{node.id}</PickerItemMeta>
                  </PickerItem>
                );
              })}
            </React.Fragment>
          ))}
        </PickerPanel>
      )}
    </BaseNode>
  );
};
