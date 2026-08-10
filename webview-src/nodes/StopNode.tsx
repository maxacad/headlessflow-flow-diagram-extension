import React from 'react';
import { NodeProps, Node, Position } from '@xyflow/react';
import { BaseNode, HandleDef } from './BaseNode';

const ACCENT = '#c62828';

const handles: HandleDef[] = [
  { type: 'target', position: Position.Top, id: 'input' },
];

const Icon = () => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor">
    <rect x="3" y="3" width="18" height="18" rx="3" />
  </svg>
);

interface Data { label: string; subtitle?: string; [k: string]: unknown }

export const StopNode: React.FC<NodeProps<Node<Data>>> = ({ data, selected, id }) => (
  <BaseNode
    nodeId={id}
    selected={selected}
    icon={<Icon />}
    label={data?.label || 'Stop'}
    subtitle={data?.subtitle}
    handles={handles}
    accentColor={ACCENT}
    rotation={data?.rotation as 0 | 90 | 180 | 270 | undefined}
  />
);
