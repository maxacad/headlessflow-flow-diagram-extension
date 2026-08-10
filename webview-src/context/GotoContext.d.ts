import React from 'react';
export type GotoFn = (nodeId: string) => void;
/**
 * Must be rendered inside <ReactFlowProvider>.
 * Provides a `gotoNode(nodeId)` function that centers the viewport
 * on the target node with a smooth animation and selects it.
 */
export declare function GotoProvider({ children }: {
    children: React.ReactNode;
}): import("react/jsx-runtime").JSX.Element;
export declare function useGoto(): GotoFn;
