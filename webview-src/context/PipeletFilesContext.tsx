import React, { createContext, useContext } from 'react';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface PipeletFileEntry {
  name: string; // filename without .pipelet extension
  uri: string;
  content?: string;
  handler?: string;
  handlerUri?: string;
  inputs?: Record<string, string>;
  outputs?: Record<string, string>;
  ai?: Record<string, unknown>;
}

// ── Pipelet Files Context ──────────────────────────────────────────────────────

const PipeletFilesCtx = createContext<PipeletFileEntry[]>([]);

export function PipeletFilesProvider({
  files,
  children,
}: {
  files: PipeletFileEntry[];
  children: React.ReactNode;
}) {
  return <PipeletFilesCtx.Provider value={files}>{children}</PipeletFilesCtx.Provider>;
}

export function usePipeletFiles(): PipeletFileEntry[] {
  return useContext(PipeletFilesCtx);
}

// ── Node Data Update Context ───────────────────────────────────────────────────

type UpdateDataFn = (nodeId: string, newData: Record<string, unknown>) => void;

const NodeUpdateCtx = createContext<UpdateDataFn>(() => {});

export function NodeUpdateProvider({
  onUpdate,
  children,
}: {
  onUpdate: UpdateDataFn;
  children: React.ReactNode;
}) {
  return <NodeUpdateCtx.Provider value={onUpdate}>{children}</NodeUpdateCtx.Provider>;
}

export function useNodeDataUpdate(): UpdateDataFn {
  return useContext(NodeUpdateCtx);
}
