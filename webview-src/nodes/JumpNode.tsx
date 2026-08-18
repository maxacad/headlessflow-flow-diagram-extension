import React from 'react';
import { NodeProps, Node, Position, useNodes } from '@xyflow/react';
import { StandardNode, type NodeTag } from './StandardNode';
import type { HandleDef } from './BaseNode';

const handles: HandleDef[] = [
  { type: 'target', position: Position.Top, id: 'input' },
];

const Icon = () => (
  <svg width="64" height="64" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M10 6H54L32 28L10 6Z"
      fill="#f3bf3e"
      stroke="#c98a10"
      strokeWidth="2"
      strokeLinejoin="round"
    />
    <path
      d="M10 30H54L32 52L10 30Z"
      fill="#f5e4b8"
      stroke="#c98a10"
      strokeWidth="2"
      strokeLinejoin="round"
    />
  </svg>
);

interface Data { label: string; subtitle?: string; jumpTargetId?: string; [k: string]: unknown }

export const JumpNode: React.FC<NodeProps<Node<Data>>> = ({ data, selected, id }) => {
  const allNodes = useNodes();
  const targetId = data?.jumpTargetId;
  const targetNode = targetId ? allNodes.find((n) => n.id === targetId) : undefined;
  const targetLabel = (targetNode?.data as { label?: string } | undefined)?.label ?? targetId;

  const tags: NodeTag[] = [];
  if (targetId) {
    tags.push({ text: String(targetLabel), tone: 'target', title: `${targetLabel} (${targetId})` });
  }

  return (
    <StandardNode
      id={id}
      selected={selected}
      label={data?.label || 'Jump'}
      glyph={<Icon />}
      handles={handles}
      rotation={data?.rotation as 0 | 90 | 180 | 270 | undefined}
      tags={tags}
    />
  );
};
