import React from 'react';
import { Handle, NodeProps, Node, Position, useNodeConnections } from '@xyflow/react';
import styled from 'styled-components';
import { StandardNode } from './StandardNode';

const CustomHandle = (props: any) => {
  const connections = useNodeConnections({
    handleType: props.type,
    handleId: props.id,
  });

  return (
    <Handle
      disabled={connections.length >= props.connectionCount}
      {...props}
      isConnectable={true}
    />
  );
};

const EdgeHandle = styled(CustomHandle)`
  && {
    width: 10px;
    height: 10px;
    background: #7cb6ff;
    border: 2px solid #ffffff;
    box-shadow: 0 0 0 1px rgba(15, 24, 36, 0.35);
  }
`;

const Icon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
    <defs>
      <radialGradient id="JoinNode_Gradient_1" cx="30%" cy="30%" r="75%">
        <stop offset="0%" stopColor="#F5E4B8" />
        <stop offset="48%" stopColor="#F3BF3E" />
        <stop offset="100%" stopColor="#E6A020" />
      </radialGradient>
    </defs>
    <g transform="translate(32 32)">
      {/* dis halka */}
      <circle r="17" fill="none" stroke="#C98A10" strokeOpacity="0.5" strokeWidth="1" />
      {/* sari govde - eski 28px JoinPoint ile ayni cap */}
      <circle r="14" fill="url(#JoinNode_Gradient_1)" stroke="#C98A10" strokeWidth="1.5" />
      {/* akis yonu ipucu */}
      <path d="M-4 2 L0 6 L4 2" fill="none" stroke="#7A4A00" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      {/* kontur */}
      <circle r="14" fill="none" stroke="#333333" strokeWidth="1" strokeOpacity="0.55" />
    </g>
  </svg>
);

interface Data { label: string; subtitle?: string; [k: string]: unknown }

export const JoinNode: React.FC<NodeProps<Node<Data>>> = ({ selected, id, data }) => (
  <StandardNode
    id={id}
    selected={selected}
    label={data?.label || 'Join'}
    glyph={<Icon />}
    handles={[]}
  >
    <EdgeHandle
      type="target"
      position={Position.Top}
      id="centerInput"
      className="node-handle"
      connectionCount={4}
      style={{ left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }}
    />
    <EdgeHandle
      type="source"
      position={Position.Bottom}
      id="output"
      className="node-handle"
      connectionCount={1}
      style={{ left: '50%', top: '50%', transform: 'translate(-50%, calc(-50% + 24px))' }}
    />
  </StandardNode>
);
