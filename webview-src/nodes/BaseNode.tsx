import React, { useEffect } from 'react';
import { Handle, Position, useUpdateNodeInternals } from '@xyflow/react';
import styled, { css } from 'styled-components';
import { NODE_WIDTH, NODE_HEIGHT } from '../constants';
import { NodeRuntimeOverlay } from './NodeRuntimeOverlay';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface HandleDef {
  type: 'source' | 'target';
  position: Position;
  id: string;
}

export interface BaseNodeProps {
  selected: boolean;
  icon: React.ReactNode;
  label: string;
  subtitle?: string;
  handles: HandleDef[];
  accentColor: string;
  transparentInner?: boolean;
  children?: React.ReactNode;
  nodeId?: string;
  rotation?: 0 | 90 | 180 | 270;
  onMouseEnter?: React.MouseEventHandler<HTMLDivElement>;
  onMouseLeave?: React.MouseEventHandler<HTMLDivElement>;
  onDoubleClick?: React.MouseEventHandler<HTMLDivElement>;
  onClick?: React.MouseEventHandler<HTMLDivElement>;
}

// ── Styled primitives ──────────────────────────────────────────────────────────

export const NodeWrapper = styled.div<{ $width?: number; $height?: number }>`
  --inner-size: 64px;
  --inner-half: 32px;
  --handle-gap: 10px;
  width: ${({ $width }) => $width ?? NODE_WIDTH}px;
  height: ${({ $height }) => $height ?? NODE_HEIGHT}px;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  cursor: default;
  overflow: visible;
  pointer-events: none;

  & .node-inner-box {
    pointer-events: all;
    cursor: grab;
  }

  & .node-handle,
  & .react-flow__handle {
    pointer-events: all;
  }

  &:hover .node-inner-box {
    outline: 4px solid #4283f4;
    outline-offset: 3px;
  }
`;

export const NodeInner = styled.div<{ $selected: boolean; $accentColor: string; $transparent?: boolean }>`
  position: relative;
  width: var(--inner-size);
  height: var(--inner-size);
  padding: 4px;
  background: ${({ $transparent }) => ($transparent ? 'transparent' : 'linear-gradient(180deg, #ffffff 100%, #f7f9fc 100%)')};
  border: ${({ $transparent }) => ($transparent ? 'none' : '1.5px solid #cfd8e3')};
  border-left: ${({ $transparent, $accentColor }) => ($transparent ? 'none' : `4px solid ${$accentColor}`)};
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  align-items: center;
  justify-content: center;
  transition: border-color 0.15s ease;

  ${({ $selected }) =>
    $selected &&
    css`
      outline: 4px solid #ff7105 !important;
      outline-offset: 3px;
    `}
`;

export const NodeIcon = styled.div<{ $color: string }>`
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 0;
  margin-bottom: 1px;
  color: ${({ $color }) => $color};
`;

export const NodeLabel = styled.div`
  font-size: 12px;
  font-weight: 700;
  color: #243447;
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
  user-select: none;
`;

export const NodeSubtitle = styled.div`
  font-size: 9px;
  color: #60758a;
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
  user-select: none;
`;

// Handle placement helpers (mirror the CSS classes from index.css)
export const TopHandle = styled(Handle)`
  && {
    top: calc(50% - var(--inner-half) - var(--handle-gap)) !important;
  }
`;

export const BottomHandle = styled(Handle)`
  && {
    bottom: calc(50% - var(--inner-half) - var(--handle-gap)) !important;
  }
`;

export const RightHandle = styled(Handle)`
  && {
    right: calc(50% - var(--inner-half) - var(--handle-gap)) !important;
  }
`;

export const LeftHandle = styled(Handle)`
  && {
    left: calc(50% - var(--inner-half) - var(--handle-gap)) !important;
  }
`;

const POSITION_ORDER = [Position.Top, Position.Right, Position.Bottom, Position.Left];

export function rotatePosition(pos: Position, steps: number): Position {
  const idx = POSITION_ORDER.indexOf(pos);
  if (idx === -1) return pos;
  return POSITION_ORDER[(idx + steps + 4) % 4];
}

export function resolveHandle(pos: Position) {
  switch (pos) {
    case Position.Top:    return TopHandle;
    case Position.Bottom: return BottomHandle;
    case Position.Right:  return RightHandle;
    case Position.Left:   return LeftHandle;
    default:              return Handle;
  }
}

// ── BaseNode component ─────────────────────────────────────────────────────────

export function BaseNode({ selected, icon, label, subtitle, handles, accentColor, transparentInner, children, nodeId, rotation, onMouseEnter, onMouseLeave, onDoubleClick, onClick }: BaseNodeProps) {
  const rot = rotation ?? 0;
  const rotSteps = rot / 90;
  const updateNodeInternals = useUpdateNodeInternals();

  useEffect(() => {
    if (nodeId) updateNodeInternals(nodeId);
  }, [rotation, nodeId, updateNodeInternals]);

  return (
    <NodeWrapper onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave} onDoubleClick={onDoubleClick} onClick={onClick}>
      {handles.map((h) => {
        const rotatedPos = rotatePosition(h.position, rotSteps);
        const StyledHandle = resolveHandle(rotatedPos);
        return (
          <StyledHandle
            key={h.id}
            type={h.type}
            position={rotatedPos}
            id={h.id}
            className="node-handle"
          />
        );
      })}

      <NodeInner
        className="node-inner-box"
        $selected={selected}
        $accentColor={accentColor}
        $transparent={transparentInner}
        style={{ transform: rot ? `rotate(${rot}deg)` : undefined }}
      >
        <NodeIcon $color={accentColor}>{icon}</NodeIcon>
        <NodeLabel>{label}</NodeLabel>
        {subtitle && <NodeSubtitle>{subtitle}</NodeSubtitle>}
        {nodeId && <NodeRuntimeOverlay nodeId={nodeId} />}
      </NodeInner>

      {children}
    </NodeWrapper>
  );
}
