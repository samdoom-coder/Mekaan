import type { Design, Floor } from "../types/design";

function uid(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

export function createDemoFloor(siteW: number, siteH: number): Floor {
  const floor: Floor = {
    id: "floor_ground",
    name: "Ground Floor",
    level: 0,
    width: siteW,
    height: siteH,
    rooms: [],
    walls: [],
    doors: [],
    windows: [],
    objects: [],
    dimensions: [],
    annotations: [],
  };

  // Helper to add room
  const addRoom = (name: string, type: any, x: number, y: number, w: number, h: number) => {
    floor.rooms.push({
      id: uid("room"),
      name,
      type,
      x,
      y,
      width: w,
      height: h,
      rotation: 0,
      properties: {},
    });
  };

  // Plot 40x60 ; layout roughly:
  // Divide 40 width (x) and 60 depth (y)
  // Top y=0 to bottom y=60
  // Row1: Living (0,0,18,18), Dining (18,0,12,14), Kitchen (30,0,10,14)
  // Row2: Hallway horizontal? But we simplify rectangular rooms without overlap
  // Row2: Master Bedroom (0,18,14,14), Bathroom (14,18,6,7), Bathroom2 (14,25,6,7), Bedroom2 (20,14,10,12), Bedroom3 (30,14,10,12)
  // Row3: Utility area bottom : we have space left
  // Let's craft to fill neatly:
  
  addRoom("Living Room", "living-room", 1, 1, 17, 16);
  addRoom("Dining", "dining-room", 19, 1, 11, 12);
  addRoom("Kitchen", "kitchen", 31, 1, 8, 12);
  addRoom("Master Bedroom", "master-bedroom", 1, 18, 14, 14);
  addRoom("Bedroom 2", "bedroom", 19, 14, 10, 10);
  addRoom("Bedroom 3", "bedroom", 31, 14, 8, 10);
  addRoom("Bathroom", "bathroom", 16, 18, 5, 7);
  addRoom("Bathroom 2", "bathroom", 16, 26, 5, 6);
  addRoom("Hall", "hall", 1, 33, 38, 4);

  // Walls: perimeter and some interior
  const w = siteW, h = siteH;
  const thickness = 0.5;
  const walls: Floor["walls"] = [
    { id: uid("wall"), start: { x: 0, y: 0 }, end: { x: w, y: 0 }, thickness, height: 9, type: "exterior" },
    { id: uid("wall"), start: { x: w, y: 0 }, end: { x: w, y: h }, thickness, height: 9, type: "exterior" },
    { id: uid("wall"), start: { x: w, y: h }, end: { x: 0, y: h }, thickness, height: 9, type: "exterior" },
    { id: uid("wall"), start: { x: 0, y: h }, end: { x: 0, y: 0 }, thickness, height: 9, type: "exterior" },
    // interior walls separating rooms
    { id: uid("wall"), start: { x: 18, y: 1 }, end: { x: 18, y: 13 }, thickness: 0.4, height: 9, type: "interior" },
    { id: uid("wall"), start: { x: 30, y: 1 }, end: { x: 30, y: 14 }, thickness: 0.4, height: 9, type: "interior" },
    { id: uid("wall"), start: { x: 15, y: 18 }, end: { x: 15, y: 32 }, thickness: 0.4, height: 9, type: "interior" },
    { id: uid("wall"), start: { x: 29, y: 14 }, end: { x: 29, y: 24 }, thickness: 0.4, height: 9, type: "interior" },
  ];
  floor.walls.push(...walls);

  // Doors: attach to walls (use wallId of perimeter or interior)
  if (floor.walls.length >= 4) {
    floor.doors.push(
      { id: uid("door"), wallId: floor.walls[0].id, position: 0.5, width: 3, swingDirection: "right" },
      { id: uid("door"), wallId: floor.walls[4].id, position: 0.6, width: 3, swingDirection: "left" },
      { id: uid("door"), wallId: floor.walls[6].id, position: 0.3, width: 2.8, swingDirection: "right" },
    );
    floor.windows.push(
      { id: uid("win"), wallId: floor.walls[1].id, position: 0.3, width: 4, height: 4, type: "casement" },
      { id: uid("win"), wallId: floor.walls[1].id, position: 0.7, width: 4, height: 4, type: "casement" },
      { id: uid("win"), wallId: floor.walls[3].id, position: 0.25, width: 5, height: 4, type: "sliding" },
    );
  }

  // Furniture
  floor.objects.push(
    { id: uid("obj"), type: "sofa", x: 3, y: 3, width: 6, height: 2.5, rotation: 0 },
    { id: uid("obj"), type: "dining-table", x: 21, y: 4, width: 6, height: 4, rotation: 0 },
    { id: uid("obj"), type: "bed", x: 3, y: 20, width: 6, height: 7, rotation: 0 },
    { id: uid("obj"), type: "bed", x: 21, y: 16, width: 5, height: 6, rotation: 0 },
    { id: uid("obj"), type: "bed", x: 32, y: 16, width: 5, height: 6, rotation: 0 },
    { id: uid("obj"), type: "kitchen-counter", x: 32, y: 2, width: 6, height: 1.5, rotation: 0 },
  );

  // Dimensions
  floor.dimensions.push(
    { id: uid("dim"), start: { x: 1, y: 0.2 }, end: { x: 18, y: 0.2 } },
    { id: uid("dim"), start: { x: 39.2, y: 1 }, end: { x: 39.2, y: 17 } },
  );

  return floor;
}

export function createDemoDesign(): Design {
  const siteW = 40, siteH = 60;
  const floor = createDemoFloor(siteW, siteH);
  return {
    id: "demo_design",
    version: 1,
    units: "feet",
    site: { width: siteW, depth: siteH },
    floors: [floor],
    metadata: {
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    name: "Modern 3 Bedroom House",
    propertyType: "residential",
  };
}

export const ROOM_TYPE_LABELS: Record<string, string> = {
  "living-room": "Living Room",
  bedroom: "Bedroom",
  "master-bedroom": "Master Bedroom",
  kitchen: "Kitchen",
  "dining-room": "Dining Room",
  bathroom: "Bathroom",
  toilet: "Toilet",
  study: "Study",
  balcony: "Balcony",
  garage: "Garage",
  utility: "Utility",
  store: "Store",
  hall: "Hall",
  other: "Other",
};

export const ROOM_TYPE_COLORS: Record<string, string> = {
  "living-room": "#fef3c7",
  bedroom: "#dbeafe",
  "master-bedroom": "#bfdbfe",
  kitchen: "#fed7aa",
  "dining-room": "#fef9c3",
  bathroom: "#e0f2fe",
  toilet: "#e0f2fe",
  study: "#f3e8ff",
  balcony: "#dcfce7",
  garage: "#e5e7eb",
  utility: "#fce7f3",
  store: "#f3f4f6",
  hall: "#fafafa",
  other: "#f5f5f4",
};
