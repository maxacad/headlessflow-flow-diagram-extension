import React from 'react';
import { Handle, Position, useConnection } from '@xyflow/react';
import { StandardNode } from './StandardNode';

/** Baglanti hedefi: asagi ok + toplayici tabla */
const TargetIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
    <defs>
      <linearGradient id="CustomNodeTarget_Gradient_1" gradientUnits="userSpaceOnUse" x1="3" y1="3" x2="45" y2="45" spreadMethod="pad">
        <stop offset="0%" stopColor="#FFDC87" />
        <stop offset="100%" stopColor="#EEC04E" />
      </linearGradient>
    </defs>
    <g transform="translate(7 7.4)">
      <rect x="6" y="6" width="42" height="42" rx="9" fill="#FFA800" />
      <rect x="3" y="3" width="42" height="42" rx="9" fill="url(#CustomNodeTarget_Gradient_1)" />
      <path fill="none" stroke="#6695FF" strokeWidth="3.2" strokeLinecap="round" d="M24 10 L24 28" />
      <path fill="none" stroke="#47ADC6" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" d="M16 21 L24 29 L32 21" />
      <path fill="none" stroke="#426DB8" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" d="M13 34 L13 38 L35 38 L35 34" />
      <rect x="3" y="3" width="42" height="42" rx="9" fill="none" stroke="#333333" strokeWidth="1" strokeLinejoin="bevel" />
    </g>
  </svg>
);

/** Baglanti kaynagi: iki yonlu konnektor */
const SourceIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
    <defs>
      <linearGradient id="CustomNodeSource_Gradient_1" gradientUnits="userSpaceOnUse" x1="3" y1="3" x2="45" y2="45" spreadMethod="pad">
        <stop offset="0%" stopColor="#FFDC87" />
        <stop offset="100%" stopColor="#EEC04E" />
      </linearGradient>
    </defs>
    <g transform="translate(7 7.4)">
      <rect x="6" y="6" width="42" height="42" rx="9" fill="#FFA800" />
      <rect x="3" y="3" width="42" height="42" rx="9" fill="url(#CustomNodeSource_Gradient_1)" />
      <circle cx="24" cy="24" r="6" fill="none" stroke="#426DB8" strokeWidth="2.6" />
      <path fill="none" stroke="#6695FF" strokeWidth="2.6" strokeLinecap="round" d="M8 24 L15 24 M33 24 L40 24" />
      <path fill="none" stroke="#47ADC6" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" d="M12 20 L8 24 L12 28 M36 20 L40 24 L36 28" />
      <rect x="3" y="3" width="42" height="42" rx="9" fill="none" stroke="#333333" strokeWidth="1" strokeLinejoin="bevel" />
    </g>
  </svg>
);

export default function CustomNode({ id, selected }: { id: string; selected?: boolean }) {
  const connection = useConnection();
  const isTarget = connection.inProgress && connection.fromNode.id !== id;

  return (
    <StandardNode
      id={id}
      selected={!!selected}
      label={isTarget ? 'Drop here' : 'Drag to connect'}
      glyph={isTarget ? <TargetIcon /> : <SourceIcon />}
      handles={[]}
    >
      {(!connection.inProgress || isTarget) && (
        <Handle
          className="node-handle"
          style={{ left: 'calc(50% - var(--inner-half) - var(--handle-gap))', top: '50%', transform: 'translateY(-50%)' }}
          position={Position.Left}
          type="target"
          id="target"
          isConnectableStart={false}
        />
      )}
      {!connection.inProgress && (
        <Handle
          className="node-handle"
          style={{ right: 'calc(50% - var(--inner-half) - var(--handle-gap))', top: '50%', transform: 'translateY(-50%)' }}
          position={Position.Right}
          type="source"
          id="source"
        />
      )}
    </StandardNode>
  );
}
