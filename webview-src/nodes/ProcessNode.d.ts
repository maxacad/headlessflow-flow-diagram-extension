import React from 'react';
import { NodeProps, Node } from '@xyflow/react';
interface Data {
    label: string;
    subtitle?: string;
    pipeletFile?: string;
    [k: string]: unknown;
}
export declare const ProcessNode: React.FC<NodeProps<Node<Data>>>;
export {};
