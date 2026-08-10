import React from 'react';
export type NodeStatus = 'idle' | 'running' | 'done' | 'error';
export interface NodeRunState {
    status: NodeStatus;
    progress?: number;
    output?: unknown;
    error?: string;
}
interface FlowRuntimeCtx {
    nodeStates: Record<string, NodeRunState>;
    connected: boolean;
}
export declare function FlowRuntimeProvider({ children }: {
    children: React.ReactNode;
}): import("react/jsx-runtime").JSX.Element;
export declare function useNodeRunState(nodeId: string): NodeRunState;
export declare function useFlowRuntime(): FlowRuntimeCtx;
export {};
