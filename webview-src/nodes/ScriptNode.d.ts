import React from 'react';
import { NodeProps, Node } from '@xyflow/react';
interface Data {
    label: string;
    subtitle?: string;
    [k: string]: unknown;
}
export declare const ScriptNode: React.FC<NodeProps<Node<Data>>>;
export {};
