import React from 'react';
import { NodeProps, Node, Position } from '@xyflow/react';
import styled from 'styled-components';
import { BaseNode, HandleDef, NodeWrapper, NodeInner, NodeIcon, NodeLabel, NodeSubtitle, BottomHandle, RightHandle, TopHandle } from './BaseNode';

const ACCENT = '#e65100';

const handles: HandleDef[] = [
  { type: 'target', position: Position.Top,    id: 'input' },
  { type: 'source', position: Position.Bottom, id: 'yes'   },
  { type: 'source', position: Position.Right,  id: 'no'    },
];

// Decision node has a diamond-shaped inner box
const DiamondInner = styled(NodeInner)`
  border-radius: 4px;
  transform: rotate(45deg);

  & > * {
    transform: rotate(-45deg);
  }
`;

const Icon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    xmlnsXlink="http://www.w3.org/1999/xlink"
    width="64px"
    height="64px"
    viewBox="0 0 64 64"
    preserveAspectRatio="none"
  >
    <defs>
      <linearGradient id="DecisionNode_Gradient_1" gradientUnits="userSpaceOnUse" x1="100.17500000000001" y1="61.125" x2="130.625" y2="91.775" spreadMethod="pad">
        <stop offset="18.823529411764707%" stopColor="#81A6CD" />
        <stop offset="100%" stopColor="#6691BF" />
      </linearGradient>

      <linearGradient id="DecisionNode_Gradient_2" gradientUnits="userSpaceOnUse" x1="6.274999999999999" y1="32.4" x2="57.625" y2="32.4" spreadMethod="pad">
        <stop offset="0%" stopColor="#FFD485" />
        <stop offset="100%" stopColor="#F3BF3E" />
        <stop offset="100%" stopColor="#EEC04E" />
      </linearGradient>

      <g id="DecisionNode_Layer1_0_FILL">
        <path fill="url(#DecisionNode_Gradient_1)" stroke="none" d="M 29.5 60.25 L 29.55 60.35 33.4 60.35 29.5 60.25 M 34.65 60.3 L 34.65 60.35 35.85 59.1 34.65 60.3 M 26.15 7.7 L 29.35 4.55 34.9 4.55 38.1 7.65 35 4.45 29.3 4.45 26.15 7.7 Z" />

        <path fill="#FAAB34" stroke="none" d="M 4.5 31.05 L 4.15 29.9 4.15 34.7 29.5 60.25 33.4 60.35 34.65 60.35 29.85 58.25 6.3 34.55 4.5 31.05 M 57.65 29.9 L 57.65 34.5 59.9 29.65 38.1 7.65 34.9 4.55 29.35 4.55 34.25 6.55 57.65 29.9 Z" />

        <path fill="#F5E4B8" stroke="none" d="M 34.25 6.55 L 29.35 4.55 26.15 7.7 4.15 29.9 4.5 31.05 6.3 34.55 6.3 30.2 30.05 6.55 34.25 6.55 M 59.75 35.1 L 59.9 29.65 57.65 34.5 34.1 58.25 29.85 58.25 34.65 60.35 34.65 60.3 35.85 59.1 Q 36.45 58.55 37.05 57.95 L 59.75 35.1 Z" />

        <path fill="url(#DecisionNode_Gradient_2)" stroke="none" d="M 57.65 34.5 L 57.65 29.9 34.25 6.55 30.05 6.55 6.3 30.2 6.3 34.55 29.85 58.25 34.1 58.25 57.65 34.5 Z" />
      </g>

      <path id="DecisionNode_Layer1_0_1_STROKES" stroke="#333333" strokeWidth="1" strokeLinejoin="bevel" strokeLinecap="round" fill="none" d="M 38.1 7.65 L 59.9 29.65 59.75 35.1 37.05 57.95 Q 36.45 58.55 35.85 59.1 L 34.65 60.35 33.4 60.35 29.55 60.35 29.5 60.25 4.15 34.7 4.15 29.9 26.15 7.7 29.3 4.45 35 4.45 38.1 7.65 Z" />
    </defs>

    <g transform="matrix( 1, 0, 0, 1, 0,0) ">
      <use xlinkHref="#DecisionNode_Layer1_0_FILL" />
      <use xlinkHref="#DecisionNode_Layer1_0_1_STROKES" />
    </g>
  </svg>
);

interface Data { label: string; subtitle?: string; [k: string]: unknown }

export const DecisionNode: React.FC<NodeProps<Node<Data>>> = ({ data, selected, id }) => (
  <BaseNode
    nodeId={id}
    selected={selected}
    icon={<Icon />}
    label={data?.label || 'Decision'}
    subtitle={data?.subtitle}
    handles={handles}
    accentColor={ACCENT}
    transparentInner
    rotation={data?.rotation as 0 | 90 | 180 | 270 | undefined}
  />
);
