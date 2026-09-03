import type { Design, UnitSystem } from "../../types/design";

export type SpatialRelationship =
  | "ADJACENT"
  | "NEAR"
  | "FAR"
  | "INSIDE"
  | "FRONT_OF"
  | "BEHIND"
  | "LEFT_OF"
  | "RIGHT_OF"
  | "ATTACHED"
  | "ACCESSIBLE_FROM";

export interface RoomRequirement {
  type: string;
  name: string;
  count: number;
  targetArea?: number;
  preferredWidth?: number;
  preferredHeight?: number;
  minWidth?: number;
  minHeight?: number;
  sizeMode?: "exact" | "preferred" | "minimum";
  required?: boolean;
}

export interface SpatialRequirement {
  sourceRoom: string;
  relationship: SpatialRelationship;
  targetRoom: string;
  strength: "required" | "preferred";
}

export interface LayoutPreferences {
  entrance: "front" | "left" | "right" | "rear" | "any";
  masterBedroom: "front" | "rear" | "left" | "right" | "any";
  kitchen: "near-dining" | "near-entrance" | "rear" | "any";
  livingRoom: "near-entrance" | "center" | "rear" | "any";
  bedrooms: "grouped" | "separated" | "private-zone" | "any";
}

export interface DesignGenerationRequest {
  projectId?: string;
  plot: { width: number; depth: number; unit: string };
  floors: number;
  rooms: RoomRequirement[];
  relationships: SpatialRequirement[];
  preferences: LayoutPreferences;
  brief?: string;
  seed?: number;
  count?: number;
}

export interface GenerationPlan {
  summary: string;
  assumptions: string[];
  rooms: Array<{
    name: string;
    type: string;
    targetArea?: number;
    preferredWidth?: number;
    preferredHeight?: number;
    preferredPosition?: string;
    relationships: SpatialRequirement[];
  }>;
  relationships: SpatialRequirement[];
  entrance?: { side: string; position: number };
  warnings: string[];
  confidence?: number;
}

export interface GenerationOption {
  label: string;
  summary: string;
  rooms: Array<{ name: string; type: string; x: number; y: number; width: number; height: number; id?: string }>;
  walls: Array<{ id: string; start: { x: number; y: number }; end: { x: number; y: number }; thickness: number; height: number; type: string }>;
  doors: Array<{ id: string; wallId: string; position: number; width: number; swingDirection: string }>;
  windows: Array<{ id: string; wallId: string; position: number; width: number; height: number; type?: string }>;
  commands: Array<{ type: string; parameters: Record<string, unknown> }>;
  design: Design;
  warnings: string[];
  assumptions?: string[];
  counts?: Record<string, number>;
  checks?: Array<{ label: string; passed: boolean }>;
  seed?: number;
  totalArea?: number;
  roomCount?: number;
}

export interface GenerationResult {
  success: boolean;
  generationId: string;
  summary: string;
  plan?: GenerationPlan;
  planSource?: string;
  rooms?: Array<{ name: string; type: string; x: number; y: number; width: number; height: number; id?: string }>;
  walls?: Array<{ id: string; start: { x: number; y: number }; end: { x: number; y: number }; thickness: number; height: number; type: string }>;
  doors?: Array<{ id: string; wallId: string; position: number; width: number; swingDirection: string }>;
  windows?: Array<{ id: string; wallId: string; position: number; width: number; height: number; type?: string }>;
  commands?: Array<{ type: string; parameters: Record<string, unknown> }>;
  design?: Design;
  warnings: string[];
  assumptions?: string[];
  counts?: Record<string, number>;
  checks?: Array<{ label: string; passed: boolean }>;
  seed?: number;
  message?: string;
  errors?: Array<{ type: string; message: string; rooms?: string[] }>;
  suggestions?: string[];
  totalArea?: number;
  roomCount?: number;
  options?: GenerationOption[];
  count?: number;
}

export type GenerationStatus =
  | "idle"
  | "understanding"
  | "planning"
  | "layout"
  | "validating"
  | "repairing"
  | "ready"
  | "failed";

export interface GenerationState {
  status: GenerationStatus;
  request?: DesignGenerationRequest;
  result?: GenerationResult;
  error?: string;
  generationId?: string;
}

export const STATUS_LABEL: Record<GenerationStatus, string> = {
  idle: "Idle",
  understanding: "Understanding your requirements...",
  planning: "Planning room relationships...",
  layout: "Building the layout...",
  validating: "Checking spatial constraints...",
  repairing: "Refining the layout...",
  ready: "Ready",
  failed: "Failed",
};

export const OPTIONAL_ROOM_TYPES = [
  "study",
  "office",
  "family-room",
  "laundry",
  "pantry",
  "walk-in-closet",
  "utility-room",
  "prayer-room",
  "storage",
  "guest-room",
  "garage",
  "balcony",
  "patio",
] as const;

export function defaultRequest(units: UnitSystem = "feet"): DesignGenerationRequest {
  return {
    plot: { width: 40, depth: 60, unit: units === "meters" ? "m" : units === "centimeters" ? "cm" : units === "inches" ? "in" : "ft" },
    floors: 1,
    rooms: [
      { type: "master-bedroom", name: "Master Bedroom", count: 1, preferredWidth: 14, preferredHeight: 16, required: true },
      { type: "bedroom", name: "Bedroom", count: 2, preferredWidth: 11, preferredHeight: 12, required: true },
      { type: "bathroom", name: "Bathroom", count: 2, required: true },
      { type: "kitchen", name: "Kitchen", count: 1, required: true },
      { type: "dining-room", name: "Dining Room", count: 1, required: true },
      { type: "living-room", name: "Living Room", count: 1, preferredWidth: 15, preferredHeight: 18, required: true },
    ],
    relationships: [
      { sourceRoom: "Kitchen", relationship: "ADJACENT", targetRoom: "Dining Room", strength: "required" },
      { sourceRoom: "Living Room", relationship: "NEAR", targetRoom: "Entrance", strength: "preferred" },
      { sourceRoom: "Bathroom", relationship: "ATTACHED", targetRoom: "Master Bedroom", strength: "required" },
    ],
    preferences: {
      entrance: "front",
      masterBedroom: "rear",
      kitchen: "near-dining",
      livingRoom: "near-entrance",
      bedrooms: "private-zone",
    },
    brief: "",
    seed: Math.floor(Math.random() * 100000),
    count: 3,
  };
}
