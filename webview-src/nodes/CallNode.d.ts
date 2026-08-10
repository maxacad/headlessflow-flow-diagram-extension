import React from 'react';
import { NodeProps, Node } from '@xyflow/react';
interface Data {
    label: string;
    subtitle?: string;
    callTarget?: {
        flow: string;
        nodeId: string;
        label: string;
    };
    [k: string]: unknown;
}
export declare const CallNode: React.FC<NodeProps<Node<Data>>>;
export {};
