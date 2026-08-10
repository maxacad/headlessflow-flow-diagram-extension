import React from 'react';
import { NodeProps, Node } from '@xyflow/react';
interface Data {
    label: string;
    subtitle?: string;
    [k: string]: unknown;
}
export declare const StopNode: React.FC<NodeProps<Node<Data>>>;
export {};
