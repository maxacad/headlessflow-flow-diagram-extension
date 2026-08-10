import React from 'react';
export type DagDebugStatus = 'idle' | 'running' | 'completed' | 'failed' | 'paused';
export interface DagBreakpointView {
    id?: string;
    sessionId: string;
    workspaceId?: string;
    service: string;
    runtime: 'dag';
    flowId: string;
    nodeId: string;
    nodeLabel?: string;
    condition?: string;
    enabled: boolean;
    verified?: boolean;
}
export interface DagDebugVariableView {
    name: string;
    value: unknown;
    type?: string;
    variablesReference?: string;
}
interface DagDebugContextValue {
    breakpointsByNode: Record<string, DagBreakpointView>;
    nodeStatuses: Record<string, DagDebugStatus>;
    executionPath: string[];
    variables: DagDebugVariableView[];
    selectedDebugNodeId?: string;
    sessionId?: string;
    workspaceId?: string;
    flowId?: string;
    flowRunId?: string;
    service?: string;
    toggleBreakpoint: (nodeId: string, nodeLabel?: string) => void;
    sendCommand: (command: string) => void;
}
export declare function DagDebugProvider({ children }: {
    children: React.ReactNode;
}): import("react/jsx-runtime").JSX.Element;
export declare function useDagDebug(): DagDebugContextValue;
export declare function useDagNodeDebug(nodeId: string): {
    breakpoint: DagBreakpointView;
    status: DagDebugStatus;
    isOnExecutionPath: boolean;
    isSelectedDebugNode: boolean;
    toggleBreakpoint: (nodeId: string, nodeLabel?: string) => void;
};
export {};
