import React from 'react';
import { NodeProps, Node, Position } from '@xyflow/react';
import { BaseNode, HandleDef } from './BaseNode';

const ACCENT = '#283593';

const handles: HandleDef[] = [
  { type: 'target', position: Position.Top,    id: 'input'  },
  { type: 'source', position: Position.Bottom, id: 'output' },
  { type: 'source', position: Position.Right,  id: 'error'  },
];

const Icon = () => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M1 4v6h6" />
    <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
  </svg>
);

interface Data { label: string; subtitle?: string; [k: string]: unknown }

export const LoopNode: React.FC<NodeProps<Node<Data>>> = ({ data, selected, id }) => (
  <BaseNode
    nodeId={id}
    selected={selected}
    icon={<Icon />}
    label={data?.label || 'Loop'}
    subtitle={data?.subtitle}
    handles={handles}
    accentColor={ACCENT}
    rotation={data?.rotation as 0 | 90 | 180 | 270 | undefined}
  />
);
