import React from 'react';
import { NodeProps, Node, Position } from '@xyflow/react';
import { StandardNode } from './StandardNode';
import type { HandleDef } from './BaseNode';

const handles: HandleDef[] = [
  { type: 'target', position: Position.Top, id: 'input' },
];

const Icon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    xmlnsXlink="http://www.w3.org/1999/xlink"
    preserveAspectRatio="none"
    width="64px"
    height="64px"
    viewBox="0 0 64 64"
  >
    <defs>
      <linearGradient id="EndNode_Gradient_1" gradientUnits="userSpaceOnUse" x1="-812.7" y1="6.9" x2="825.7" y2="6.9" spreadMethod="pad">
        <stop offset="0%" stopColor="#FFDC87" />
        <stop offset="100%" stopColor="#F3BF3E" />
        <stop offset="100%" stopColor="#EEC04E" />
      </linearGradient>

      <g id="EndNode_Layer4_0_FILL">
        <path fill="#FF9B01" stroke="none" d="M 13.5 55.85 L 7 54 12.05 57.4 52 57.4 57 53.9 57 51.8 51.9 46.55 54.9 52.75 50.35 55.85 13.5 55.85 M 33.6 7.4 L 35.5 13.85 35.5 48.4 37.1 46.55 37.1 12.65 33.6 7.4 Z" />

        <path fill="#FFF2DC" stroke="none" d="M 37.1 46.55 L 35.5 48.4 50.95 48.4 54.9 52.75 51.9 46.55 37.1 46.55 M 35.5 13.85 L 33.6 7.4 31.85 7.4 26.8 12.85 26.8 46.6 12.35 46.6 7 52.1 7 54 13.5 55.85 9.85 53.1 9.85 52.45 13.75 48.15 28.35 48.15 28.35 13.75 32.35 9.55 32.95 9.55 35.5 13.85 Z" />

        <path fill="url(#EndNode_Gradient_1)" stroke="none" d="M 32.35 9.55 L 28.35 13.75 28.35 48.15 13.75 48.15 9.85 52.45 9.85 53.1 13.5 55.85 50.35 55.85 54.9 52.75 50.95 48.4 35.5 48.4 35.5 13.85 32.95 9.55 32.35 9.55 Z" />
      </g>

      <path id="EndNode_Layer4_0_1_STROKES" stroke="#333333" strokeWidth="1" strokeLinejoin="bevel" strokeLinecap="round" fill="none" d="M 37.1 46.55 L 37.1 12.65 33.6 7.4 31.85 7.4 26.8 12.85 26.8 46.6 12.35 46.6 7 52.1 7 54 M 51.9 46.55 L 57 51.8 57 53.9 52 57.4 12.05 57.4 7 54 M 37.1 46.55 L 51.9 46.55" />
    </defs>

    <g transform="matrix( 1, 0, 0, 1, 0,0) ">
      <use xlinkHref="#EndNode_Layer4_0_FILL" />
      <use xlinkHref="#EndNode_Layer4_0_1_STROKES" />
    </g>
  </svg>
);

interface Data { label: string; subtitle?: string; [k: string]: unknown }

export const EndNode: React.FC<NodeProps<Node<Data>>> = ({ data, selected, id }) => (
  <StandardNode
    id={id}
    selected={selected}
    label={data?.label || 'End'}
    glyph={<Icon />}
    handles={handles}
    rotation={data?.rotation as 0 | 90 | 180 | 270 | undefined}
  />
);
