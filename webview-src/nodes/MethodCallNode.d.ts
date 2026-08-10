import React from 'react';
import { NodeProps, Node } from '@xyflow/react';
interface EndpointParam {
    name: string;
    in: 'path' | 'query' | 'header' | 'body' | 'formData' | 'cookie';
    required?: boolean;
    type?: string;
    description?: string;
}
interface ResponseEntry {
    status: string;
    description: string;
    sample?: unknown;
}
interface NodeData {
    label: string;
    subtitle?: string;
    method?: string;
    path?: string;
    baseUrl?: string;
    summary?: string;
    params?: EndpointParam[];
    requestSample?: unknown;
    responses?: ResponseEntry[];
    /** User-edited parameter values: key → stringified value */
    paramValues?: Record<string, string>;
    /** User-edited body JSON string */
    bodyValue?: string;
    [k: string]: unknown;
}
type MethodCallData = NodeData & Record<string, unknown>;
export declare const MethodCallNode: React.FC<NodeProps<Node<MethodCallData>>>;
export {};
