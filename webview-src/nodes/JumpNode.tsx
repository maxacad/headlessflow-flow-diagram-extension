import React, { useState, useRef, useEffect } from 'react';
import { NodeProps, Node, Position, useNodes } from '@xyflow/react';
import styled, { keyframes } from 'styled-components';
import { BaseNode, HandleDef } from './BaseNode';
import { useNodeDataUpdate } from '../context/PipeletFilesContext';

const ACCENT = '#e6a020';

const handles: HandleDef[] = [
  { type: 'target', position: Position.Top, id: 'input' },
];

const Icon = () => (
  <svg width="64" height="64" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M10 6H54L32 28L10 6Z"
      fill="#f3bf3e"
      stroke="#c98a10"
      strokeWidth="2"
      strokeLinejoin="round"
    />
    <path
      d="M10 30H54L32 52L10 30Z"
      fill="#f5e4b8"
      stroke="#c98a10"
      strokeWidth="2"
      strokeLinejoin="round"
    />
  </svg>
);

// ── Picker styles ─────────────────────────────────────────────────────────────

const fadeIn = keyframes`
  from { opacity: 0; transform: translateX(-50%) translateY(4px); }
  to   { opacity: 1; transform: translateX(-50%) translateY(0); }
`;

const PickerPanel = styled.div`
  position: absolute;
  top: calc(50% + 42px);
  left: 50%;
  transform: translateX(-50%);
  min-width: 190px;
  max-width: 280px;
  background: #1a2535;
  border: 1px solid #2e4668;
  border-radius: 8px;
  overflow: hidden;
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
`;

const PickerItem = styled.div<{ $active: boolean }>`
  padding: 6px 10px;
  cursor: pointer;
  background: ${({ $active }) => ($active ? 'rgba(230,160,32,0.18)' : 'transparent')};
  border-left: 2px solid ${({ $active }) => ($active ? '#e6a020' : 'transparent')};
  transition: background 0.1s;

  &:hover {
    background: rgba(230, 160, 32, 0.1);
  }
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

const EmptyMsg = styled.div`
  padding: 12px 10px;
  font-size: 10px;
  color: #4a6a9a;
  text-align: center;
  font-family: 'Consolas', 'Courier New', monospace;
`;

// ── Data ──────────────────────────────────────────────────────────────────────

interface Data { label: string; subtitle?: string; jumpTargetId?: string; [k: string]: unknown }

// ── JumpNode ──────────────────────────────────────────────────────────────────

export const JumpNode: React.FC<NodeProps<Node<Data>>> = ({ data, selected, id }) => {
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [ctrlHeld, setCtrlHeld] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);
  const updateNodeData = useNodeDataUpdate();
  const allNodes = useNodes();

  const startNodes = allNodes.filter(n => n.type === 'start');

  // Track Ctrl key while hovered
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

  const handleSelect = (node: typeof allNodes[number], e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const targetLabel = (node.data as { label?: string }).label ?? node.id;
    updateNodeData(id, { ...(data as Record<string, unknown>), jumpTargetId: node.id, subtitle: targetLabel });
    setIsPickerOpen(false);
  };

  const canGoto = !!(ctrlHeld && hovered && data?.jumpTargetId);
  const accentColor = canGoto ? '#4da6ff' : ACCENT;

  return (
    <BaseNode
      nodeId={id}
      selected={selected}
      icon={<Icon />}
      label={data?.label}
      subtitle={data?.subtitle}
      handles={handles}
      accentColor={accentColor}
      transparentInner
      rotation={data?.rotation as 0 | 90 | 180 | 270 | undefined}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setCtrlHeld(false); }}
      onDoubleClick={(e) => { e.stopPropagation(); setIsPickerOpen(prev => !prev); }}
    >
      {isPickerOpen && (
        <PickerPanel
          ref={pickerRef}
          className="nodrag nopan"
          onMouseDown={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <PickerHeader>Jump to Start Node</PickerHeader>
          {startNodes.length === 0 ? (
            <EmptyMsg>No start nodes in this flow</EmptyMsg>
          ) : (
            startNodes.map(n => {
              const nData = n.data as { label?: string; subtitle?: string };
              const nLabel = nData.label ?? n.id;
              const nSub = nData.subtitle;
              const isActive = data?.jumpTargetId === n.id;
              return (
                <PickerItem
                  key={n.id}
                  $active={isActive}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => handleSelect(n, e)}
                >
                  <PickerItemLabel $active={isActive}>{nLabel}</PickerItemLabel>
                  <PickerItemMeta>{n.id}{nSub ? ` · ${nSub}` : ''}</PickerItemMeta>
                </PickerItem>
              );
            })
          )}
        </PickerPanel>
      )}
    </BaseNode>
  );
};
