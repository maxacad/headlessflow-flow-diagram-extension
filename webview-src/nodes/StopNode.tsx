import React from 'react';
import { NodeProps, Node, Position } from '@xyflow/react';
import { StandardNode } from './StandardNode';
import type { HandleDef } from './BaseNode';

const handles: HandleDef[] = [
  { type: 'target', position: Position.Top, id: 'input' },
];

const Icon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64" preserveAspectRatio="none">
    <defs>
      <linearGradient id="StopNode_Gradient_1" gradientUnits="userSpaceOnUse" x1="2" y1="2" x2="48" y2="48" spreadMethod="pad">
        <stop offset="0%" stopColor="#FFDC87" />
        <stop offset="100%" stopColor="#EEC04E" />
      </linearGradient>
    </defs>
    <g transform="translate(7 7.4)">
      {/* turuncu derinlik */}
      <path fill="#FF9B01" d="M18 5 L36 5 L48 17 L48 35 L36 47 L18 47 L6 35 L6 17 Z" />
      {/* sari sekizgen govde */}
      <path fill="url(#StopNode_Gradient_1)" d="M16 2 L34 2 L46 14 L46 32 L34 44 L16 44 L4 32 L4 14 Z" />
      {/* acik ic yuzey */}
      <path fill="#FEF4DC" fillOpacity="0.5" d="M18 6 L32 6 L42 16 L42 30 L32 40 L18 40 L8 30 L8 16 Z" />
      {/* mavi dur karesi */}
      <rect x="18" y="16" width="14" height="14" rx="2.5" fill="#426DB8" />
      {/* kontur */}
      <path fill="none" stroke="#333333" strokeWidth="1" strokeLinejoin="bevel" strokeLinecap="round" d="M16 2 L34 2 L46 14 L46 32 L34 44 L16 44 L4 32 L4 14 Z" />
    </g>
  </svg>
);

interface Data { label: string; subtitle?: string; [k: string]: unknown }

export const StopNode: React.FC<NodeProps<Node<Data>>> = ({ data, selected, id }) => (
  <StandardNode
    id={id}
    selected={selected}
    label={data?.label || 'Stop'}
    glyph={<Icon />}
    handles={handles}
    rotation={data?.rotation as 0 | 90 | 180 | 270 | undefined}
  />
);
