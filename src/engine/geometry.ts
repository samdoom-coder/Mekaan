import type { Point, Room, Wall, Floor } from "../types/design";

export function pointDistance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function wallLength(wall: Wall): number {
  return pointDistance(wall.start, wall.end);
}

export function wallAngle(wall: Wall): number {
  return Math.atan2(wall.end.y - wall.start.y, wall.end.x - wall.start.x);
}

export function pointOnWall(wall: Wall, t: number): Point {
  // t 0..1
  return {
    x: wall.start.x + (wall.end.x - wall.start.x) * t,
    y: wall.start.y + (wall.end.y - wall.start.y) * t,
  };
}

export function wallBoundingBox(wall: Wall) {
  return {
    minX: Math.min(wall.start.x, wall.end.x) - wall.thickness / 2,
    maxX: Math.max(wall.start.x, wall.end.x) + wall.thickness / 2,
    minY: Math.min(wall.start.y, wall.end.y) - wall.thickness / 2,
    maxY: Math.max(wall.start.y, wall.end.y) + wall.thickness / 2,
  };
}

export function roomBoundingBox(room: Room) {
  // axis-aligned for now, rotation handled as AABB expansion
  if (room.rotation === 0) {
    return {
      minX: room.x,
      maxX: room.x + room.width,
      minY: room.y,
      maxY: room.y + room.height,
    };
  }
  // rotated: compute corners
  const cx = room.x + room.width / 2;
  const cy = room.y + room.height / 2;
  const rad = (room.rotation * Math.PI) / 180;
  const cos = Math.cos(rad), sin = Math.sin(rad);
  const corners = [
    { x: -room.width / 2, y: -room.height / 2 },
    { x: room.width / 2, y: -room.height / 2 },
    { x: room.width / 2, y: room.height / 2 },
    { x: -room.width / 2, y: room.height / 2 },
  ].map(p => ({
    x: cx + p.x * cos - p.y * sin,
    y: cy + p.x * sin + p.y * cos,
  }));
  return {
    minX: Math.min(...corners.map(c => c.x)),
    maxX: Math.max(...corners.map(c => c.x)),
    minY: Math.min(...corners.map(c => c.y)),
    maxY: Math.max(...corners.map(c => c.y)),
  };
}

export function roomsOverlap(a: Room, b: Room): boolean {
  if (a.id === b.id) return false;
  const A = roomBoundingBox(a);
  const B = roomBoundingBox(b);
  return !(A.maxX <= B.minX || A.minX >= B.maxX || A.maxY <= B.minY || A.minY >= B.maxY);
}

function isPointInPoly(pt: Point, poly: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y;
    const xj = poly[j].x, yj = poly[j].y;
    const intersect = ((yi > pt.y) !== (yj > pt.y)) && (pt.x < (xj - xi) * (pt.y - yi) / (yj - yi + 1e-9) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}
function isRectInPoly(rect: { x: number; y: number; width: number; height: number }, poly: Point[]): boolean {
  const corners: Point[] = [
    { x: rect.x, y: rect.y },
    { x: rect.x + rect.width, y: rect.y },
    { x: rect.x + rect.width, y: rect.y + rect.height },
    { x: rect.x, y: rect.y + rect.height },
  ];
  return corners.every(c => isPointInPoly(c, poly));
}
function getPolyForFloor(floor: Floor): Point[] | null {
  const ps = (floor as any).plotShape as any;
  if (!ps || ps.type === "rectangle") return null;
  if (ps.polygon && ps.polygon.length >= 3) return ps.polygon;
  const w = floor.width, h = floor.height;
  if (ps.type === "square") {
    const s = Math.min(w, h);
    const ox = (w - s) / 2, oy = (h - s) / 2;
    return [{ x: ox, y: oy }, { x: ox + s, y: oy }, { x: ox + s, y: oy + s }, { x: ox, y: oy + s }];
  }
  if (ps.type === "polygon") {
    const sides = ps.sides || 6;
    const radius = ps.radius ?? Math.min(w, h) * 0.45;
    const cx = w / 2, cy = h / 2;
    const pts: Point[] = [];
    for (let i = 0; i < sides; i++) {
      const ang = -Math.PI / 2 + (i * 2 * Math.PI) / sides;
      pts.push({ x: cx + Math.cos(ang) * radius, y: cy + Math.sin(ang) * radius });
    }
    return pts;
  }
  const nw = ps.notchWidth ?? Math.floor(w * 0.4);
  const nh = ps.notchHeight ?? Math.floor(h * 0.4);
  if (ps.type === "L") {
    return [{ x: 0, y: 0 }, { x: w - nw, y: 0 }, { x: w - nw, y: h - nh }, { x: w, y: h - nh }, { x: w, y: h }, { x: 0, y: h }];
  }
  if (ps.type === "U") {
    const side = (w - nw) / 2;
    return [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: w - side, y: h }, { x: w - side, y: h - nh }, { x: side, y: h - nh }, { x: side, y: h }, { x: 0, y: h }];
  }
  if (ps.type === "T") {
    const side = (w - nw) / 2;
    return [{ x: side, y: 0 }, { x: side + nw, y: 0 }, { x: side + nw, y: h - nh }, { x: w, y: h - nh }, { x: w, y: h }, { x: 0, y: h }, { x: 0, y: h - nh }, { x: side, y: h - nh }];
  }
  return null;
}
export function roomInsideFloor(room: Room, floor: Floor): boolean {
  const bb = roomBoundingBox(room);
  const poly = getPolyForFloor(floor);
  if (poly) {
    if (room.rotation !== 0) {
      const cx = room.x + room.width / 2;
      const cy = room.y + room.height / 2;
      const rad = (room.rotation * Math.PI) / 180;
      const cos = Math.cos(rad), sin = Math.sin(rad);
      const corners = [
        { x: -room.width / 2, y: -room.height / 2 },
        { x: room.width / 2, y: -room.height / 2 },
        { x: room.width / 2, y: room.height / 2 },
        { x: -room.width / 2, y: room.height / 2 },
      ].map(pt => ({ x: cx + pt.x * cos - pt.y * sin, y: cy + pt.x * sin + pt.y * cos }));
      return corners.every(c => isPointInPoly(c, poly));
    }
    return isRectInPoly({ x: room.x, y: room.y, width: room.width, height: room.height }, poly);
  }
  return bb.minX >= 0 && bb.minY >= 0 && bb.maxX <= floor.width && bb.maxY <= floor.height;
}

export function roomArea(room: Room): number {
  return room.width * room.height;
}

export function distanceBetweenRooms(a: Room, b: Room): number {
  const A = roomBoundingBox(a);
  const B = roomBoundingBox(b);
  const dx = Math.max(0, Math.max(A.minX - B.maxX, B.minX - A.maxX));
  const dy = Math.max(0, Math.max(A.minY - B.maxY, B.minY - A.maxY));
  return Math.hypot(dx, dy);
}

// For wall geometry abstraction: returns polygon for wall thickness (rect)
export function wallPolygon(wall: Wall): Point[] {
  const len = wallLength(wall);
  if (len === 0) return [wall.start, wall.end];
  const angle = wallAngle(wall);
  const nx = -Math.sin(angle) * (wall.thickness / 2);
  const ny = Math.cos(angle) * (wall.thickness / 2);
  return [
    { x: wall.start.x + nx, y: wall.start.y + ny },
    { x: wall.end.x + nx, y: wall.end.y + ny },
    { x: wall.end.x - nx, y: wall.end.y - ny },
    { x: wall.start.x - nx, y: wall.start.y - ny },
  ];
}

export function clampRoomToFloor(room: Room, floor: Floor): Room {
  const bb = roomBoundingBox(room);
  let dx = 0, dy = 0;
  if (bb.minX < 0) dx = -bb.minX;
  if (bb.maxX > floor.width) dx = floor.width - bb.maxX;
  if (bb.minY < 0) dy = -bb.minY;
  if (bb.maxY > floor.height) dy = floor.height - bb.maxY;
  if (dx !== 0 || dy !== 0) {
    return { ...room, x: room.x + dx, y: room.y + dy };
  }
  return room;
}

export function isValidRoomSize(room: Room, minSize = 6): boolean {
  // Minimum dimension, default 6 ft
  return room.width >= minSize && room.height >= minSize;
}

export function getWallTAtPoint(wall: Wall, point: Point): number {
  const len = wallLength(wall);
  if (len === 0) return 0;
  const vx = wall.end.x - wall.start.x;
  const vy = wall.end.y - wall.start.y;
  const wx = point.x - wall.start.x;
  const wy = point.y - wall.start.y;
  const dot = wx * vx + wy * vy;
  return Math.max(0, Math.min(1, dot / (len * len)));
}
