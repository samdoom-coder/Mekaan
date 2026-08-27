export type UnitSystem = "feet" | "meters" | "centimeters" | "inches";
export type PropertyType = "residential" | "apartment" | "villa" | "office" | "commercial";

export interface Point {
  x: number;
  y: number;
}

export type RoomType =
  | "living-room"
  | "bedroom"
  | "master-bedroom"
  | "kitchen"
  | "dining-room"
  | "bathroom"
  | "toilet"
  | "study"
  | "balcony"
  | "garage"
  | "utility"
  | "store"
  | "hall"
  | "other";

export interface RoomProperties {
  color?: string;
  labelColor?: string;
}

export interface Room {
  id: string;
  name: string;
  type: RoomType;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  properties: RoomProperties;
}

export type WallType = "exterior" | "interior" | "partition";

export interface Wall {
  id: string;
  start: Point;
  end: Point;
  thickness: number;
  height: number;
  type: WallType;
}

export interface Door {
  id: string;
  wallId: string;
  position: number; // 0..1 along wall
  width: number;
  swingDirection: "left" | "right";
  swingAngle?: number; // degrees, default 90
}

export interface Window {
  id: string;
  wallId: string;
  position: number;
  width: number;
  height: number;
  type?: "fixed" | "sliding" | "casement";
}

export type FurnitureType =
  | "bed"
  | "sofa"
  | "dining-table"
  | "chair"
  | "kitchen-counter"
  | "toilet"
  | "sink"
  | "shower"
  | "bathtub"
  | "wardrobe"
  | "car";

export interface DesignObject {
  id: string;
  type: FurnitureType;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  label?: string;
}

export interface Dimension {
  id: string;
  start: Point;
  end: Point;
  offset?: number;
  label?: string;
}

export interface Annotation {
  id: string;
  text: string;
  position: Point;
}

export interface Site {
  width: number; // in selected units, e.g., feet
  depth: number;
}

export interface DesignMetadata {
  createdAt: string;
  updatedAt: string;
  author?: string;
}

export type PlotShapeType = "rectangle" | "square" | "polygon" | "L" | "U" | "T" | "custom";

export interface PlotShape {
  type: PlotShapeType;
  polygon?: Point[]; // world polygon for custom and generated shapes
  sides?: number; // for polygon (3-12)
  radius?: number;
  notchWidth?: number; // for L/U/T
  notchHeight?: number;
}

export interface Floor {
  id: string;
  name: string;
  level: number;
  width: number;
  height: number;
  plotShape?: PlotShape;
  rooms: Room[];
  walls: Wall[];
  doors: Door[];
  windows: Window[];
  objects: DesignObject[];
  dimensions: Dimension[];
  annotations: Annotation[];
}

export interface Design {
  id: string;
  version: number;
  units: UnitSystem;
  site: Site;
  floors: Floor[];
  metadata: DesignMetadata;
  propertyType?: PropertyType;
  name?: string;
}

export interface ProjectSummary {
  id: string;
  name: string;
  propertyType: PropertyType;
  units: UnitSystem;
  site: Site;
  floors: number;
  updatedAt: string;
  createdAt: string;
  thumbnail?: string;
  design?: Design;
}

// Operations
export type OperationType =
  | "CREATE_ROOM"
  | "MOVE_ROOM"
  | "RESIZE_ROOM"
  | "DELETE_ROOM"
  | "CREATE_WALL"
  | "MOVE_WALL"
  | "UPDATE_WALL"
  | "DELETE_WALL"
  | "CREATE_DOOR"
  | "MOVE_DOOR"
  | "UPDATE_DOOR"
  | "DELETE_DOOR"
  | "CREATE_WINDOW"
  | "MOVE_WINDOW"
  | "UPDATE_WINDOW"
  | "DELETE_WINDOW"
  | "CREATE_OBJECT"
  | "MOVE_OBJECT"
  | "DELETE_OBJECT"
  | "CREATE_DIMENSION"
  | "DELETE_DIMENSION"
  | "UPDATE_DESIGN";

export interface DesignOperation {
  id: string;
  type: OperationType;
  timestamp: number;
  payload: unknown;
}

// Commands (AI)
export interface DesignCommand {
  type: string;
  parameters: Record<string, unknown>;
}

// Renderer abstraction
export interface DesignRenderer {
  render(design: Design): string; // returns SVG string or similar
}

// Selection
export type SelectableType = "room" | "wall" | "door" | "window" | "object" | "dimension";
export interface SelectionItem {
  id: string;
  type: SelectableType;
  floorId: string;
}

export interface ViewportState {
  x: number; // world pan x
  y: number;
  zoom: number;
  gridSize: number;
  showGrid: boolean;
  snapToGrid: boolean;
  units: UnitSystem;
}

export interface AppTool {
  id: string;
  label: string;
  shortcut: string;
  icon?: string;
}
