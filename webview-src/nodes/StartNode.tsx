import React, { useEffect, useState } from 'react';
import type { SVGProps } from 'react';
import { NodeProps, Node, Position, useUpdateNodeInternals } from '@xyflow/react';
import styled, { css, keyframes } from 'styled-components';
import { NodeWrapper, BottomHandle, LeftHandle, RightHandle, TopHandle } from './BaseNode';
import { NodeRuntimeOverlay } from './NodeRuntimeOverlay';
import vscodeApi from '../vscodeApi';

const ACCENT = '#1b5e20';

const CellLabel = styled.div`
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

type Rotation = 0 | 90 | 180 | 270;

function normalizeRotation(value: unknown): Rotation {
  return value === 90 || value === 180 || value === 270 ? value : 0;
}

function sourceHandleFor(rotation: Rotation) {
  switch (rotation) {
    case 90:  return LeftHandle;
    case 180: return TopHandle;
    case 270: return RightHandle;
    default:  return BottomHandle;
  }
}

const IconBox = styled.div<{ $selected: boolean; $rotation: Rotation }>`
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

const popoverIn = keyframes`
  from { opacity: 0; transform: translateX(-50%) translateY(3px); }
  to   { opacity: 1; transform: translateX(-50%) translateY(0); }
`;

const Popover = styled.div`
  position: absolute;
  top: calc(50% + 36px);
  left: 50%;
  transform: translateX(-50%);
  z-index: 9999;
  pointer-events: all;
  animation: ${popoverIn} 0.12s ease;
  display: flex;
  gap: 6px;
`;

const PopoverBtn = styled.button`
  display: flex;
  align-items: center;
  gap: 5px;
  height: 28px;
  padding: 0 10px;
  border: none;
  border-radius: 6px;
  background: #1a1a1a;
  color: #e0e0e0;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
  box-shadow: 0 2px 8px rgba(0,0,0,0.35);
  transition: background 0.12s ease;

  &:hover { background: #2a2a2a; }
  &:active { background: #111; }
`;

const Icon = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    xmlnsXlink="http://www.w3.org/1999/xlink"
    width="64"
    height="64"
    x="0"
    y="0"
    preserveAspectRatio="none"
    viewBox="0 0 64 64"
    {...props}
  >
    <defs>
      <linearGradient
        id="Gradient_1"
        x1="0"
        x2="0"
        y1="0"
        y2="0"
        gradientUnits="userSpaceOnUse"
        spreadMethod="pad"
      >
        <stop offset="0%" stopColor="#FFDC87"></stop>
        <stop offset="100%" stopColor="#EEC04E"></stop>
      </linearGradient>
      <filter
        id="Filter_1"
        width="140%"
        height="140%"
        x="-20%"
        y="-20%"
        colorInterpolationFilters="sRGB"
      >
        <feColorMatrix
          in="SourceGraphic"
          result="result1"
          values="1.0937976800000002 -0.07385928000000007 -0.009938400000000009 0 -0.018333333333333354 -0.03740232000000003 1.05734072 -0.009938400000000009 0 -0.018333333333333354 -0.03740232000000003 -0.07385928000000007 1.1212616 0 -0.018333333333333354 0 0 0 1 0"
        ></feColorMatrix>
      </filter>
      <g id="StartNode_0_Layer0_0_FILL">
        <path
          fill="url(#Gradient_1)"
          d="M4.65 26.65L24.9 47.1l20.75-20.6-41 .15m37.5-1.5l.1-6.15H7.9l.1 6.15h34.15M48.4 5.9l-3.8-4.2H5.1L1.6 5.3l.15 7.3 3.65 4.3 40.1.1 2.95-4.15-.05-6.95z"
        ></path>
        <path
          fill="#F8F7E3"
          d="M47 25.15H0L23.55 48.5l1.35-1.4L4.65 26.65l41-.15L47 25.15M44.6 1.7l3.8 4.2L45.7 0H4.65L.05 4.8v9.4l5.35 2.7-3.65-4.3-.15-7.3 3.5-3.6h39.5z"
        ></path>
        <path
          fill="#F99F03"
          d="M49.9 25.15H47l-1.35 1.35L24.9 47.1l-1.35 1.4L25.1 50l24.8-24.85M45.7 0l2.7 5.9.05 6.95L45.5 17l-40.1-.1-5.35-2.7 4.7 4.8h42.1L50 14.35v-9.8L45.7 0z"
        ></path>
      </g>
      <path
        id="StartNode_0_Layer0_0_1_STROKES"
        fill="none"
        stroke="#333"
        strokeLinecap="round"
        strokeLinejoin="bevel"
        strokeWidth="1"
        d="M45.7 0H4.65L.05 4.8v9.4M45.7 0L50 4.55v9.8L46.85 19h-4.6l-.1 6.15h7.75L25.1 50l-1.55-1.5L0 25.15h8L7.9 19H4.75l-4.7-4.8M8 25.15h34.15m.1-6.15H7.9"
      ></path>
    </defs>
    <g filter="url(#Filter_1)">
      <g transform="translate(7 7.4)">
        <use xlinkHref="#StartNode_0_Layer0_0_FILL"></use>
        <use xlinkHref="#StartNode_0_Layer0_0_1_STROKES"></use>
      </g>
    </g>
  </svg>
);

interface Data { label: string; subtitle?: string; [k: string]: unknown }

export const StartNode: React.FC<NodeProps<Node<Data>>> = ({ data, selected, id }) => {
  const [hovered, setHovered] = useState(false);
  const rotation = normalizeRotation(data?.rotation);
  const SourceHandle = sourceHandleFor(rotation);
  const updateNodeInternals = useUpdateNodeInternals();

  useEffect(() => {
    updateNodeInternals(id);
  }, [id, rotation, updateNodeInternals]);

  const handleStart = (e: React.MouseEvent) => {
    e.stopPropagation();
    vscodeApi?.postMessage({ type: 'start-flow', nodeId: id });
  };

  return (
    <NodeWrapper
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <CellLabel>{data?.label ? `${data.label} · ${id}` : id}</CellLabel>
      <SourceHandle type="source" position={rotation === 90 ? Position.Left : rotation === 180 ? Position.Top : rotation === 270 ? Position.Right : Position.Bottom} id="output" className="node-handle" />

      {hovered && (
        <Popover>
          <PopoverBtn onClick={handleStart}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <polygon points="2,1 11,6 2,11" fill="#4caf50" />
            </svg>
            Start
          </PopoverBtn>
        </Popover>
      )}

      <IconBox className="node-inner-box" $selected={selected} $rotation={rotation}>
        <Icon />
        <NodeRuntimeOverlay nodeId={id} />
      </IconBox>
    </NodeWrapper>
  );
};
