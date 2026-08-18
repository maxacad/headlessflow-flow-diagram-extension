import React, { useEffect } from 'react';
import { Position, useUpdateNodeInternals } from '@xyflow/react';
import styled, { css } from 'styled-components';
import {
  NodeWrapper,
  HandleDef,
  rotatePosition,
  resolveHandle,
} from './BaseNode';
import { NodeRuntimeOverlay } from './NodeRuntimeOverlay';

// -- Types --------------------------------------------------------------------

export type NodeTagTone = 'resource' | 'target' | 'method' | 'actor';

export interface NodeTag {
  /** Rozet metni */
  text: string;
  tone: NodeTagTone;
  /** Hover tooltip - tam deger, metin kisaltildiginda ise yarar */
  title?: string;
  /** Yalnizca tone === 'method' icin: HTTP method rengi */
  color?: string;
}

export interface StandardNodeProps {
  id: string;
  selected: boolean;
  /** CellLabel'da `${label} - ${id}`; yoksa yalnizca id */
  label?: string;
  /** 64x64 SVG */
  glyph: React.ReactNode;
  handles: HandleDef[];
  rotation?: 0 | 90 | 180 | 270;
  tags?: NodeTag[];
  onDoubleClick?: React.MouseEventHandler<HTMLDivElement>;
  onMouseEnter?: React.MouseEventHandler<HTMLDivElement>;
  onMouseLeave?: React.MouseEventHandler<HTMLDivElement>;
  /** Yalnizca calisma-zamani overlay'leri (or. StartNode'un Start popover'i) */
  children?: React.ReactNode;
}

// -- Tone paleti --------------------------------------------------------------

const TAG_TONE: Record<NodeTagTone, { color: string; border: string }> = {
  resource: { color: '#7ab4f5', border: 'rgba(66,131,244,0.22)' },
  target:   { color: '#ffd066', border: 'rgba(230,160,32,0.30)' },
  method:   { color: '#c8d8ee', border: 'rgba(200,216,238,0.30)' },
  actor:    { color: '#c4b5fd', border: 'rgba(124,58,237,0.35)' },
};

// -- Styled primitives --------------------------------------------------------

/** Node'un sol ustundeki kimlik etiketi */
export const CellLabel = styled.div`
  position: absolute;
  top: 4px;
  left: 5px;
  font-family: 'Consolas', 'Courier New', monospace;
  font-size: 9px;
  font-weight: 400;
  color: #243447;
  opacity: 0.5;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 130px;
  pointer-events: none;
  user-select: none;
  letter-spacing: 0.2px;
`;

/** Glyph'i saran 64x64 seffaf kutu - secim ve hover outline'i buraya biner */
export const IconBox = styled.div<{ $selected: boolean; $rotation: number }>`
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 64px;
  height: 64px;
  border-radius: 12px;
  transform: ${({ $rotation }) => ($rotation ? `rotate(${$rotation}deg)` : 'none')};

  ${({ $selected }) =>
    $selected &&
    css`
      outline: 4px solid #ff7105;
      outline-offset: 3px;
    `}
`;

const ResourceTag = styled.div<{ $color: string; $border: string; $index: number }>`
  position: absolute;
  left: calc(50% + 36px);
  top: calc(50% - 32px + ${({ $index }) => $index * 20}px);
  font-family: 'Consolas', 'Courier New', monospace;
  font-size: 10px;
  font-weight: 500;
  color: ${({ $color }) => $color};
  background: rgba(10, 18, 32, 0.72);
  border: 1px solid ${({ $border }) => $border};
  border-radius: 3px;
  padding: 2px 6px;
  max-width: 180px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  letter-spacing: 0.2px;
  pointer-events: none;
  user-select: none;
`;

// -- Component ----------------------------------------------------------------

export function StandardNode({
  id,
  selected,
  label,
  glyph,
  handles,
  rotation,
  tags,
  onDoubleClick,
  onMouseEnter,
  onMouseLeave,
  children,
}: StandardNodeProps) {
  const rot = rotation ?? 0;
  const rotSteps = rot / 90;
  const updateNodeInternals = useUpdateNodeInternals();

  useEffect(() => {
    updateNodeInternals(id);
  }, [id, rotation, updateNodeInternals]);

  return (
    <NodeWrapper
      onDoubleClick={onDoubleClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <CellLabel>{label ? `${label} · ${id}` : id}</CellLabel>

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

      <IconBox className="node-inner-box" $selected={selected} $rotation={rot}>
        {glyph}
        <NodeRuntimeOverlay nodeId={id} />
      </IconBox>

      {(tags ?? []).map((tag, i) => {
        const tone = TAG_TONE[tag.tone];
        const color = tag.tone === 'method' && tag.color ? tag.color : tone.color;
        const border = tag.tone === 'method' && tag.color ? `${tag.color}4d` : tone.border;
        return (
          <ResourceTag
            key={`${tag.tone}-${i}`}
            $color={color}
            $border={border}
            $index={i}
            title={tag.title ?? tag.text}
          >
            {tag.text}
          </ResourceTag>
        );
      })}

      {children}
    </NodeWrapper>
  );
}
