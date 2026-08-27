import type { Floor, Point } from "../types/design";

export function getFloorPolygon(floor: Floor): Point[] {
  const w = floor.width, h = floor.height;
  const shape = floor.plotShape;
  if (!shape || shape.type === "rectangle") {
    return [
      { x: 0, y: 0 },
      { x: w, y: 0 },
      { x: w, y: h },
      { x: 0, y: h },
    ];
  }
  if (shape.type === "square") {
    const s = Math.min(w, h);
    // center square within bounds
    const ox = (w - s) / 2;
    const oy = (h - s) / 2;
    return [
      { x: ox, y: oy },
      { x: ox + s, y: oy },
      { x: ox + s, y: oy + s },
      { x: ox, y: oy + s },
    ];
  }
  if (shape.type === "polygon") {
    if (shape.polygon && shape.polygon.length >= 3) return shape.polygon;
    const sides = shape.sides || 6;
    const radius = shape.radius ?? Math.min(w, h) * 0.45;
    const cx = w / 2, cy = h / 2;
    const pts: Point[] = [];
    for (let i = 0; i < sides; i++) {
      const ang = (Math.PI * 2 * i) / sides - Math.PI / 2; // start top
      pts.push({ x: cx + Math.cos(ang) * radius, y: cy + Math.sin(ang) * radius });
    }
    return pts;
  }
  if (shape.polygon && shape.polygon.length >= 3) return shape.polygon;
  // L/U/T or custom with polygon
  if (shape.polygon) return shape.polygon;
  // fallback L shape generation if L/U/T without polygon
  if (shape.type === "L") {
    const nw = shape.notchWidth ?? w * 0.4;
    const nh = shape.notchHeight ?? h * 0.4;
    return [
      { x: 0, y: 0 },
      { x: w, y: 0 },
      { x: w, y: h - nh },
      { x: w - nw, y: h - nh },
      { x: w - nw, y: h },
      { x: 0, y: h },
    ];
  }
  if (shape.type === "U") {
    const nw = shape.notchWidth ?? w * 0.4;
    const nh = shape.notchHeight ?? h * 0.5;
    const side = (w - nw) / 2;
    return [
      { x: 0, y: 0 },
      { x: w, y: 0 },
      { x: w, y: h },
      { x: w - side, y: h },
      { x: w - side, y: nh },
      { x: side, y: nh },
      { x: side, y: h },
      { x: 0, y: h },
    ];
  }
  if (shape.type === "T") {
    const nw = shape.notchWidth ?? w * 0.4;
    const nh = shape.notchHeight ?? h * 0.3;
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
  // fallback rectangle
  return [
    { x: 0, y: 0 },
    { x: w, y: 0 },
    { x: w, y: h },
    { x: 0, y: h },
  ];
}

export function generateRegularPolygon(sides: number, radius: number, center: Point): Point[] {
  const pts: Point[] = [];
  for (let i = 0; i < sides; i++) {
    const ang = (Math.PI * 2 * i) / sides - Math.PI / 2;
    pts.push({ x: center.x + Math.cos(ang) * radius, y: center.y + Math.sin(ang) * radius });
  }
  return pts;
}

export function pointInPolygon(pt: Point, poly: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y;
    const xj = poly[j].x, yj = poly[j].y;
    const intersect = yi > pt.y !== yj > pt.y && pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function isRoomInsideFloor(room: { x: number; y: number; width: number; height: number }, floor: Floor): boolean {
  const poly = getFloorPolygon(floor);
  // check all four corners and center inside polygon, and also check that room is within bounding box of floor
  const corners = [
    { x: room.x, y: room.y },
    { x: room.x + room.width, y: room.y },
    { x: room.x + room.width, y: room.y + room.height },
    { x: room.x, y: room.y + room.height },
    { x: room.x + room.width / 2, y: room.y + room.height / 2 },
  ];
  return corners.every(c => pointInPolygon(c, poly));
}

export function getFloorBounds(floor: Floor): { minX: number; minY: number; maxX: number; maxY: number; width: number; height: number } {
  const poly = getFloorPolygon(floor);
  const xs = poly.map(p => p.x);
  const ys = poly.map(p => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

export function createPlotShape(type: string, floor: Floor, opts?: any): import("../types/design").PlotShape {
  if (type === "rectangle") return { type: "rectangle" };
  if (type === "square") return { type: "square" };
  if (type === "polygon") {
    const sides = opts?.sides || 6;
    const radius = opts?.radius ?? Math.min(floor.width, floor.height) * 0.45;
    const poly = generateRegularPolygon(sides, radius, { x: floor.width / 2, y: floor.height / 2 });
    return { type: "polygon", sides, radius, polygon: poly };
  }
  if (type === "custom") {
    return { type: "custom", polygon: opts?.polygon || [] };
  }
  if (type === "L" || type === "U" || type === "T") {
    return { type: type as any, notchWidth: opts?.notchWidth, notchHeight: opts?.notchHeight, polygon: getFloorPolygon({ ...floor, plotShape: { type: type as any, notchWidth: opts?.notchWidth, notchHeight: opts?.notchHeight } }) };
  }
  return { type: "rectangle" };
}
