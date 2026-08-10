/**
 * MazeEdge — Direct polyline edge with interactive bend points.
 *
 * Behaviour:
 *   • Default: straight line from source to target (no routing).
 *   • Drag a segment  → inserts a new waypoint at the drag position, snapped to the
 *     nearest grid snap point (cell corner / edge midpoint / cell center).
 *   • Drag a waypoint → moves that waypoint (also snapped).
 *   • Double-click a waypoint → removes it.
 *
 * Snap points per cell (9 per cell):
 *   TL corner, TR corner, BL corner, BR corner,
 *   top mid, right mid, bottom mid, left mid, center.
 */
import { type EdgeProps, type Edge } from '@xyflow/react';
type Pt = {
    x: number;
    y: number;
};
type MazeEdgeData = {
    label?: string;
    highlighted?: boolean;
    waypoints?: Pt[];
    [key: string]: unknown;
};
export declare function MazeEdge({ id, sourceX, sourceY, targetX, targetY, data, }: EdgeProps<Edge<MazeEdgeData>>): import("react/jsx-runtime").JSX.Element;
export {};
