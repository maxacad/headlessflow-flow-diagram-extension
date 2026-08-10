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

import React, { useCallback } from 'react';
import { useReactFlow, type EdgeProps, type Edge } from '@xyflow/react';
import { GRID_WIDTH, GRID_HEIGHT } from '../constants';

// ── Visual constants ──────────────────────────────────────────────────────────
const STROKE_COLOR             = '#799cf0';
const STROKE_COLOR_HIGHLIGHTED = '#ff9800';
const STROKE_WIDTH             = 1.5;
const CORNER_RADIUS            = 20;
const HIT_WIDTH                = 14;   // px — invisible hit area width per segment
const WP_RADIUS                = 5;    // px — visible waypoint handle radius

// ── Types ─────────────────────────────────────────────────────────────────────
type Pt = { x: number; y: number };

type MazeEdgeData = {
  label?: string;
  highlighted?: boolean;
  waypoints?: Pt[];
  [key: string]: unknown;
};

// ── Snap helper ───────────────────────────────────────────────────────────────
/**
 * Snaps a flow-space coordinate to the nearest of the 9 canonical snap points
 * inside its grid cell (4 corners, 4 edge midpoints, 1 center).
 */
function snapToGrid(x: number, y: number): Pt {
  const col = Math.floor(x / GRID_WIDTH);
  const row = Math.floor(y / GRID_HEIGHT);
  const cx  = col * GRID_WIDTH;
  const cy  = row * GRID_HEIGHT;
  const gw  = GRID_WIDTH;
  const gh  = GRID_HEIGHT;

  const candidates: Pt[] = [
    { x: cx,          y: cy },            // TL corner
    { x: cx + gw,     y: cy },            // TR corner
    { x: cx,          y: cy + gh },       // BL corner
    { x: cx + gw,     y: cy + gh },       // BR corner
    { x: cx + gw / 2, y: cy },            // top mid
    { x: cx + gw,     y: cy + gh / 2 },  // right mid
    { x: cx + gw / 2, y: cy + gh },      // bottom mid
    { x: cx,          y: cy + gh / 2 },  // left mid
    { x: cx + gw / 2, y: cy + gh / 2 },  // center
  ];

  return candidates.reduce((best, c) =>
    Math.hypot(c.x - x, c.y - y) < Math.hypot(best.x - x, best.y - y) ? c : best
  );
}

// ── SVG path builder ──────────────────────────────────────────────────────────
/**
 * Builds a polyline SVG path string with rounded corners (quadratic Bézier).
 */
function buildPath(pts: Pt[], r = CORNER_RADIUS): string {
  if (pts.length === 0) return '';
  if (pts.length === 1) return `M${pts[0].x} ${pts[0].y}`;

  const f = (n: number) => n.toFixed(2);
  let d = `M${f(pts[0].x)} ${f(pts[0].y)}`;

  for (let i = 1; i < pts.length; i++) {
    const prev = pts[i - 1];
    const curr = pts[i];
    const next = i < pts.length - 1 ? pts[i + 1] : null;

    if (!next) {
      d += ` L${f(curr.x)} ${f(curr.y)}`;
      break;
    }

    const d1 = Math.hypot(curr.x - prev.x, curr.y - prev.y) || 1;
    const d2 = Math.hypot(next.x - curr.x, next.y - curr.y) || 1;
    const radius = Math.min(r, d1 / 2, d2 / 2);

    if (radius <= 1) {
      d += ` L${f(curr.x)} ${f(curr.y)}`;
      continue;
    }

    const ux1 = (curr.x - prev.x) / d1;
    const uy1 = (curr.y - prev.y) / d1;
    const ux2 = (next.x - curr.x) / d2;
    const uy2 = (next.y - curr.y) / d2;

    d += ` L${f(curr.x - ux1 * radius)} ${f(curr.y - uy1 * radius)}`;
    d += ` Q${f(curr.x)} ${f(curr.y)} ${f(curr.x + ux2 * radius)} ${f(curr.y + uy2 * radius)}`;
  }

  return d;
}

// ── Component ─────────────────────────────────────────────────────────────────
export function MazeEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  data,
}: EdgeProps<Edge<MazeEdgeData>>) {
  const { setEdges, screenToFlowPosition } = useReactFlow();

  const highlighted = (data as MazeEdgeData)?.highlighted ?? false;
  const strokeColor = highlighted ? STROKE_COLOR_HIGHLIGHTED : STROKE_COLOR;
  const strokeWidth = highlighted ? STROKE_WIDTH + 1.5 : STROKE_WIDTH;
  const glowOpacity = highlighted ? 0.4 : 0.18;
  const markerId    = `maze-edge-arrow-${id}`;

  const waypoints: Pt[] = (data?.waypoints as Pt[]) ?? [];
  const allPts: Pt[]    = [{ x: sourceX, y: sourceY }, ...waypoints, { x: targetX, y: targetY }];
  const edgePath         = buildPath(allPts);

  // ── State helpers ────────────────────────────────────────────────────────────
  const patchWaypoints = useCallback(
    (updater: (wps: Pt[]) => Pt[]) => {
      setEdges(edges =>
        edges.map(e =>
          e.id !== id
            ? e
            : { ...e, data: { ...e.data, waypoints: updater((e.data?.waypoints as Pt[]) ?? []) } }
        )
      );
    },
    [id, setEdges]
  );

  /** Attach window-level mousemove/mouseup listeners that drag waypoint[wpIdx]. */
  const attachDragListeners = useCallback(
    (wpIdx: number) => {
      const onMouseMove = (me: MouseEvent) => {
        const fp = screenToFlowPosition({ x: me.clientX, y: me.clientY });
        const sp = snapToGrid(fp.x, fp.y);
        setEdges(edges =>
          edges.map(e => {
            if (e.id !== id) return e;
            const wps = [...((e.data?.waypoints as Pt[]) ?? [])];
            wps[wpIdx] = sp;
            return { ...e, data: { ...e.data, waypoints: wps } };
          })
        );
      };
      const onMouseUp = () => {
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
      };
      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    },
    [id, setEdges, screenToFlowPosition]
  );

  // ── Segment interaction ───────────────────────────────────────────────────────
  /**
   * MouseDown on a segment:
   *   1. Snaps the click position and inserts a new waypoint at segIdx.
   *   2. Immediately starts dragging that new waypoint.
   *
   * segIdx is the index of the first allPts point of the clicked segment,
   * which equals the insertion index in the waypoints array.
   */
  const handleSegmentMouseDown = useCallback(
    (e: React.MouseEvent, segIdx: number) => {
      e.stopPropagation();
      e.preventDefault();

      const fp = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      const sp = snapToGrid(fp.x, fp.y);

      patchWaypoints(wps => {
        const next = [...wps];
        next.splice(segIdx, 0, sp);
        return next;
      });

      attachDragListeners(segIdx);
    },
    [screenToFlowPosition, patchWaypoints, attachDragListeners]
  );

  // ── Waypoint drag ─────────────────────────────────────────────────────────────
  const handleWaypointMouseDown = useCallback(
    (e: React.MouseEvent, wpIdx: number) => {
      e.stopPropagation();
      e.preventDefault();
      attachDragListeners(wpIdx);
    },
    [attachDragListeners]
  );

  // ── Waypoint delete (double-click) ────────────────────────────────────────────
  const handleWaypointDoubleClick = useCallback(
    (e: React.MouseEvent, wpIdx: number) => {
      e.stopPropagation();
      patchWaypoints(wps => wps.filter((_, i) => i !== wpIdx));
    },
    [patchWaypoints]
  );

  return (
    <>
      <defs>
        <marker
          id={markerId}
          markerUnits="userSpaceOnUse"
          viewBox="-8 -4 8 8"
          markerWidth="8"
          markerHeight="8"
          refX="0"
          refY="0"
          orient="auto"
        >
          <path d="M-6,-4 L-6,4 L0,0 z" fill={strokeColor} />
        </marker>
      </defs>

      {/* Soft glow layer */}
      <path
        d={edgePath}
        fill="none"
        stroke={strokeColor}
        strokeWidth={strokeWidth + 4}
        strokeOpacity={glowOpacity}
        strokeLinecap="round"
      />

      {/* Main edge path */}
      <path
        id={id}
        d={edgePath}
        fill="none"
        className="react-flow__edge-path"
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        markerEnd={`url(#${markerId})`}
      />

      {/* ── Invisible wide hit areas — one per segment ───────────────────────── */}
      {allPts.slice(0, -1).map((pt, segIdx) => {
        const nxt = allPts[segIdx + 1];
        return (
          <line
            key={`seg-${segIdx}`}
            x1={pt.x}
            y1={pt.y}
            x2={nxt.x}
            y2={nxt.y}
            stroke="transparent"
            strokeWidth={HIT_WIDTH}
            style={{ cursor: 'crosshair' }}
            onMouseDown={e => handleSegmentMouseDown(e, segIdx)}
          />
        );
      })}

      {/* ── Waypoint handles (drag=move, dblclick=delete) ─────────────────────── */}
      {waypoints.map((wp, wpIdx) => (
        <circle
          key={`wp-${wpIdx}`}
          cx={wp.x}
          cy={wp.y}
          r={WP_RADIUS}
          fill={strokeColor}
          stroke="#fff"
          strokeWidth={1.5}
          style={{ cursor: 'move', pointerEvents: 'all' }}
          onMouseDown={e => handleWaypointMouseDown(e, wpIdx)}
          onDoubleClick={e => handleWaypointDoubleClick(e, wpIdx)}
        />
      ))}
    </>
  );
}

