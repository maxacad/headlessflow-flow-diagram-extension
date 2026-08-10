import React from 'react';
import { NodeProps, Node, Position } from '@xyflow/react';
import styled from 'styled-components';
import { BaseNode, HandleDef } from './BaseNode';

const ACCENT = '#6b7a8d';

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

// ── Endpoint info panel styles ─────────────────────────────────────────────────

const InfoPanel = styled.div`
  position: absolute;
  top: calc(50% + 48px);
  left: 50%;
  transform: translateX(-50%);
  min-width: 210px;
  max-width: 300px;
  background: #141c2e;
  border: 1px solid #2d3f5e;
  border-radius: 8px;
  padding: 8px 10px;
  z-index: 200;
  pointer-events: none;
  font-family: 'Consolas', 'Menlo', monospace;
  font-size: 10px;
  color: #a8b8d0;
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.55);
`;

const Section = styled.div`
  margin-top: 7px;
  &:first-child { margin-top: 0; }
`;

const SectionTitle = styled.div`
  font-size: 8.5px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: #4a6a9a;
  margin-bottom: 4px;
  border-bottom: 1px solid #1e2e48;
  padding-bottom: 2px;
`;

const ParamRow = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 1.5px 0;
  line-height: 1.3;
`;

const InBadge = styled.span<{ $in: string }>`
  font-size: 7.5px;
  padding: 1px 4px;
  border-radius: 3px;
  flex-shrink: 0;
  background: ${({ $in }) =>
    $in === 'path'     ? '#1a3a6e' :
    $in === 'query'    ? '#163a16' :
    $in === 'body'     ? '#4a2200' :
    $in === 'formData' ? '#3a1a4a' :
    '#1e1e3a'};
  color: ${({ $in }) =>
    $in === 'path'     ? '#7eb8ff' :
    $in === 'query'    ? '#7eff7e' :
    $in === 'body'     ? '#ff9a50' :
    $in === 'formData' ? '#d87fff' :
    '#b0b0ff'};
`;

const ParamName = styled.span`
  color: #d0ddf0;
  font-weight: 600;
`;

const ParamType = styled.span`
  color: #4a6a9a;
  font-size: 9px;
`;

const Required = styled.span`
  color: #f06060;
  font-size: 11px;
  line-height: 1;
  flex-shrink: 0;
`;

const JsonBlock = styled.pre`
  margin: 3px 0 0;
  padding: 5px 7px;
  background: #0d1520;
  border-radius: 5px;
  font-size: 9px;
  color: #6dbf8a;
  overflow: hidden;
  max-height: 90px;
  white-space: pre-wrap;
  word-break: break-all;
  line-height: 1.4;
`;

const ResponseRow = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 5px;
  margin-bottom: 2px;
`;

const StatusBadge = styled.span<{ $ok: boolean }>`
  font-size: 8px;
  padding: 1px 5px;
  border-radius: 3px;
  flex-shrink: 0;
  background: ${({ $ok }) => $ok ? '#163a16' : '#3a1616'};
  color:      ${({ $ok }) => $ok ? '#7eff7e' : '#ff7e7e'};
`;

const RespDesc = styled.span`
  color: #4a6a9a;
  font-size: 9px;
  line-height: 1.4;
`;

// ── Helpers ────────────────────────────────────────────────────────────────────

function truncateJson(val: unknown, maxLen = 240): string {
  const s = JSON.stringify(val, null, 2);
  return s.length <= maxLen ? s : s.slice(0, maxLen) + '\n…';
}

// ── Endpoint info sub-component ────────────────────────────────────────────────

interface Param  { name: string; in: string; required?: boolean; type?: string; description?: string }
interface RespDef { status: string; description: string; sample?: unknown }
interface Data   { label: string; subtitle?: string; params?: Param[]; requestSample?: unknown; responses?: RespDef[]; [k: string]: unknown }

function EndpointInfoPanel({ data }: { data: Data }) {
  const nonBodyParams = (data.params ?? []).filter(p => p.in !== 'body');
  const hasReqSample  = data.requestSample !== undefined && data.requestSample !== null;
  const okResp        = data.responses?.find(r => r.status.startsWith('2'));
  const errorResps    = (data.responses ?? []).filter(r => !r.status.startsWith('2')).slice(0, 3);

  return (
    <InfoPanel>
      {nonBodyParams.length > 0 && (
        <Section>
          <SectionTitle>Parameters</SectionTitle>
          {nonBodyParams.map(p => (
            <ParamRow key={`${p.in}-${p.name}`}>
              {p.required ? <Required title="required">*</Required> : <span style={{ width: 8, display: 'inline-block' }} />}
              <InBadge $in={p.in}>{p.in}</InBadge>
              <ParamName>{p.name}</ParamName>
              {p.type && <ParamType>{p.type}</ParamType>}
            </ParamRow>
          ))}
        </Section>
      )}

      {hasReqSample && (
        <Section>
          <SectionTitle>Request body</SectionTitle>
          <JsonBlock>{truncateJson(data.requestSample)}</JsonBlock>
        </Section>
      )}

      {(okResp || errorResps.length > 0) && (
        <Section>
          <SectionTitle>Responses</SectionTitle>
          {okResp && (
            <ResponseRow>
              <StatusBadge $ok={true}>{okResp.status}</StatusBadge>
              {okResp.sample != null
                ? <JsonBlock style={{ flex: 1 }}>{truncateJson(okResp.sample)}</JsonBlock>
                : <RespDesc>{okResp.description}</RespDesc>
              }
            </ResponseRow>
          )}
          {errorResps.map(r => (
            <ResponseRow key={r.status}>
              <StatusBadge $ok={false}>{r.status}</StatusBadge>
              <RespDesc>{r.description}</RespDesc>
            </ResponseRow>
          ))}
        </Section>
      )}
    </InfoPanel>
  );
}

// ── FunctionNode ───────────────────────────────────────────────────────────────

const CellLabel = styled.div`
  position: absolute;
  top: 4px;
  left: 5px;
  font-family: 'Consolas', 'Courier New', monospace;
  font-size: 9px;
  font-weight: 400;
  color: #243447;
  opacity: 0.5;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 130px;
  pointer-events: none;
  user-select: none;
  letter-spacing: 0.2px;
`;

export const FunctionNode: React.FC<NodeProps<Node<Data>>> = ({ data, selected, id }) => {
  const hasEndpointInfo = !!(data.params?.length || data.requestSample != null || data.responses?.length);

  return (
    <BaseNode
      nodeId={id}
      selected={selected}
      icon={<Icon />}
      label={data?.label || 'Function'}
      subtitle={data?.subtitle}
      handles={handles}
      accentColor={ACCENT}
      transparentInner
      rotation={data?.rotation as 0 | 90 | 180 | 270 | undefined}
    >
      <CellLabel>{data?.label ? `${data.label} · ${id}` : id}</CellLabel>
      {selected && hasEndpointInfo && <EndpointInfoPanel data={data} />}
    </BaseNode>
  );
};

