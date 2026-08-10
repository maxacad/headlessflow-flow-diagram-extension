import React from 'react';
import { NodeProps, Node } from '@xyflow/react';
interface Data {
    label: string;
    subtitle?: string;
    jumpTargetId?: string;
    [k: string]: unknown;
}
export declare const JumpNode: React.FC<NodeProps<Node<Data>>>;
export {};
