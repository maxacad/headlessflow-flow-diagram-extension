import { Handle, Position } from '@xyflow/react';
import styled from 'styled-components';
import { NODE_WIDTH, NODE_HEIGHT } from '../constants';

// -- Types --------------------------------------------------------------------

export interface HandleDef {
  type: 'source' | 'target';
  position: Position;
  id: string;
}

// -- Styled primitives --------------------------------------------------------

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

// -- Rotation helpers ---------------------------------------------------------

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
