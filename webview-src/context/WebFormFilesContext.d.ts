import React from 'react';
export interface WebFormFileEntry {
    name: string;
    uri: string;
}
export declare function WebFormFilesProvider({ files, children, }: {
    files: WebFormFileEntry[];
    children: React.ReactNode;
}): import("react/jsx-runtime").JSX.Element;
export declare function useWebFormFiles(): WebFormFileEntry[];
