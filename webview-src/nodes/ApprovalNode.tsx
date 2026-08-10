import React from 'react';
import type { SVGProps } from 'react';
import { Handle, NodeProps, Node, Position } from '@xyflow/react';
import styled, { css } from 'styled-components';
import { NodeWrapper } from './BaseNode';
import { NodeRuntimeOverlay } from './NodeRuntimeOverlay';

// ── Theme ──────────────────────────────────────────────────────────────────────
const ACCENT = '#7c3aed';

// ── Approval outcomes ──────────────────────────────────────────────────────────
export const APPROVAL_OUTCOMES = [
  { id: 'approved',               label: 'Approved',             color: '#4ade80', desc: 'Request accepted'                  },
  { id: 'rejected',               label: 'Rejected',             color: '#f87171', desc: 'Flat rejection'                    },
  { id: 'rejected_with_feedback', label: 'Rejected w/ Feedback', color: '#fb923c', desc: 'Rejected, corrections needed'      },
  { id: 'info_requested',         label: 'Info Requested',       color: '#60a5fa', desc: 'Returned for more information'     },
  { id: 'escalated',              label: 'Escalated',            color: '#fbbf24', desc: 'Forwarded to higher authority'     },
] as const;

// ── SVG Icons ──────────────────────────────────────────────────────────────────
// Shared background + badge — only the silhouette differs
const BG = () => (
  <>
    <rect x="2" y="2" width="60" height="60" rx="9" fill="#1e0a3c" />
    <rect x="3.5" y="3.5" width="57" height="57" rx="7" fill="#7c3aed" />
    <path d="M11 5H53C57.42 5 61 8.58 61 13V55" stroke="#a78bfa" strokeWidth="2" strokeLinecap="round" strokeOpacity="0.4" />
    <path d="M5 53V11C5 6.58 8.58 3 13 3" stroke="#3b0764" strokeWidth="2" strokeLinecap="round" strokeOpacity="0.5" transform="rotate(180 32 32)" />
  </>
);
const Badge = () => (
  <>
    <circle cx="46" cy="46" r="11" fill="#15803d" />
    <circle cx="46" cy="46" r="10" fill="#16a34a" />
    <path d="M41 46L44.5 49.5L51 43" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
  </>
);

// Single user icon
const UserIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg width={64} height={64} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
    <BG />
    {/* Person head */}
    <circle cx="32" cy="23" r="9" fill="white" fillOpacity="0.92" />
    {/* Person body */}
    <path d="M16 48C16 39.16 23.16 32 32 32C40.84 32 48 39.16 48 48H16Z" fill="white" fillOpacity="0.88" />
    <Badge />
  </svg>
);

// Group icon (two people)
const GroupIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg width={64} height={64} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
    <BG />
    {/* Back person (left, slightly smaller, lower opacity) */}
    <circle cx="24" cy="24" r="8" fill="white" fillOpacity="0.55" />
    <path d="M10 48C10 40.27 16.27 34 24 34C26.5 34 28.85 34.7 30.85 35.92C28.38 38.26 26.72 41.44 26.2 45H10V48Z" fill="white" fillOpacity="0.5" />
    {/* Front person (right, full opacity) */}
    <circle cx="38" cy="22" r="9" fill="white" fillOpacity="0.92" />
    <path d="M22 48C22 39.16 29.16 32 38 32C46.84 32 54 39.16 54 48H22Z" fill="white" fillOpacity="0.88" />
    <Badge />
  </svg>
);

// ── Styled components ──────────────────────────────────────────────────────────
const IconBox = styled.div<{ $selected: boolean }>`
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 64px;
  height: 64px;
  border-radius: 12px;
  ${({ $selected }) =>
    $selected &&
    css`
      outline: 4px solid ${ACCENT};
      outline-offset: 3px;
    `}
`;

const CellLabel = styled.div`
  position: absolute;
  top: 4px;
  left: 5px;
  font-family: 'Consolas', 'Courier New', monospace;
  font-size: 9px;
  color: #243447;
  opacity: 0.5;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 130px;
  pointer-events: none;
  user-select: none;
`;

const FloatingTag = styled.div<{ $top: string; $color: string; $borderColor: string }>`
  position: absolute;
  top: ${({ $top }) => $top};
  left: calc(50% + 36px);
  font-family: 'Consolas', 'Courier New', monospace;
  font-size: 9px;
  font-weight: 500;
  color: ${({ $color }) => $color};
  white-space: nowrap;
  pointer-events: none;
  background: rgba(10, 5, 25, 0.80);
  padding: 2px 6px;
  border-radius: 3px;
  border: 1px solid ${({ $borderColor }) => $borderColor};
  max-width: 90px;
  overflow: hidden;
  text-overflow: ellipsis;
`;

// ── Config panel ───────────────────────────────────────────────────────────────
// (Config is now in the Node Detail side panel — click the node to open it)

// ── Custom coloured handles ────────────────────────────────────────────────────
// Positioned relative to NodeWrapper (150×200).
// Inner box is 64×64 centred → center at (75, 100).
// Each handle is placed 10 px outside the inner box edge.

const HInput = styled(Handle)`
  && {
    position: absolute !important;
    width: 10px !important; height: 10px !important;
    border-radius: 50% !important; border-width: 2px !important; border-style: solid !important;
    background: #475569 !important; border-color: #94a3b8 !important;
    top: calc(50% - 32px - 10px) !important;
    left: 50% !important; transform: translateX(-50%) !important;
  }
`;
const HApproved = styled(Handle)`
  && {
    position: absolute !important;
    width: 10px !important; height: 10px !important;
    border-radius: 50% !important; border-width: 2px !important; border-style: solid !important;
    background: #16a34a !important; border-color: #4ade80 !important;
    bottom: calc(50% - 32px - 10px) !important;
    left: 50% !important; transform: translateX(-50%) !important;
  }
`;
const HRejected = styled(Handle)`
  && {
    position: absolute !important;
    width: 10px !important; height: 10px !important;
    border-radius: 50% !important; border-width: 2px !important; border-style: solid !important;
    background: #dc2626 !important; border-color: #f87171 !important;
    right: calc(50% - 32px - 10px) !important;
    top: calc(50% - 16px) !important; transform: translateY(-50%) !important;
  }
`;
const HFeedback = styled(Handle)`
  && {
    position: absolute !important;
    width: 10px !important; height: 10px !important;
    border-radius: 50% !important; border-width: 2px !important; border-style: solid !important;
    background: #c2410c !important; border-color: #fb923c !important;
    right: calc(50% - 32px - 10px) !important;
    top: calc(50% + 16px) !important; transform: translateY(-50%) !important;
  }
`;
const HInfoReq = styled(Handle)`
  && {
    position: absolute !important;
    width: 10px !important; height: 10px !important;
    border-radius: 50% !important; border-width: 2px !important; border-style: solid !important;
    background: #1d4ed8 !important; border-color: #60a5fa !important;
    left: calc(50% - 32px - 10px) !important;
    top: calc(50% - 16px) !important; transform: translateY(-50%) !important;
  }
`;
const HEscalated = styled(Handle)`
  && {
    position: absolute !important;
    width: 10px !important; height: 10px !important;
    border-radius: 50% !important; border-width: 2px !important; border-style: solid !important;
    background: #b45309 !important; border-color: #fbbf24 !important;
    left: calc(50% - 32px - 10px) !important;
    top: calc(50% + 16px) !important; transform: translateY(-50%) !important;
  }
`;

// ── Data shape ─────────────────────────────────────────────────────────────────
interface Data {
  label?: string;
  assigneeType?: 'user' | 'group';
  assigneeName?: string;
  webFormFile?: string;
  [k: string]: unknown;
}

// ── Component ──────────────────────────────────────────────────────────────────
export const ApprovalNode: React.FC<NodeProps<Node<Data>>> = ({ selected, id, data }) => {
  const assigneeType = data?.assigneeType ?? 'user';
  const assigneeName = data?.assigneeName ?? '';
  const webFormFile  = data?.webFormFile  ?? '';

  return (
    <NodeWrapper>

      {/* ── Handles ── */}
      <HInput     type="target" position={Position.Top}    id="input"                  className="node-handle" />
      <HApproved  type="source" position={Position.Bottom} id="approved"               className="node-handle" />
      <HRejected  type="source" position={Position.Right}  id="rejected"               className="node-handle" />
      <HFeedback  type="source" position={Position.Right}  id="rejected_with_feedback" className="node-handle" />
      <HInfoReq   type="source" position={Position.Left}   id="info_requested"         className="node-handle" />
      <HEscalated type="source" position={Position.Left}   id="escalated"              className="node-handle" />

      <CellLabel>{data?.label ? `${data.label} · ${id}` : id}</CellLabel>

      <IconBox className="node-inner-box" $selected={selected}>
        {assigneeType === 'group' ? <GroupIcon /> : <UserIcon />}
        <NodeRuntimeOverlay nodeId={id} />
      </IconBox>

      {/* Floating tags beside the node */}
      {assigneeName && (
        <FloatingTag $top="calc(50% - 32px)" $color="#c4b5fd" $borderColor="rgba(124,58,237,0.35)">
          {assigneeType === 'user' ? 'U:' : 'G:'} {assigneeName}
        </FloatingTag>
      )}
      {webFormFile && (
        <FloatingTag $top="calc(50% - 12px)" $color="#93c5fd" $borderColor="rgba(59,130,246,0.3)">
          {webFormFile}
        </FloatingTag>
      )}
    </NodeWrapper>
  );
};
