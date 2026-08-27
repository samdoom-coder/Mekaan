import type { DesignCommand } from "../types/design";
import type { Design, Floor, Room, Wall } from "../types/design";

export type CommandResult = { success: true; message?: string } | { success: false; error: string };

export function validateCommand(cmd: DesignCommand): CommandResult {
  if (!cmd.type || typeof cmd.type !== "string") return { success: false, error: "Invalid command type" };
  if (!cmd.parameters || typeof cmd.parameters !== "object") return { success: false, error: "Invalid parameters" };
  return { success: true };
}

// Mock AI -> DesignCommand[] translation (future AI will generate these)
export function mockAICommands(prompt: string): DesignCommand[] {
  const lower = prompt.toLowerCase();
  if (lower.includes("kitchen") && lower.includes("larger")) {
    return [{ type: "resize_room", parameters: { roomType: "kitchen", widthDelta: 2 } }];
  }
  if (lower.includes("bathroom")) {
    return [{ type: "add_room", parameters: { roomType: "bathroom", near: "master-bedroom" } }];
  }
  if (lower.includes("window")) {
    return [{ type: "add_window", parameters: { roomType: "living-room" } }];
  }
  return [];
}

// Executor: takes design and applies commands sequentially through constraint-checked operations
// For now we provide a simple executor that mutates a draft floor; real implementation would go through designStore operations
export function executeCommand(design: Design, cmd: DesignCommand): CommandResult {
  const valid = validateCommand(cmd);
  if (!valid.success) return valid;

  // This is a placeholder that shows architecture. Actual execution is done in stores/designStore via operations.
  // We return success to indicate command was validated and queued.
  const floor: Floor | undefined = design.floors[0];
  if (!floor) return { success: false, error: "No floor available" };

  switch (cmd.type) {
    case "create_room": {
      const t = cmd.parameters.roomType as string;
      if (!t) return { success: false, error: "Missing roomType" };
      return { success: true, message: `Would create room type ${t}` };
    }
    case "resize_room": {
      return { success: true, message: "Would resize room" };
    }
    case "add_room": {
      return { success: true };
    }
    case "add_window": {
      return { success: true };
    }
    case "move_room": {
      return { success: true };
    }
    default:
      return { success: false, error: `Unknown command ${cmd.type}` };
  }
}

// Flow: Natural Language -> AI Service -> DesignCommand[] -> Validator -> Constraint Engine -> Operation -> Design State -> Renderer
export async function processNaturalLanguage(prompt: string, design: Design): Promise<{ commands: DesignCommand[]; results: CommandResult[] }> {
  // Mock AI service delay
  await new Promise(r => setTimeout(r, 300));
  const commands = mockAICommands(prompt);
  const results = commands.map(c => executeCommand(design, c));
  return { commands, results };
}
