import { type EdgeProps, type Edge } from '@xyflow/react';
type FlowEdgeData = {
    label?: string;
    showOption3?: boolean;
    option3?: string;
    [key: string]: unknown;
};
export declare function FlowEdge({ id, label, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, ...rest }: EdgeProps<Edge<FlowEdgeData>>): import("react/jsx-runtime").JSX.Element;
export {};
