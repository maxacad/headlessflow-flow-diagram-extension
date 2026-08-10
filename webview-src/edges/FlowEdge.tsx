import React, { useEffect } from 'react';
import { EdgeLabelRenderer, useEdges, type EdgeProps, type Edge } from '@xyflow/react';
import styled from 'styled-components';
import { getSmoothStepPath2 } from './Connection';
import { GRID_WIDTH, GRID_HEIGHT } from '../constants';

type FlowEdgeData = {
  label?: string;
  showOption3?: boolean;
  option3?: string;
  [key: string]: unknown;
};

const STROKE_COLOR = '#4f72c7';
const STROKE_COLOR_HIGHLIGHTED = '#ff9800';
const STROKE_WIDTH = 2;
const STROKE_WIDTH_HIGHLIGHTED = 4;
const JOIN_MARKER_OFFSET = 22;
/** Arrow body length in userSpaceOnUse: path M-6,-4 L-6,4 L0,0 → 6 px */
const ARROW_MARKER_SIZE = 6;

const Label = styled.div`
  position: absolute;
  background: #ffffff;
  border: 1px solid #dbe6f5;
  border-radius: 6px;
  padding: 3px 8px;
  font-size: 11px;
  font-weight: 600;
  color: #243447;
  pointer-events: all;
  text-align: center;
  box-shadow: 0 1px 6px rgba(0, 0, 0, 0.08);
  white-space: nowrap;
`;

function removeTargetSideBend(path: string): string {
  const commands = path.match(/[MLQ][^MLQ]*/g);
  if (!commands || commands.length < 2) {
    return path;
  }

  const penultimateIndex = commands.length - 2;
  if (commands[penultimateIndex].trim().startsWith('Q')) {
    commands.splice(penultimateIndex, 1);
  }

  return commands.join('');
}

// Wrapper based on samp.ts smooth-step contract. We keep this local so edge
// routing can be tuned without touching library internals.

/**
 * Shortens the visible end of an SVG path by `amount` pixels along the final segment.
 * Does not modify targetX/targetY — only trims the drawn stroke.
 */
/**
 * Builds an explicit path that routes along cell boundaries to avoid passing
 * through other nodes. Used exclusively for centerInput (JoinNode) target handles.
 *
 * Strategy:
 *   – Find the row boundary ABOVE the target row: `floor(ty / GRID_H) * GRID_H`
 *   – Route: source → (sourceX, rowBoundary) → (targetX, rowBoundary) → target
 *   – When source is below the row boundary, route via the column boundary instead.
 */
function buildCenterInputPath(
  sx: number, sy: number,
  tx: number, ty: number,
  gridW: number, gridH: number,
  br: number,
  sourcePosition?: string,
): [string, number, number] {
  const rowBoundaryY = Math.floor(ty / gridH) * gridH;
  const raw: { x: number; y: number }[] = [{ x: sx, y: sy }];

  const isHorizontal = sourcePosition === 'right' || sourcePosition === 'left';

  if (isHorizontal) {
    // Route horizontally at source Y level, then drop straight down to JoinNode center.
    // This enters from the side (left/right) rather than from the top.
    const hOffset = Math.round(gridW / 6);
    const exitX = sourcePosition === 'right' ? sx + hOffset : sx - hOffset;
    raw.push({ x: exitX, y: sy });
    raw.push({ x: exitX, y: ty });
    raw.push({ x: tx, y: ty });
  } else if (Math.abs(sx - tx) < 20) {
    // Same column — straight vertical
    raw.push({ x: tx, y: ty });
  } else if (sy <= rowBoundaryY) {
    // Source is at or above the row boundary → go down to boundary, then horizontal
    raw.push({ x: sx, y: rowBoundaryY });
    raw.push({ x: tx, y: rowBoundaryY });
    raw.push({ x: tx, y: ty });
  } else {
    // Source is below target row boundary → route via column boundary (avoid going through nodes)
    const goingLeft = sx > tx;
    const colBoundaryX = goingLeft
      ? Math.ceil(tx / gridW) * gridW   // right edge of target column
      : Math.floor(tx / gridW) * gridW; // left edge of target column
    raw.push({ x: colBoundaryX, y: sy });
    raw.push({ x: colBoundaryX, y: ty });
    raw.push({ x: tx, y: ty });
  }

  // Deduplicate consecutive identical points
  const pts = raw.filter((p, i) => i === 0 || p.x !== raw[i - 1].x || p.y !== raw[i - 1].y);

  // Build SVG path with rounded bends
  let path = `M${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i - 1], c = pts[i], n = pts[i + 1];
    const d1 = Math.hypot(c.x - p.x, c.y - p.y) || 1;
    const d2 = Math.hypot(n.x - c.x, n.y - c.y) || 1;
    const r = Math.min(br, d1 / 2, d2 / 2);
    const ux1 = (c.x - p.x) / d1, uy1 = (c.y - p.y) / d1;
    const ux2 = (n.x - c.x) / d2, uy2 = (n.y - c.y) / d2;
    path += ` L${c.x - ux1 * r} ${c.y - uy1 * r} Q${c.x} ${c.y} ${c.x + ux2 * r} ${c.y + uy2 * r}`;
  }
  path += ` L${pts[pts.length - 1].x} ${pts[pts.length - 1].y}`;

  const labelX = (sx + tx) / 2;
  const labelY = (sy + ty) / 2;
  return [path, labelX, labelY];
}

function shortenPathEnd(path: string, amount: number): string {
  const commands = path.match(/[MLQ][^MLQ]*/g);
  if (!commands || commands.length < 2) return path;

  // Last command is always L — extract its endpoint
  const lastCmd = commands[commands.length - 1];
  const lastPt = lastCmd.match(/([-\d.]+)[, ]+([-\d.]+)\s*$/);
  if (!lastPt) return path;
  const lx = parseFloat(lastPt[1]);
  const ly = parseFloat(lastPt[2]);

  // Extract endpoint of the previous command (L or Q — last coord pair)
  const prevCmd = commands[commands.length - 2];
  const prevPt = prevCmd.match(/([-\d.]+)[, ]+([-\d.]+)\s*$/);
  if (!prevPt) return path;
  const px = parseFloat(prevPt[1]);
  const py = parseFloat(prevPt[2]);

  const dx = lx - px;
  const dy = ly - py;
  const len = Math.hypot(dx, dy) || 1;
  if (len <= amount) return path;

  const nx = lx - (dx / len) * amount;
  const ny = ly - (dy / len) * amount;
  commands[commands.length - 1] = `L${nx} ${ny}`;
  return commands.join('');
}




// ── Bridge-arc infrastructure ─────────────────────────────────────────────────
const BRIDGE_R = 7;

type Seg = [number, number, number, number]; // x1, y1, x2, y2

/** Populated synchronously during each render pass so every edge can see
 *  the segments of all edges that rendered before it (lower z-order). */
const _segRegistry = new Map<string, Seg[]>();

function extractSegs(d: string): Seg[] {
  const out: Seg[] = [];
  let cx = 0, cy = 0;
  for (const tok of d.match(/[MLQ][^MLQ]*/g) ?? []) {
    const t = tok[0], ns = tok.slice(1).trim().split(/[\s,]+/).map(Number);
    if (t === 'M') { cx = ns[0]; cy = ns[1]; }
    else if (t === 'L') { out.push([cx, cy, ns[0], ns[1]]); cx = ns[0]; cy = ns[1]; }
    else if (t === 'Q') { cx = ns[2]; cy = ns[3]; } // Q cx cy ex ey → endpoint at [2],[3]
  }
  return out;
}

/** Returns t ∈ (0.05, 0.95) along segment `a` at its intersection with `b`, or null. */
function segIntersectT(a: Seg, b: Seg): number | null {
  const [ax1, ay1, ax2, ay2] = a, [bx1, by1, bx2, by2] = b;
  if (Math.min(ax1,ax2) > Math.max(bx1,bx2) + 0.5) return null;
  if (Math.max(ax1,ax2) < Math.min(bx1,bx2) - 0.5) return null;
  if (Math.min(ay1,ay2) > Math.max(by1,by2) + 0.5) return null;
  if (Math.max(ay1,ay2) < Math.min(by1,by2) - 0.5) return null;
  const d1x = ax2-ax1, d1y = ay2-ay1, d2x = bx2-bx1, d2y = by2-by1;
  const det = d1x*d2y - d1y*d2x;
  if (Math.abs(det) < 0.1) return null;
  const t = ((bx1-ax1)*d2y - (by1-ay1)*d2x) / det;
  const u = ((bx1-ax1)*d1y - (by1-ay1)*d1x) / det;
  return (t > 0.05 && t < 0.95 && u > 0.05 && u < 0.95) ? t : null;
}

interface Crossing {
  segIdx: number; ix: number; iy: number;
  ux: number; uy: number; // unit direction along this edge at crossing
  bpx: number; bpy: number; // perpendicular (arc bump direction)
}

function findCrossings(mySegs: Seg[], otherMap: Map<string, Seg[]>): Crossing[] {
  const res: Crossing[] = [];
  mySegs.forEach((seg, si) => {
    const [x1,y1,x2,y2] = seg;
    const dx = x2-x1, dy = y2-y1, len = Math.hypot(dx,dy) || 1;
    const ux = dx/len, uy = dy/len;
    // Perpendicular (left-turn). For horizontal segs, prefer bumping upward (−y).
    let bpx = -uy, bpy = ux;
    if (Math.abs(ux) >= Math.abs(uy) && bpy > 0) { bpx = -bpx; bpy = -bpy; }
    otherMap.forEach(segs => {
      for (const o of segs) {
        const t = segIntersectT(seg, o);
        if (t !== null) res.push({ segIdx: si, ix: x1+t*dx, iy: y1+t*dy, ux, uy, bpx, bpy });
      }
    });
  });
  // Sort by segment index so we can process in path order
  res.sort((a, b) => a.segIdx - b.segIdx);
  return res;
}

/** Re-builds the SVG path inserting a small quadratic-bezier arc at each crossing. */
function applyBridgeArcs(svgPath: string, crossings: Crossing[]): string {
  if (!crossings.length) return svgPath;
  const byIdx = new Map<number, Crossing[]>();
  for (const c of crossings) {
    if (!byIdx.has(c.segIdx)) byIdx.set(c.segIdx, []);
    byIdx.get(c.segIdx)!.push(c);
  }
  let si = -1, prevX = 0, prevY = 0;
  const parts: string[] = [];
  for (const tok of svgPath.match(/[MLQ][^MLQ]*/g) ?? []) {
    const type = tok[0], ns = tok.slice(1).trim().split(/[\s,]+/).map(Number);
    if (type === 'M') { prevX = ns[0]; prevY = ns[1]; parts.push(tok); }
    else if (type === 'Q') { prevX = ns[2]; prevY = ns[3]; parts.push(tok); }
    else if (type === 'L') {
      si++;
      const cs = byIdx.get(si);
      if (!cs?.length) { parts.push(tok); }
      else {
        const f = (n: number) => n.toFixed(1);
        for (const { ix, iy, ux, uy, bpx, bpy } of cs) {
          const r = BRIDGE_R;
          parts.push(
            `L${f(ix - ux*r)} ${f(iy - uy*r)}` +
            ` Q${f(ix + bpx*r*1.5)} ${f(iy + bpy*r*1.5)} ${f(ix + ux*r)} ${f(iy + uy*r)}`
          );
        }
        parts.push(`L${ns[0]} ${ns[1]}`);
      }
      prevX = ns[0]; prevY = ns[1];
    }
  }
  // suppress unused-variable warnings for prevX/prevY tracking
  void prevX; void prevY;
  return parts.join('');
}

// ─────────────────────────────────────────────────────────────────────────────

export function FlowEdge({
  id,
  label,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  ...rest
}: EdgeProps<Edge<FlowEdgeData>>) {
  // ── Hooks ──────────────────────────────────────────────────────────────────
  const allEdges = useEdges();
  // Clean up registry entry when edge is removed
  useEffect(() => () => { _segRegistry.delete(id); }, [id]);

  const targetHandleId = (rest as { targetHandleId?: string; targetHandle?: string }).targetHandleId
    ?? (rest as { targetHandleId?: string; targetHandle?: string }).targetHandle;

  const markerId = `flow-edge-arrow-${id}`;
  const highlighted = (data as { highlighted?: boolean })?.highlighted ?? false;
  const strokeColor = highlighted ? STROKE_COLOR_HIGHLIGHTED : STROKE_COLOR;
  const strokeWidth = highlighted ? STROKE_WIDTH_HIGHLIGHTED : STROKE_WIDTH;
  const glowOpacity = highlighted ? 0.4 : 0.18;

  let rawEdgePath: string;
  let labelX: number;
  let labelY: number;

  if (targetHandleId === 'centerInput') {
    // Use cell-boundary routing: path travels along grid lines so it never
    // passes through the interior of another node's cell.
    const effectiveTargetY = targetY + 5;
    [rawEdgePath, labelX, labelY] = buildCenterInputPath(
      sourceX, sourceY,
      targetX, effectiveTargetY,
      GRID_WIDTH, GRID_HEIGHT,
      20,
      sourcePosition,
    );
  } else {
    [rawEdgePath, labelX, labelY] = getSmoothStepPath2({
      sourceX,
      sourceY,
      sourcePosition,
      targetX,
      targetY,
      targetPosition,
      borderRadius: 10,
      stepPosition: 0.5,
      // Vertical handles (Top/Bottom) use a short exit so bends happen close to
      // the node. Horizontal handles (Left/Right) keep a longer exit to stay
      // clear of adjacent cells. If either side is vertical, use the short offset
      // so the bend occurs near the handle rather than far from it.
      offset:20
     /*  offset:
        sourcePosition === 'top' || sourcePosition === 'bottom' ||
        targetPosition === 'top' || targetPosition === 'bottom'
          ? 10
          : Math.round(GRID_HEIGHT / 4), */
    });
  }

  // ── Bridge arcs (detect crossings with lower-z edges) ──────────────────────
  const mySegs = extractSegs(rawEdgePath);
  _segRegistry.set(id, mySegs); // synchronous write so later edges see this one

  const myIdx = allEdges.findIndex(e => e.id === id);
  const lowerSegs = new Map<string, Seg[]>();
  for (let i = 0; i < myIdx; i++) {
    const s = _segRegistry.get(allEdges[i].id);
    if (s) lowerSegs.set(allEdges[i].id, s);
  }
  const crossings = findCrossings(mySegs, lowerSegs);
  const bridgedRawPath = crossings.length ? applyBridgeArcs(rawEdgePath, crossings) : rawEdgePath;

  const edgePath = targetHandleId === 'centerInput'
    ? shortenPathEnd(bridgedRawPath, JOIN_MARKER_OFFSET)
    : highlighted
      ? shortenPathEnd(bridgedRawPath, ARROW_MARKER_SIZE * 2)
      : shortenPathEnd(bridgedRawPath, ARROW_MARKER_SIZE);
  // Glow is always shortened by ARROW_MARKER_SIZE so the thick round-capped
  // stroke never bleeds past the arrowhead tip, regardless of highlight state.
/*   const edgePathHighLight = targetHandleId === 'centerInput'
    ? edgePath
    : shortenPathEnd(rawEdgePath, ARROW_MARKER_SIZE);
 */
  const edgePathHighLight = edgePath;//shortenPathEnd(edgePath, ARROW_MARKER_SIZE);

  const labelPos = (() => {
    if (labelX === sourceX) {
      return { x: labelX, y: labelY + (labelY - sourceY) / 2 };
    }
    return { x: labelX + (labelX - sourceX) / 2, y: labelY };
  })();

  return (
    <>
      <defs>
        <marker
          id={markerId}
          markerUnits="userSpaceOnUse"
          viewBox="-8 -4 8 8"
          markerWidth="8"
          markerHeight="8"
          refX={`-${ARROW_MARKER_SIZE}`}
          refY="0"
          orient="auto"
        >
          <path d={`M-${ARROW_MARKER_SIZE},-4 L-${ARROW_MARKER_SIZE},4 L0,0 z`} fill={strokeColor} />
        </marker>
      </defs>
      {/* ── Gap blockers: white stripes that "erase" lower edges at crossings ── */}
      {crossings.map((c, i) => (
        <line
          key={`bridge-gap-${i}`}
          x1={c.ix - c.bpx * (BRIDGE_R + 3)}
          y1={c.iy - c.bpy * (BRIDGE_R + 3)}
          x2={c.ix + c.bpx * (BRIDGE_R + 3)}
          y2={c.iy + c.bpy * (BRIDGE_R + 3)}
          stroke="#ffffff"
          strokeWidth={6}
          strokeLinecap="round"
        />
      ))}
      {/* Soft glow layer */}
      <path
        d={edgePathHighLight}
        fill="none"
        stroke={strokeColor}
        strokeWidth={strokeWidth + 4}
        strokeOpacity={glowOpacity}
        strokeLinecap="butt"
      />
      {/* Main interactive path — react-flow__edge-path required for RF click detection */}
      <path
        id={id}
        d={edgePath}
        fill="none"
        className="react-flow__edge-path"
        style={{ stroke: strokeColor, strokeWidth }}
        markerEnd={`url(#${markerId})`}
      />
      {label && (
        <EdgeLabelRenderer>
          <Label
            className="nodrag nopan"
            style={{ transform: `translate(-50%, -50%) translate(${labelPos.x}px, ${labelPos.y}px)` }}
          >
            <div>{label}</div>
            {data?.showOption3 && <div>{data.option3}</div>}
          </Label>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
