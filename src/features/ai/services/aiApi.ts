import type { AICommandResponse } from "../commands/commandTypes";
import type { Design } from "../../../types/design";

export interface AIHistoryEntry {
  role: "user" | "assistant";
  content: string;
}

const history: AIHistoryEntry[] = [];

export function getAIHistory() {
  return [...history];
}
export function pushAIHistory(entry: AIHistoryEntry) {
  history.push(entry);
  if (history.length > 10) history.splice(0, history.length - 10);
}
export function clearAIHistory() {
  history.length = 0;
}

export async function fetchAICommands(prompt: string, design: Design, floorId?: string): Promise<AICommandResponse> {
  const payload = {
    prompt,
    projectId: design.id,
    floorId: floorId || design.floors[0]?.id,
    // send minimal design for backend to build context - but backend also builds compact itself
    // we send design for case where backend has no DB entry yet (local demo)
    design,
    history: getAIHistory(),
  };

  // Try POST /api/ai/commands then fallback to /ai/commands
  const endpoints = ["/api/ai/commands", "/ai/commands"];
  let lastError: string | null = null;
  for (const ep of endpoints) {
    try {
      const resp = await fetch(ep, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!resp.ok) {
        const txt = await resp.text().catch(() => "");
        lastError = `${resp.status} ${txt.slice(0, 200)}`;
        continue;
      }
      const data = await resp.json();
      // normalize: backend may return {message, commands, errors}
      const commands = (data.commands || []).map((c: { type: string; parameters: Record<string, unknown>; id?: string }) => ({
        type: c.type?.toUpperCase(),
        parameters: c.parameters || {},
        id: c.id,
      }));
      return {
        message: data.message || "",
        commands,
        errors: data.errors || undefined,
        provider_error: data.provider_error || undefined,
        context: data.context,
      };
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
      continue;
    }
  }
  throw new Error(lastError || "Failed to fetch AI commands");
}

// Also export a mock fallback for offline testing (mirrors backend MockProvider behavior when backend unreachable)
export async function fetchAICommandsWithFallback(prompt: string, design: Design, floorId?: string): Promise<AICommandResponse> {
  try {
    return await fetchAICommands(prompt, design, floorId);
  } catch {
    // import local mock via dynamic - but we can just return friendly error
    return {
      message: "AI backend unreachable. Check that backend is running (uvicorn). Using local mock is not implemented - please start backend.",
      commands: [],
      errors: ["backend_unreachable"],
    };
  }
}
