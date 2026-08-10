import React, { createContext, useContext } from 'react';

export interface WebFormFileEntry {
  name: string;
  uri: string;
}

const WebFormFilesCtx = createContext<WebFormFileEntry[]>([]);

export function WebFormFilesProvider({
  files,
  children,
}: {
  files: WebFormFileEntry[];
  children: React.ReactNode;
}) {
  return <WebFormFilesCtx.Provider value={files}>{children}</WebFormFilesCtx.Provider>;
}

export function useWebFormFiles(): WebFormFileEntry[] {
  return useContext(WebFormFilesCtx);
}
