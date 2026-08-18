import React from 'react';
import { NodeProps, Node, Position } from '@xyflow/react';
import { StandardNode, type NodeTag } from './StandardNode';
import type { HandleDef } from './BaseNode';

const handles: HandleDef[] = [
  { type: 'target', position: Position.Top,    id: 'input'  },
  { type: 'source', position: Position.Bottom, id: 'output' },
  { type: 'source', position: Position.Right,  id: 'error'  },
];

const Icon = () => (
  <svg
    width="64"
    height="64"
    viewBox="0 0 64 64"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    style={{ display: 'block', transform: 'translateY(3px)' }}
  >
    <rect x="2" y="2" width="60" height="60" rx="8" fill="#8c939c" />

    <path
      d="M10 4H54C57.3137 4 60 6.68629 60 10V54"
      stroke="white"
      strokeOpacity="0.5"
      strokeWidth="1.5"
      strokeLinecap="round"
    />

    <path
      d="M4 54V10C4 6.68629 6.68629 4 10 4"
      stroke="#50575f"
      strokeOpacity="0.6"
      strokeWidth="1.5"
      strokeLinecap="round"
    />

    <rect x="6" y="6" width="52" height="52" rx="6" fill="#a4adb8" />

    <rect x="2.5" y="2.5" width="59" height="59" rx="7.5" stroke="#50575f" strokeOpacity="0.4" />
    <rect x="3.5" y="3.5" width="57" height="57" rx="7" stroke="white" strokeOpacity="0.35" />
  </svg>
);

interface EndpointParam {
  name: string;
  in: 'path' | 'query' | 'header' | 'body' | 'formData' | 'cookie';
  required?: boolean;
  type?: string;
  description?: string;
}

interface ResponseEntry { status: string; description: string; sample?: unknown }

interface Data {
  label: string;
  subtitle?: string;
  path?: string;
  params?: EndpointParam[];
  requestSample?: unknown;
  responses?: ResponseEntry[];
  [k: string]: unknown;
}

export const FunctionNode: React.FC<NodeProps<Node<Data>>> = ({ data, selected, id }) => {
  // Yalnizca gercek endpoint yolu rozet olur. `subtitle` fallback'i her sade
  // Function node'una ("Execute Logic" gibi) sahte rozet takiyordu.
  const endpointPath = data?.path;

  const tags: NodeTag[] = [];
  if (endpointPath) {
    tags.push({ text: endpointPath, tone: 'resource', title: endpointPath });
  }

  return (
    <StandardNode
      id={id}
      selected={selected}
      label={data?.label || 'Function'}
      glyph={<Icon />}
      handles={handles}
      rotation={data?.rotation as 0 | 90 | 180 | 270 | undefined}
      tags={tags}
    />
  );
};
