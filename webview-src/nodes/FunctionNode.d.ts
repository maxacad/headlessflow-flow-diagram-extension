import React from 'react';
import { NodeProps, Node } from '@xyflow/react';
interface Param {
    name: string;
    in: string;
    required?: boolean;
    type?: string;
    description?: string;
}
interface RespDef {
    status: string;
    description: string;
    sample?: unknown;
}
interface Data {
    label: string;
    subtitle?: string;
    params?: Param[];
    requestSample?: unknown;
    responses?: RespDef[];
    [k: string]: unknown;
}
export declare const FunctionNode: React.FC<NodeProps<Node<Data>>>;
export {};
