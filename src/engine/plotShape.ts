import type { Point, PlotShape, Floor } from "../types/design";

export function getFloorPolygon(floor: Floor): Point[] {
  if (floor.plotShape?.type === "custom" && floor.plotShape.polygon && floor.plotShape.polygon.length >= 3) {
    return floor.plotShape.polygon;
  }
  if (floor.plotShape?.type === "L") {
    const w = floor.width, h = floor.height;
    const nw = floor.plotShape.notchWidth ?? Math.floor(w * 0.4);
    const nh = floor.plotShape.notchHeight ?? Math.floor(h * 0.4);
    // L shape: outer  w x h, notch at top-right
    // points clockwise from 0,0
    return [
      { x: 0, y: 0 },
      { x: w - nw, y: 0 },
      { x: w - nw, y: h - nh },
      { x: w, y: h - nh },
      { x: w, y: h },
      { x: 0, y: h },
    ];
  }
  if (floor.plotShape?.type === "U") {
    const w = floor.width, h = floor.height;
    const nw = floor.plotShape.notchWidth ?? Math.floor(w * 0.35);
    const nh = floor.plotShape.notchHeight ?? Math.floor(h * 0.5);
    const side = (w - nw) / 2;
    return [
      { x: 0, y: 0 },
      { x: w, y: 0 },
      { x: w, y: h },
      { x: w - side, y: h },
      { x: w - side, y: h - nh },
      { x: side, y: h - nh },
      { x: side, y: h },
      { x: 0, y: h },
    ];
  }
  if (floor.plotShape?.type === "T") {
    const w = floor.width, h = floor.height;
    const nw = floor.plotShape.notchWidth ?? Math.floor(w * 0.4);
    const nh = floor.plotShape.notchHeight ?? Math.floor(h * 0.35);
    const side = (w - nw) / 2;
    return [
      { x: side, y: 0 },
      { x: side + nw, y: 0 },
      { x: side + nw, y: h - nh },
      { x: w, y: h - nh },
      { x: w, y: h },
      { x: 0, y: h },
      { x: 0, y: h - nh },
      { x: side, y: h - nh },
    ];
  }
  // rectangle default
  return [
    { x: 0, y: 0 },
    { x: floor.width, y: 0 },
    { x: floor.width, y: floor.height },
    { x: 0, y: floor.height },
  ];
}

export function polygonBounds(poly: Point[]) {
  const xs = poly.map(p => p.x);
  const ys = poly.map(p => p.y);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  };
}

export function isPointInPolygon(pt: Point, poly: Point[]): boolean {
  // ray casting
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y;
    const xj = poly[j].x, yj = poly[j].y;
    const intersect = ((yi > pt.y) !== (yj > pt.y)) && (pt.x < (xj - xi) * (pt.y - yi) / (yj - yi + 1e-9) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

export function isRectInPolygon(rect: { x: number; y: number; width: number; height: number }, poly: Point[]): boolean {
  // check all 4 corners inside polygon (for axis-aligned rect, rotation==0)
  const corners: Point[] = [
    { x: rect.x, y: rect.y },
    { x: rect.x + rect.width, y: rect.y },
    { x: rect.x + rect.width, y: rect.y + rect.height },
    { x: rect.x, y: rect.y + rect.height },
  ];
  return corners.every(c => isPointInPolygon(c, poly));
}

export function generateShapePolygon(type: PlotShape["type"], width: number, height: number, notchW?: number, notchH?: number): Point[] {
  const tmp: Floor = { id: "tmp", name: "tmp", level: 0, width, height, rooms: [], walls: [], doors: [], windows: [], objects: [], dimensions: [], annotations: [], plotShape: { type, notchWidth: notchW, notchHeight: notchH } };
  return getFloorPolygon(tmp);
}

export function createCustomPolygon(points: Point[]): Point[] {
  // ensure closed and at least 3 points, simple validation
  if (points.length < 3) return points;
  // remove duplicate last if same as first
  const last = points[points.length - 1];
  const first = points[0];
  if (Math.hypot(last.x - first.x, last.y - first.y) < 0.1) return points.slice(0, -1);
  return points;
}

export function getPlotArea(poly: Point[]): number {
  let area = 0;
  for (let i = 0; i < poly.length; i++) {
    const j = (i + 1) % poly.length;
    area += poly[i].x * poly[j].y - poly[j].x * poly[i].y;
  }
  return Math.abs(area) / 2;
}
