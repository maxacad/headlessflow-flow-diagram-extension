import React from 'react';
import { NodeProps, Node, Position } from '@xyflow/react';
import { StandardNode } from './StandardNode';
import type { HandleDef } from './BaseNode';

const handles: HandleDef[] = [
  { type: 'target', position: Position.Top,    id: 'input'  },
  { type: 'source', position: Position.Bottom, id: 'output' },
];

const Icon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    xmlnsXlink="http://www.w3.org/1999/xlink"
    preserveAspectRatio="none"
    width="64px"
    height="64px"
    viewBox="0 0 64 64"
  >
    <defs>
      <linearGradient id="ViewNode_Gradient_1" gradientUnits="userSpaceOnUse" x1="2.412499999999998" y1="43.2" x2="48.587500000000006" y2="43.2" spreadMethod="pad">
        <stop offset="0%" stopColor="#FFDC87" />
        <stop offset="100%" stopColor="#EEC04E" />
      </linearGradient>

      <linearGradient id="ViewNode_Gradient_2" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="0" spreadMethod="pad">
        <stop offset="0%" stopColor="#426DB8" />
        <stop offset="100%" stopColor="#47ADC6" />
      </linearGradient>

      <linearGradient id="ViewNode_Gradient_3" gradientUnits="userSpaceOnUse" x1="2.7375000000000007" y1="14.4" x2="48.8625" y2="14.4" spreadMethod="pad">
        <stop offset="0%" stopColor="#FFDC87" />
        <stop offset="100%" stopColor="#EEC04E" />
        <stop offset="100%" stopColor="#EEC04E" />
      </linearGradient>

      <filter id="ViewNode_Filter_1" x="-20%" y="-20%" width="140%" height="140%" colorInterpolationFilters="sRGB">
        <feColorMatrix in="SourceGraphic" type="matrix" values="1.1866780000000001 -0.16453800000000002 -0.022140000000000003 0 -0.011764705882352941 -0.08332200000000001 1.105462 -0.022140000000000003 0 -0.011764705882352941 -0.08332200000000001 -0.16453800000000002 1.24786 0 -0.011764705882352941 0 0 0 1 0 " result="result1" />
      </filter>

      <g id="ViewNode_Layer0_0_FILL">
        <path fill="url(#ViewNode_Gradient_1)" stroke="none" d="M 48.45 41.8 L 45.25 38.7 4.5 38.7 1.75 41.4 1.75 45.1 5.15 48.65 44.95 48.6 48.45 44.95 48.45 41.8 Z" />

        <path fill="#FFB704" stroke="none" d="M 49.8 45.95 L 49.8 40.7 45.9 36.85 48.45 41.8 48.45 44.95 44.95 48.6 5.15 48.65 0 45.95 4 50 46.15 50 49.8 45.95 M 46.35 0 L 48.3 5.05 48.3 22.6 45.2 25.85 5.15 25.85 0.3 23.65 4.15 27.6 8.05 27.6 42.15 27.6 46.05 27.6 50 23.7 50 3.75 46.35 0 Z" />

        <path fill="#FEF4DC" stroke="none" d="M 45.9 36.85 L 42.15 36.85 8.05 36.85 4.05 36.85 0 40.7 0 45.95 5.15 48.65 1.75 45.1 1.75 41.4 4.5 38.7 45.25 38.7 48.45 41.8 45.9 36.85 M 45.55 1.75 L 48.3 5.05 46.35 0 44.9 0 38.6 6.6 25.3 6.6 20.15 0 4.3 0 0.3 3.7 0.3 23.65 5.15 25.85 2 22.8 2 4.5 5.15 1.7 19.4 1.7 24.3 8.2 39.25 8.2 45.55 1.75 Z" />

        <path fill="url(#ViewNode_Gradient_2)" stroke="none" d="M 42.15 36.85 L 42.15 27.6 8.05 27.6 8.05 36.85 42.15 36.85 Z" />

        <path fill="url(#ViewNode_Gradient_3)" stroke="none" d="M 48.3 5.05 L 45.55 1.75 39.25 8.2 24.3 8.2 19.4 1.7 5.15 1.7 2 4.5 2 22.8 5.15 25.85 45.2 25.85 48.3 22.6 48.3 5.05 Z" />
      </g>

      <path id="ViewNode_Layer0_0_1_STROKES" stroke="#1A1401" strokeWidth="1" strokeLinejoin="bevel" strokeLinecap="round" fill="none" d="M 46.35 0 L 44.9 0 38.6 6.6 25.3 6.6 20.15 0 4.3 0 0.3 3.7 0.3 23.65 M 42.15 27.6 L 46.05 27.6 50 23.7 50 3.75 46.35 0 M 42.15 27.6 L 42.15 36.85 45.9 36.85 49.8 40.7 49.8 45.95 46.15 50 4 50 0 45.95 0 40.7 4.05 36.85 8.05 36.85 8.05 27.6 4.15 27.6 0.3 23.65 M 42.15 36.85 L 8.05 36.85 M 8.05 27.6 L 42.15 27.6" />
    </defs>

    <g filter="url(#ViewNode_Filter_1)" transform="matrix( 1, 0, 0, 1, 0,0) ">
      <g transform="matrix( 1, 0, 0, 1, 7,7.4) ">
        <g transform="matrix( 1, 0, 0, 1, 0,0) ">
          <use href="#ViewNode_Layer0_0_FILL" />
          <use href="#ViewNode_Layer0_0_1_STROKES" />
        </g>
      </g>
    </g>
  </svg>
);

interface Data { label: string; subtitle?: string; [k: string]: unknown }

export const ViewNode: React.FC<NodeProps<Node<Data>>> = ({ data, selected, id }) => (
  <StandardNode
    id={id}
    selected={selected}
    label={data?.label || 'View'}
    glyph={<Icon />}
    handles={handles}
    rotation={data?.rotation as 0 | 90 | 180 | 270 | undefined}
  />
);
