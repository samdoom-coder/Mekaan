import type { Point } from "../types/design";

export function snapValue(value: number, gridSize: number): number {
  return Math.round(value / gridSize) * gridSize;
}

export function snapPoint(point: Point, gridSize: number): Point {
  return {
    x: snapValue(point.x, gridSize),
    y: snapValue(point.y, gridSize),
  };
}

export function snapIfEnabled(point: Point, gridSize: number, enabled: boolean): Point {
  return enabled ? snapPoint(point, gridSize) : point;
}

// --- Object (edge-to-edge) snapping ---------------------------------------
// Grid snapping alone leaves small rooms floating near — but not flush with —
// neighbours. These helpers align a moving rect's edges/center to other
// rects' edges/centers (and plot bounds) within a world-unit threshold.
// Works identically for big and small rects (no size-dependent behaviour).

export interface SnapRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SnapTargets {
  vertical: number[]; // x edges + centers to snap to
  horizontal: number[]; // y edges + centers to snap to
}

/** Collect snap lines from rects (edges + centers) plus optional plot bounds. */
export function collectSnapTargets(rects: SnapRect[], bounds?: { width: number; height: number }): SnapTargets {
  const vertical: number[] = [];
  const horizontal: number[] = [];
  for (const r of rects) {
    vertical.push(r.x, r.x + r.width, r.x + r.width / 2);
    horizontal.push(r.y, r.y + r.height, r.y + r.height / 2);
  }
  if (bounds) {
    vertical.push(0, bounds.width, bounds.width / 2);
    horizontal.push(0, bounds.height, bounds.height / 2);
  }
  return { vertical, horizontal };
}

/** Snap a single edge coordinate to the nearest target within threshold. */
export function snapEdgeToTargets(
  value: number,
  targets: number[],
  threshold: number,
): { value: number; delta: number; snapped: boolean } {
  let best: number | null = null;
  let bestD = Infinity;
  for (const t of targets) {
    const d = t - value;
    if (Math.abs(d) <= threshold && Math.abs(d) < Math.abs(bestD)) {
      bestD = d;
      best = t;
    }
  }
  if (best == null) return { value, delta: 0, snapped: false };
  return { value: best, delta: bestD, snapped: bestD !== 0 };
}

export interface RectSnapResult {
  x: number;
  y: number;
  snappedX: boolean;
  snappedY: boolean;
}

/**
 * Snap a moving rect to neighbours: tries left/right/center-x (and
 * top/bottom/center-y) and applies the smallest winning shift per axis.
 */
export function snapRectToTargets(
  rect: SnapRect,
  targets: SnapTargets,
  threshold: number,
): RectSnapResult {
  const left = snapEdgeToTargets(rect.x, targets.vertical, threshold);
  const right = snapEdgeToTargets(rect.x + rect.width, targets.vertical, threshold);
  const cx = snapEdgeToTargets(rect.x + rect.width / 2, targets.vertical, threshold);
  const top = snapEdgeToTargets(rect.y, targets.horizontal, threshold);
  const bottom = snapEdgeToTargets(rect.y + rect.height, targets.horizontal, threshold);
  const cy = snapEdgeToTargets(rect.y + rect.height / 2, targets.horizontal, threshold);

  // Convert right/center snaps to top-left shifts.
  const optionsX = [
    { delta: left.delta, hit: left.snapped },
    { delta: right.delta, hit: right.snapped },
    { delta: cx.delta, hit: cx.snapped },
  ].filter((o) => o.hit);
  const optionsY = [
    { delta: top.delta, hit: top.snapped },
    { delta: bottom.delta, hit: bottom.snapped },
    { delta: cy.delta, hit: cy.snapped },
  ].filter((o) => o.hit);

  optionsX.sort((a, b) => Math.abs(a.delta) - Math.abs(b.delta));
  optionsY.sort((a, b) => Math.abs(a.delta) - Math.abs(b.delta));

  const dx = optionsX.length ? optionsX[0].delta : 0;
  const dy = optionsY.length ? optionsY[0].delta : 0;
  return { x: rect.x + dx, y: rect.y + dy, snappedX: optionsX.length > 0, snappedY: optionsY.length > 0 };
}
