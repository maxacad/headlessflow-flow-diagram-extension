import React from 'react';
import { NodeProps, Node, Position } from '@xyflow/react';
import { StandardNode } from './StandardNode';
import type { HandleDef } from './BaseNode';

const handles: HandleDef[] = [
  { type: 'target', position: Position.Top,    id: 'input'  },
  { type: 'source', position: Position.Bottom, id: 'output' },
  { type: 'source', position: Position.Right,  id: 'error'  },
];

const Icon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64" preserveAspectRatio="none">
    <defs>
      <linearGradient id="LoopNode_Gradient_1" gradientUnits="userSpaceOnUse" x1="3" y1="3" x2="45" y2="45" spreadMethod="pad">
        <stop offset="0%" stopColor="#FFD485" />
        <stop offset="100%" stopColor="#F3BF3E" />
      </linearGradient>
    </defs>
    <g transform="translate(7 7.4)">
      {/* turuncu derinlik */}
      <rect x="6" y="6" width="42" height="42" rx="9" fill="#FFA800" />
      {/* sari govde */}
      <rect x="3" y="3" width="42" height="42" rx="9" fill="url(#LoopNode_Gradient_1)" />
      {/* acik ic yuzey */}
      <rect x="7" y="7" width="34" height="34" rx="6" fill="#F5E4B8" fillOpacity="0.55" />
      {/* mavi donus oku */}
      <path fill="none" stroke="#6695FF" strokeWidth="3.2" strokeLinecap="round" d="M12 24 A12 12 0 1 1 20.5 35.4" />
      <path fill="none" stroke="#47ADC6" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" d="M6.5 19 L12 24.5 L17.5 19" />
      {/* kontur */}
      <rect x="3" y="3" width="42" height="42" rx="9" fill="none" stroke="#333333" strokeWidth="1" strokeLinejoin="bevel" />
    </g>
  </svg>
);

interface Data { label: string; subtitle?: string; [k: string]: unknown }

export const LoopNode: React.FC<NodeProps<Node<Data>>> = ({ data, selected, id }) => (
  <StandardNode
    id={id}
    selected={selected}
    label={data?.label || 'Loop'}
    glyph={<Icon />}
    handles={handles}
    rotation={data?.rotation as 0 | 90 | 180 | 270 | undefined}
  />
);
