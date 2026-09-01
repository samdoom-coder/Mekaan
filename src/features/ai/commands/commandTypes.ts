export type AICommandType =
  | "CREATE_ROOM"
  | "DELETE_ROOM"
  | "MOVE_ROOM"
  | "RESIZE_ROOM"
  | "CREATE_WALL"
  | "DELETE_WALL"
  | "CREATE_DOOR"
  | "DELETE_DOOR"
  | "CREATE_WINDOW"
  | "DELETE_WINDOW"
  | "MOVE_OBJECT"
  | "RESIZE_OBJECT";

export const ALLOWED_COMMANDS: ReadonlySet<string> = new Set([
  "CREATE_ROOM",
  "DELETE_ROOM",
  "MOVE_ROOM",
  "RESIZE_ROOM",
  "CREATE_WALL",
  "DELETE_WALL",
  "CREATE_DOOR",
  "DELETE_DOOR",
  "CREATE_WINDOW",
  "DELETE_WINDOW",
  "MOVE_OBJECT",
  "RESIZE_OBJECT",
]);

export interface AICommand {
  id?: string;
  type: AICommandType;
  parameters: Record<string, unknown>;
}

export interface AICommandResponse {
  message: string;
  commands: AICommand[];
  errors?: string[];
  provider_error?: string;
  context?: unknown;
}

export interface AIProvider {
  generateCommands(prompt: string, context: unknown): Promise<AICommandResponse>;
}
