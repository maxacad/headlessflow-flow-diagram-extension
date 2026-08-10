import React from 'react';
import { NodeProps, Node } from '@xyflow/react';
export declare const APPROVAL_OUTCOMES: readonly [{
    readonly id: "approved";
    readonly label: "Approved";
    readonly color: "#4ade80";
    readonly desc: "Request accepted";
}, {
    readonly id: "rejected";
    readonly label: "Rejected";
    readonly color: "#f87171";
    readonly desc: "Flat rejection";
}, {
    readonly id: "rejected_with_feedback";
    readonly label: "Rejected w/ Feedback";
    readonly color: "#fb923c";
    readonly desc: "Rejected, corrections needed";
}, {
    readonly id: "info_requested";
    readonly label: "Info Requested";
    readonly color: "#60a5fa";
    readonly desc: "Returned for more information";
}, {
    readonly id: "escalated";
    readonly label: "Escalated";
    readonly color: "#fbbf24";
    readonly desc: "Forwarded to higher authority";
}];
interface Data {
    label?: string;
    assigneeType?: 'user' | 'group';
    assigneeName?: string;
    webFormFile?: string;
    [k: string]: unknown;
}
export declare const ApprovalNode: React.FC<NodeProps<Node<Data>>>;
export {};
