import React from 'react';
import { Handle, NodeProps, Node, Position, useNodeConnections } from '@xyflow/react';
import styled, { css } from 'styled-components';
import { NodeWrapper } from './BaseNode';
import { NODE_WIDTH, NODE_HEIGHT } from '../constants';

const RADIUS = 16;

const CustomHandle = (props: any) => {
  const connections = useNodeConnections({
    handleType: props.type,
    handleId: props.id,
  });

  //if (connections.length >= props.connectionCount) return null;

  return (
    <Handle
    disabled={connections.length >= props.connectionCount}
      {...props}
      isConnectable={true}
    />
  );
};

const JoinPoint = styled.div<{ $selected: boolean }>`
  width: 28px;
  height: 28px;
  border-radius: 999px;
  background: radial-gradient(circle at 30% 30%, #f5e4b8 0%, #f3bf3e 48%, #e6a020 100%);
  border: 1.5px solid #c98a10;
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: inset 0 1px 2px rgba(255, 255, 255, 0.3), inset 0 -2px 4px rgba(0, 0, 0, 0.25);

  ${({ $selected }) =>
    $selected &&
    css`
      outline: 4px solid #ff7105;
      outline-offset: 3px;
    `}
`;

const FlowHint = styled.svg`
  width: 36px;
  height: 36px;
  overflow: visible;
`;

const EdgeHandle = styled(CustomHandle)`
  && {
    width: 10px;
    height: 10px;
    background: #7cb6ff;
    border: 2px solid #ffffff;
    box-shadow: 0 0 0 1px rgba(15, 24, 36, 0.35);
  }
`;

interface Data { label: string; subtitle?: string; [k: string]: unknown }

// Project-level extension for handle placement semantics.
// We do not patch @xyflow Position enum in node_modules.
type ExtendedPosition = Position | 'center';

function resolveHandlePosition(position: ExtendedPosition): Position {
  return position === 'center' ? Position.Top : position;
}

export const JoinNode: React.FC<NodeProps<Node<Data>>> = ({ selected }) => (
  <NodeWrapper $width={NODE_WIDTH} $height={NODE_HEIGHT}>
    <EdgeHandle
      type="target"
      position={resolveHandlePosition('center')}
      id="centerInput"
      className="node-handle"
      style={{ left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }}
              connectionCount={4}

    />

    <EdgeHandle
      type="source"
      position={Position.Bottom}
      id="output"
      className="node-handle"
      connectionCount={1}
      style={{ left: '50%', top: '50%', transform: `translate(calc(-50% + 0px), calc(-50% + ${RADIUS+8}px))` }}
    />

    <JoinPoint className="node-inner-box" $selected={selected}>
      <FlowHint viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <circle cx="18" cy="18" r="14" stroke="#c98a10" strokeOpacity="0.5" strokeWidth="1" />
        <path d="M14.5 22.5L18 26L21.5 22.5" stroke="#7a4a00" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </FlowHint>
    </JoinPoint>
  </NodeWrapper>
);
