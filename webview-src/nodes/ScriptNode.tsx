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
      <linearGradient id="ScriptNode_Gradient_1" gradientUnits="userSpaceOnUse" x1="4" y1="2" x2="42" y2="44" spreadMethod="pad">
        <stop offset="0%" stopColor="#FFDC87" />
        <stop offset="100%" stopColor="#EEC04E" />
      </linearGradient>
    </defs>
    <g transform="translate(7 7.4)">
      {/* turuncu derinlik golgesi */}
      <path fill="#FFA800" d="M8 6 L46 6 L46 48 L8 48 Z" />
      {/* sari govde */}
      <path fill="url(#ScriptNode_Gradient_1)" d="M4 2 L42 2 L42 44 L4 44 Z" />
      {/* acik baslik seridi */}
      <path fill="#FFF7D9" d="M4 2 L42 2 L42 8 L4 8 Z" />
      {/* mavi aksan chevron'lar */}
      <path fill="none" stroke="#6695FF" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" d="M17 18 L11 26 L17 34" />
      <path fill="none" stroke="#47ADC6" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" d="M29 18 L35 26 L29 34" />
      {/* kontur */}
      <path fill="none" stroke="#333333" strokeWidth="1" strokeLinejoin="bevel" strokeLinecap="round" d="M4 2 L42 2 L42 44 L4 44 Z M4 8 L42 8" />
    </g>
  </svg>
);

interface Data { label: string; subtitle?: string; [k: string]: unknown }

export const ScriptNode: React.FC<NodeProps<Node<Data>>> = ({ data, selected, id }) => (
  <StandardNode
    id={id}
    selected={selected}
    label={data?.label || 'Script'}
    glyph={<Icon />}
    handles={handles}
    rotation={data?.rotation as 0 | 90 | 180 | 270 | undefined}
  />
);
