import React from 'react';
import styled, { keyframes } from 'styled-components';
import { useNodeRunState } from '../context/FlowRuntimeContext';
import { useDagNodeDebug } from '../context/DagDebugContext';

// ── Animations ─────────────────────────────────────────────────────────────────

const fadeIn = keyframes`
  from { opacity: 0; }
  to   { opacity: 1; }
`;

const shimmer = keyframes`
  0%   { background-position: -200% center; }
  100% { background-position: 200% center; }
`;

// ── Styled components ──────────────────────────────────────────────────────────

const BarTrack = styled.div`
  position: absolute;
  top: -8px;
  left: 0;
  right: 0;
  height: 4px;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.15);
  overflow: hidden;
  pointer-events: none;
  z-index: 10;
  animation: ${fadeIn} 0.15s ease;
`;

const BarFill = styled.div<{ $pct: number }>`
  height: 100%;
  width: ${({ $pct }) => $pct}%;
  border-radius: 4px;
  background: linear-gradient(90deg, #1976d2, #42a5f5, #1976d2);
  background-size: 200% auto;
  animation: ${shimmer} 1.2s linear infinite;
  transition: width 0.25s ease;
`;

const Badge = styled.div<{ $color: string }>`
  position: absolute;
  top: -7px;
  right: -7px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: ${({ $color }) => $color};
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  z-index: 10;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
  animation: ${fadeIn} 0.2s ease;
`;

const BreakpointButton = styled.button<{ $active: boolean; $verified: boolean }>`
  position: absolute;
  top: -9px;
  left: -9px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: 2px solid ${({ $active, $verified }) => ($active ? ($verified ? '#ffffff' : '#ffcf66') : 'rgba(90, 104, 120, 0.65)')};
  background: ${({ $active }) => ($active ? '#d32f2f' : 'rgba(255, 255, 255, 0.85)')};
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.22);
  cursor: pointer;
  pointer-events: all;
  z-index: 20;
  padding: 0;
  opacity: ${({ $active }) => ($active ? 1 : 0)};
  transition: opacity 0.12s ease, transform 0.12s ease, background 0.12s ease;

  .node-inner-box:hover &,
  &:focus-visible {
    opacity: 1;
  }

  &:hover {
    transform: scale(1.08);
  }
`;

const DebugRing = styled.div<{ $status: string }>`
  position: absolute;
  inset: -6px;
  border-radius: 16px;
  border: 3px solid ${({ $status }) => {
    switch ($status) {
      case 'paused': return '#ffb300';
      case 'running': return '#1976d2';
      case 'completed': return '#0ba95b';
      case 'failed': return '#e53935';
      default: return 'transparent';
    }
  }};
  pointer-events: none;
  z-index: 8;
  animation: ${fadeIn} 0.15s ease;
`;

// ── Component ──────────────────────────────────────────────────────────────────

interface Props {
  nodeId: string;
}

export function NodeRuntimeOverlay({ nodeId }: Props) {
  const state = useNodeRunState(nodeId);
  const { breakpoint, status, toggleBreakpoint } = useDagNodeDebug(nodeId);
  const effectiveStatus = status !== 'idle' ? status : state.status;

  const onToggleBreakpoint = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    toggleBreakpoint(nodeId);
  };

  return (
    <>
      <BreakpointButton
        type="button"
        title={breakpoint ? 'Remove breakpoint' : 'Set breakpoint'}
        aria-label={breakpoint ? 'Remove breakpoint' : 'Set breakpoint'}
        $active={Boolean(breakpoint)}
        $verified={breakpoint?.verified !== false}
        onClick={onToggleBreakpoint}
        className="nodrag nopan"
      />
      {effectiveStatus !== 'idle' && <DebugRing $status={effectiveStatus} />}
      {effectiveStatus === 'running' && (
        <BarTrack>
          <BarFill $pct={state.progress ?? 0} />
        </BarTrack>
      )}
      {effectiveStatus === 'completed' || state.status === 'done' ? (
        <Badge $color="#0be26e" title="Completed">✓</Badge>
      ) : null}
      {effectiveStatus === 'failed' || state.status === 'error' ? (
        <Badge $color="#f44336" title={state.error ?? 'Error'}>✗</Badge>
      ) : null}
      {effectiveStatus === 'paused' && (
        <Badge $color="#ffb300" title="Paused">Ⅱ</Badge>
      )}
    </>
  );
}
