import React from 'react';
import { NodeProps, Node, Position } from '@xyflow/react';
import { BaseNode, HandleDef } from './BaseNode';

const ACCENT = '#6a1b9a';

const handles: HandleDef[] = [
  { type: 'target', position: Position.Top,    id: 'input'  },
  { type: 'source', position: Position.Bottom, id: 'output' },
  { type: 'source', position: Position.Right,  id: 'error'  },
];

const Icon = () => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <polyline points="16 18 22 12 16 6" />
    <polyline points="8 6 2 12 8 18" />
  </svg>
);

interface Data { label: string; subtitle?: string; [k: string]: unknown }

export const ScriptNode: React.FC<NodeProps<Node<Data>>> = ({ data, selected, id }) => (
  <BaseNode
    nodeId={id}
    selected={selected}
    icon={<Icon />}
    label={data?.label || 'Script'}
    subtitle={data?.subtitle}
    handles={handles}
    accentColor={ACCENT}
    rotation={data?.rotation as 0 | 90 | 180 | 270 | undefined}
  />
);
