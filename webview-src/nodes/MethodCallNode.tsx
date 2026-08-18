import React from 'react';
import { NodeProps, Node, Position } from '@xyflow/react';
import { StandardNode, type NodeTag } from './StandardNode';
import type { HandleDef } from './BaseNode';

const handles: HandleDef[] = [
  { type: 'target', position: Position.Top,    id: 'input'  },
  { type: 'source', position: Position.Bottom, id: 'output' },
  { type: 'source', position: Position.Right,  id: 'error'  },
];

// -- Types --------------------------------------------------------------------

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
  method?: string;
  path?: string;
  baseUrl?: string;
  summary?: string;
  params?: EndpointParam[];
  requestSample?: unknown;
  responses?: ResponseEntry[];
  paramValues?: Record<string, string>;
  bodyValue?: string;
  [k: string]: unknown;
}

// -- Method rengi -------------------------------------------------------------

const METHOD_COLOR: Record<string, string> = {
  get:    '#22c55e',
  post:   '#3b82f6',
  put:    '#f59e0b',
  patch:  '#f97316',
  delete: '#ef4444',
  head:   '#8b5cf6',
  options:'#6b7280',
};

function methodColor(m: string): string {
  return METHOD_COLOR[m.toLowerCase()] ?? '#6b7280';
}

// -- Glyph --------------------------------------------------------------------

/** Sari govde ailede kalir; method rengi yalnizca ust seritte gorunur. */
const Icon = ({ accent }: { accent: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64" preserveAspectRatio="none">
    <defs>
      <linearGradient id="MethodCallNode_Gradient_1" gradientUnits="userSpaceOnUse" x1="3" y1="6" x2="45" y2="42" spreadMethod="pad">
        <stop offset="0%" stopColor="#FFDC87" />
        <stop offset="100%" stopColor="#EEC04E" />
      </linearGradient>
    </defs>
    <g transform="translate(7 7.4)">
      {/* turuncu derinlik */}
      <rect x="6" y="9" width="42" height="34" rx="6" fill="#FFA800" />
      {/* sari govde */}
      <rect x="3" y="6" width="42" height="34" rx="6" fill="url(#MethodCallNode_Gradient_1)" />
      {/* method renkli ust serit */}
      <path d="M3 12 A6 6 0 0 1 9 6 L39 6 A6 6 0 0 1 45 12 L45 14 L3 14 Z" fill={accent} />
      {/* istek / yanit oklari */}
      <path fill="none" stroke="#426DB8" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" d="M12 24 L30 24 M25 19 L30 24 L25 29" />
      <path fill="none" stroke="#47ADC6" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" d="M36 33 L18 33 M23 28 L18 33 L23 38" />
      {/* kontur */}
      <rect x="3" y="6" width="42" height="34" rx="6" fill="none" stroke="#333333" strokeWidth="1" strokeLinejoin="bevel" />
    </g>
  </svg>
);

// -- Component ----------------------------------------------------------------

export const MethodCallNode: React.FC<NodeProps<Node<Data>>> = ({ id, data, selected }) => {
  const method = (data?.method ?? 'get').toLowerCase();
  const path   = data?.path ?? data?.label ?? '/';
  const color  = methodColor(method);

  const tags: NodeTag[] = [{
    text: `${method.toUpperCase()} ${path}`,
    tone: 'method',
    color,
    title: `${data?.baseUrl ?? ''}${path}`,
  }];

  return (
    <StandardNode
      id={id}
      selected={selected}
      label={data?.label}
      glyph={<Icon accent={color} />}
      handles={handles}
      rotation={data?.rotation as 0 | 90 | 180 | 270 | undefined}
      tags={tags}
    />
  );
};
