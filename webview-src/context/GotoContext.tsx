import React, { createContext, useContext, useCallback } from 'react';
import { useReactFlow } from '@xyflow/react';
import { NODE_WIDTH, NODE_HEIGHT } from '../constants';

// ── Types ─────────────────────────────────────────────────────────────────────

export type GotoFn = (nodeId: string) => void;

// ── Context ───────────────────────────────────────────────────────────────────

const GotoCtx = createContext<GotoFn>(() => {});

// ── Provider ──────────────────────────────────────────────────────────────────

/**
 * Must be rendered inside <ReactFlowProvider>.
 * Provides a `gotoNode(nodeId)` function that centers the viewport
 * on the target node with a smooth animation and selects it.
 */
export function GotoProvider({ children }: { children: React.ReactNode }) {
  const { getNode, setCenter, setNodes } = useReactFlow();

  const gotoNode = useCallback<GotoFn>((nodeId: string) => {
    const node = getNode(nodeId);
    if (!node) return;

    const w = (node.measured?.width  ?? NODE_WIDTH);
    const h = (node.measured?.height ?? NODE_HEIGHT);
    const cx = node.position.x + w / 2;
    const cy = node.position.y + h / 2;

    setCenter(cx, cy, { zoom: 1, duration: 500 });

    // Select only the target node to give visual feedback
    setNodes(nds => nds.map(n => ({ ...n, selected: n.id === nodeId })));
  }, [getNode, setCenter, setNodes]);

  return <GotoCtx.Provider value={gotoNode}>{children}</GotoCtx.Provider>;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useGoto(): GotoFn {
  return useContext(GotoCtx);
}
