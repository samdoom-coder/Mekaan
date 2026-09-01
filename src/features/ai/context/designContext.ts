import type { Design } from "../../../types/design";

export interface DesignContext {
  project: { name: string; propertyType?: string };
  floor: { id: string; name: string; width: number; height: number };
  site: { width: number; depth: number };
  rooms: { id: string; name: string; type: string; x: number; y: number; width: number; height: number; area: number }[];
  walls: { id: string; start: { x: number; y: number }; end: { x: number; y: number }; type: string }[];
  doors: { id: string; wallId: string; width: number }[];
  windows: { id: string; wallId: string; width: number }[];
  objects: { id: string; type: string; x: number; y: number; width: number; height: number }[];
  constraints: { minRoomSize: number; units: string; floorBoundary: { width: number; height: number } };
  units: string;
}

export function buildDesignContext(design: Design, floorId?: string): DesignContext {
  const floors = design.floors || [];
  let floor = floorId ? floors.find((f) => f.id === floorId) : undefined;
  if (!floor) floor = floors[0];
  if (!floor) {
    floor = {
      id: "floor_1",
      name: "Ground Floor",
      level: 0,
      width: 40,
      height: 60,
      rooms: [],
      walls: [],
      doors: [],
      windows: [],
      objects: [],
      dimensions: [],
      annotations: [],
    };
  }
  const site = design.site || { width: floor.width, depth: floor.height };
  return {
    project: { name: design.name || "Untitled", propertyType: design.propertyType || "residential" },
    floor: { id: floor.id, name: floor.name, width: floor.width, height: floor.height },
    site: { width: site.width, depth: site.depth },
    rooms: (floor.rooms || []).map((r) => ({
      id: r.id,
      name: r.name,
      type: r.type,
      x: r.x,
      y: r.y,
      width: r.width,
      height: r.height,
      area: Math.round(r.width * r.height * 10) / 10,
    })),
    walls: (floor.walls || []).slice(0, 20).map((w) => ({ id: w.id, start: w.start, end: w.end, type: w.type })),
    doors: (floor.doors || []).slice(0, 20).map((d) => ({ id: d.id, wallId: d.wallId, width: d.width })),
    windows: (floor.windows || []).slice(0, 20).map((w) => ({ id: w.id, wallId: w.wallId, width: w.width })),
    objects: (floor.objects || []).slice(0, 20).map((o) => ({ id: o.id, type: o.type, x: o.x, y: o.y, width: o.width, height: o.height })),
    constraints: { minRoomSize: 6, units: design.units || "feet", floorBoundary: { width: floor.width, height: floor.height } },
    units: design.units || "feet",
  };
}
