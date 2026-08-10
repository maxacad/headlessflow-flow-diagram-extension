import { type ReactNode } from 'react';
type DnDType = string | null;
type DnDContextValue = [DnDType, (nodeType: DnDType) => void];
export declare function DnDProvider({ children }: {
    children: ReactNode;
}): import("react/jsx-runtime").JSX.Element;
export declare function useDnD(): DnDContextValue;
export {};
