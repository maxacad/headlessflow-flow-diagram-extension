import React from 'react';
import type { SVGProps } from 'react';
import { NodeProps, Node, Position } from '@xyflow/react';
import { StandardNode, type NodeTag } from './StandardNode';
import type { HandleDef } from './BaseNode';
import { usePipeletFiles } from '../context/PipeletFilesContext';

const Icon = (props: SVGProps<SVGSVGElement>) => (
  <svg
    width={64}
    height={64}
    viewBox="0 0 64 64"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    <rect x="2" y="2" width="60" height="60" rx="9" fill="#000000" />
    <rect x="3.5" y="3.5" width="57" height="57" rx="7" fill="#F05412" />
    <path
      d="M11 5H53C57.4183 5 61 8.58172 61 13V55"
      stroke="#FF8A50"
      strokeWidth="2"
      strokeLinecap="round"
      strokeOpacity="0.6"
    />
    <path
      d="M5 53V11C5 6.58172 8.58172 3 13 3"
      stroke="#8A300A"
      strokeWidth="2"
      strokeLinecap="round"
      strokeOpacity="0.5"
      transform="rotate(180 32 32)"
    />
    <rect x="6" y="6" width="52" height="52" rx="5" fill="white" fillOpacity="0.05" />
  </svg>
);

const handles: HandleDef[] = [
  { type: 'target', position: Position.Top,    id: 'input'  },
  { type: 'source', position: Position.Bottom, id: 'output' },
  { type: 'source', position: Position.Right,  id: 'error'  },
];

interface Data {
  label: string;
  subtitle?: string;
  pipeletFile?: string;
  pipeletHandler?: string;
  pipeletSkill?: string;
  pipeletAi?: Record<string, unknown>;
  pipeletInputs?: Record<string, string>;
  pipeletOutputs?: Record<string, string>;
  [k: string]: unknown;
}

export const ProcessNode: React.FC<NodeProps<Node<Data>>> = ({ selected, id, data }) => {
  const files = usePipeletFiles();

  const pipeletFile = data?.pipeletFile;
  const pipeletMeta = files.find((file) => file.name === pipeletFile);
  const pipeletLabel = pipeletMeta?.handler ?? data?.pipeletHandler ?? pipeletFile;

  const tags: NodeTag[] = [];
  if (pipeletFile) {
    const text = pipeletLabel && pipeletLabel !== pipeletFile
      ? `${pipeletFile} · ${pipeletLabel}`
      : pipeletFile;
    tags.push({ text, tone: 'resource', title: text });
  }

  return (
    <StandardNode
      id={id}
      selected={selected}
      label={data?.label}
      glyph={<Icon />}
      handles={handles}
      rotation={data?.rotation as 0 | 90 | 180 | 270 | undefined}
      tags={tags}
    />
  );
};
