import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

type DnDType = string | null;
type DnDContextValue = [DnDType, (nodeType: DnDType) => void];

const DnDContext = createContext<DnDContextValue>([null, () => {}]);

export function DnDProvider({ children }: { children: ReactNode }) {
  const [type, setType] = useState<DnDType>(null);
  const value = useMemo<DnDContextValue>(() => [type, setType], [type]);

  return <DnDContext.Provider value={value}>{children}</DnDContext.Provider>;
}

export function useDnD() {
  return useContext(DnDContext);
}
