import { ALLOWED_COMMANDS, type AICommand } from "./commandTypes";

export interface ValidationResult {
  valid: boolean;
  message?: string;
}

const REQUIRED: Record<string, string[][]> = {
  CREATE_ROOM: [["roomType", "room_type", "type"]],
  DELETE_ROOM: [["roomId", "room_id"]],
  MOVE_ROOM: [["roomId", "room_id"]],
  RESIZE_ROOM: [["roomId", "room_id"]],
  CREATE_WALL: [["start", "end"]],
  DELETE_WALL: [["wallId", "wall_id"]],
  CREATE_DOOR: [["wallId", "wall_id"]],
  DELETE_DOOR: [["doorId", "door_id", "id"]],
  CREATE_WINDOW: [["wallId", "wall_id", "roomId", "room_id"]],
  DELETE_WINDOW: [["windowId", "window_id", "id"]],
  MOVE_OBJECT: [["objectId", "object_id", "id"]],
  RESIZE_OBJECT: [["objectId", "object_id", "id"]],
};

export function validateCommand(cmd: AICommand): ValidationResult {
  if (!cmd.type || typeof cmd.type !== "string") return { valid: false, message: "Invalid command type" };
  const up = cmd.type.toUpperCase();
  if (!ALLOWED_COMMANDS.has(up)) return { valid: false, message: `Unknown command type ${cmd.type}` };
  if (!cmd.parameters || typeof cmd.parameters !== "object") return { valid: false, message: "Invalid parameters" };
  const groups = REQUIRED[up] || [];
  for (const group of groups) {
    if (!group.some((k) => (cmd.parameters as Record<string, unknown>)[k] != null && (cmd.parameters as Record<string, unknown>)[k] !== "")) {
      return { valid: false, message: `Command ${up} missing ${group.join("/")}` };
    }
  }
  if (up === "RESIZE_ROOM") {
    const p = cmd.parameters as Record<string, unknown>;
    if (!["width", "height", "widthDelta", "heightDelta", "width_delta", "height_delta", "w", "h"].some((k) => k in p)) {
      return { valid: false, message: "RESIZE_ROOM needs width/height or widthDelta/heightDelta" };
    }
  }
  return { valid: true };
}

export function validateCommands(cmds: AICommand[]): { valid: AICommand[]; errors: string[] } {
  const valid: AICommand[] = [];
  const errors: string[] = [];
  if (!Array.isArray(cmds)) return { valid: [], errors: ["Commands must be array"] };
  for (let i = 0; i < cmds.length; i++) {
    const r = validateCommand(cmds[i]);
    if (r.valid) valid.push({ ...cmds[i], type: cmds[i].type.toUpperCase() as AICommand["type"] });
    else errors.push(`Command ${i}: ${r.message}`);
  }
  const deletes = valid.filter((c) => c.type.startsWith("DELETE_")).length;
  if (deletes > 5) errors.push(`Bulk delete of ${deletes} items rejected - requires confirmation`);
  return { valid, errors };
}
