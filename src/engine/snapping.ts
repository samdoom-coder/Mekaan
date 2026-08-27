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
