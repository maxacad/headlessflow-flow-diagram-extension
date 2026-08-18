import React from 'react';
import { NodeProps, Node, Position } from '@xyflow/react';
import { StandardNode, type NodeTag } from './StandardNode';
import type { HandleDef } from './BaseNode';

const handles: HandleDef[] = [
  { type: 'target', position: Position.Top,    id: 'input'  },
  { type: 'source', position: Position.Bottom, id: 'output' },
  { type: 'source', position: Position.Right,  id: 'error'  },
];

const CallSvg = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    preserveAspectRatio="none"
    width="64px"
    height="64px"
    viewBox="0 0 64 64"
  >
    <defs>
      <linearGradient id="CallNodeSvg_Gradient_1" gradientUnits="userSpaceOnUse" x1="0.125" y1="38.05" x2="49.975" y2="38.05" spreadMethod="pad">
        <stop offset="0%" stopColor="#FFDC87" />
        <stop offset="100%" stopColor="#EEC04E" />
        <stop offset="100%" stopColor="#EEC04E" />
      </linearGradient>

      <linearGradient id="CallNodeSvg_Gradient_2" gradientUnits="userSpaceOnUse" x1="0" y1="11.85" x2="50" y2="11.85" spreadMethod="pad">
        <stop offset="0%" stopColor="#FFDC87" />
        <stop offset="100%" stopColor="#EEC04E" />
      </linearGradient>

      <linearGradient id="CallNodeSvg_Gradient_3" gradientUnits="userSpaceOnUse" x1="32.324999999999996" y1="44.5" x2="49.975" y2="44.5" spreadMethod="pad">
        <stop offset="0%" stopColor="#6695FF" />
        <stop offset="100%" stopColor="#47ADC6" />
      </linearGradient>

      <filter id="CallNodeSvg_Filter_1" x="-20%" y="-20%" width="140%" height="140%" colorInterpolationFilters="sRGB">
        <feColorMatrix in="SourceGraphic" type="matrix" values="1.2194942 -0.18464820000000004 -0.024846000000000003 0 -0.018333333333333354 -0.09350580000000001 1.1283518000000001 -0.024846000000000003 0 -0.018333333333333354 -0.09350580000000001 -0.18464820000000004 1.288154 0 -0.018333333333333354 0 0 0 1 0 " result="result1" />
      </filter>

      <g id="CallNodeSvg_Layer2_0_FILL">
        <path fill="url(#CallNodeSvg_Gradient_1)" stroke="none" d="M 50 35.8 L 50 26.7 0 26.7 0 36.6 13 50 28.65 50 28.65 35.8 50 35.8 Z" />
        <path fill="url(#CallNodeSvg_Gradient_2)" stroke="none" d="M 50 23.8 L 50 12.55 37.15 0 21.5 0 35.5 14.15 0 14.15 0 23.8 50 23.8 Z" />
      </g>

      <g id="CallNodeSvg_Layer1_0_FILL">
        <path fill="#FFF7D9" stroke="none" d="M 35.5 14.6 L 0.5 14.6 0.5 23.4 1.3 21.1 1.25 15.65 34.85 15.65 35.5 14.6 M 49.5 28.65 L 49.45 27.2 0.55 27.15 0.55 28.65 49.5 28.65 Z" />
      </g>

      <g id="CallNodeSvg_Layer0_0_FILL">
        <path fill="url(#CallNodeSvg_Gradient_3)" stroke="none" d="M 32.35 39.1 L 32.35 49.95 50 49.95 50 39.1 32.35 39.1 Z" />
        <path fill="#FFA800" stroke="none" d="M 28.15 35.8 L 26.85 37.05 26.85 49.5 28.15 49.5 28.15 35.8 M 48.25 11.6 L 48.2 23.3 49.5 23.3 49.5 12.8 48.25 11.6 Z" />
      </g>

      <path id="CallNodeSvg_Layer2_0_1_STROKES" stroke="#333333" strokeWidth="1" strokeLinejoin="bevel" strokeLinecap="round" fill="none" d="M 50 23.8 L 50 12.55 37.15 0 21.5 0 35.5 14.15 0 14.15 0 23.8 50 23.8 Z M 50 35.8 L 50 26.7 0 26.7 0 36.6 13 50 28.65 50 28.65 35.8 50 35.8 Z" />
      <path id="CallNodeSvg_Layer0_0_1_STROKES" stroke="#333333" strokeWidth="1" strokeLinejoin="bevel" strokeLinecap="round" fill="none" d="M 32.35 39.1 L 50 39.1 50 49.95 32.35 49.95 32.35 39.1 Z" />
    </defs>

    <g filter="url(#CallNodeSvg_Filter_1)" transform="matrix( 1, 0, 0, 1, 0,0) ">
      <g transform="matrix( 1, 0, 0, 1, 7,7.4) ">
        <g transform="matrix( 1, 0, 0, 1, 0,0) ">
          <use href="#CallNodeSvg_Layer2_0_FILL" />
          <use href="#CallNodeSvg_Layer2_0_1_STROKES" />
        </g>
        <g transform="matrix( 1, 0, 0, 1, 0,0) ">
          <use href="#CallNodeSvg_Layer1_0_FILL" />
        </g>
        <g transform="matrix( 1, 0, 0, 1, 0,0) ">
          <use href="#CallNodeSvg_Layer0_0_FILL" />
          <use href="#CallNodeSvg_Layer0_0_1_STROKES" />
        </g>
      </g>
    </g>
  </svg>
);

interface Data {
  label: string;
  subtitle?: string;
  callTarget?: { flow: string; nodeId: string; label: string };
  [k: string]: unknown;
}

export const CallNode: React.FC<NodeProps<Node<Data>>> = ({ id, data, selected }) => {
  const target = data?.callTarget;

  const tags: NodeTag[] = [];
  // Hedef temizlendiginde panel bos string'ler yaziyor — icerige bakarak guard'la.
  if (target?.flow && target?.nodeId) {
    const text = `${target.flow} › ${target.label}`;
    tags.push({ text, tone: 'target', title: `${text} (${target.nodeId})` });
  }

  return (
    <StandardNode
      id={id}
      selected={selected}
      label={data?.label || 'Call'}
      glyph={<CallSvg />}
      handles={handles}
      rotation={data?.rotation as 0 | 90 | 180 | 270 | undefined}
      tags={tags}
    />
  );
};
