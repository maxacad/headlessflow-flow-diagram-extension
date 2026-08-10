import { Handle, Position, useConnection } from '@xyflow/react';
import styled from 'styled-components';
import { NodeWrapper, NodeInner } from './BaseNode';
import { NODE_WIDTH, NODE_HEIGHT } from '../constants';

const ACCENT = '#e3b341';

const CustomIcon = ({ isTarget }: { isTarget: boolean }) => (
  <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="1" y="1" width="30" height="30" rx="6" fill="#1e1e1e"/>
    {isTarget ? (
      /* Drop target: downward arrow */
      <>
        <line x1="16" y1="7" x2="16" y2="22" stroke={ACCENT} strokeWidth="2.5" strokeLinecap="round"/>
        <polyline points="9,16 16,23 23,16" fill="none" stroke={ACCENT} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
      </>
    ) : (
      /* Source: two-sided arrows / connect icon */
      <>
        <circle cx="16" cy="16" r="4" fill="none" stroke={ACCENT} strokeWidth="2"/>
        <line x1="4" y1="16" x2="10" y2="16" stroke={ACCENT} strokeWidth="2" strokeLinecap="round"/>
        <line x1="22" y1="16" x2="28" y2="16" stroke={ACCENT} strokeWidth="2" strokeLinecap="round"/>
        <polyline points="7,13 4,16 7,19" fill="none" stroke={ACCENT} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        <polyline points="25,13 28,16 25,19" fill="none" stroke={ACCENT} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      </>
    )}
  </svg>
);

const Label = styled.div`
  position: absolute;
  bottom: -18px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 9px;
  font-family: var(--vscode-font-family, sans-serif);
  color: #888;
  white-space: nowrap;
  pointer-events: none;
`;

export default function CustomNode({ id, selected }: { id: string; selected?: boolean }) {
  const connection = useConnection();
  const isTarget = connection.inProgress && connection.fromNode.id !== id;
  const label = isTarget ? 'Drop here' : 'Drag to connect';

  return (
    <NodeWrapper $width={NODE_WIDTH} $height={NODE_HEIGHT}>
      {/* Target handle — left side */}
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

      {/* Inner visual box */}
      <NodeInner
        className="node-inner-box"
        $selected={!!selected}
        $accentColor={ACCENT}
      >
        <CustomIcon isTarget={isTarget} />
        <Label>{label}</Label>
      </NodeInner>

      {/* Source handle — right side */}
      {!connection.inProgress && (
        <Handle
          className="node-handle"
          style={{ right: 'calc(50% - var(--inner-half) - var(--handle-gap))', top: '50%', transform: 'translateY(-50%)' }}
          position={Position.Right}
          type="source"
          id="source"
        />
      )}
    </NodeWrapper>
  );
}
