import React from 'react';
export interface PipeletFileEntry {
    name: string;
    uri: string;
}
export declare function PipeletFilesProvider({ files, children, }: {
    files: PipeletFileEntry[];
    children: React.ReactNode;
}): import("react/jsx-runtime").JSX.Element;
export declare function usePipeletFiles(): PipeletFileEntry[];
type UpdateDataFn = (nodeId: string, newData: Record<string, unknown>) => void;
export declare function NodeUpdateProvider({ onUpdate, children, }: {
    onUpdate: UpdateDataFn;
    children: React.ReactNode;
}): import("react/jsx-runtime").JSX.Element;
export declare function useNodeDataUpdate(): UpdateDataFn;
export {};
