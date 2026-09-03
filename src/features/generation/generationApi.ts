import type { DesignGenerationRequest, GenerationResult } from "./generationTypes";
import { localGenerate } from "./localPlanner";

export async function generateFloorPlan(
  req: DesignGenerationRequest,
  signal?: AbortSignal,
  onStage?: (stage: string) => void,
): Promise<{ result: GenerationResult; offline: boolean }> {
  const payload = {
    projectId: req.projectId,
    plot: req.plot,
    floors: req.floors,
    rooms: req.rooms,
    relationships: req.relationships,
    preferences: req.preferences,
    brief: req.brief,
    seed: req.seed,
    count: req.count ?? 3,
  };
  const endpoints = ["/api/ai/generate", "/ai/generate"];
  let lastError = "";
  // staged progress mapping to real pipeline phases
  const stages: Array<[string, number]> = [
    ["understanding", 250],
    ["planning", 600],
    ["layout", 900],
    ["validating", 1200],
  ];
  let stageIdx = 0;
  const advance = () => {
    if (onStage && stageIdx < stages.length) onStage(stages[stageIdx][0]);
    stageIdx++;
  };
  advance();
  const timer = setInterval(advance, 450);

  try {
    for (const ep of endpoints) {
      try {
        const resp = await fetch(ep, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal,
        });
        if (!resp.ok) {
          const txt = await resp.text().catch(() => "");
          // 422 from pydantic or success:false with suggestions — surface it
          try {
            const data = JSON.parse(txt);
            if (data && (data.success === false || data.detail)) {
              clearInterval(timer);
              if (data.success === false) return { result: data as GenerationResult, offline: false };
              throw new Error(typeof data.detail === "string" ? data.detail : JSON.stringify(data.detail).slice(0, 400));
            }
          } catch (e) {
            if (e instanceof Error && !(e instanceof SyntaxError)) throw e;
          }
          lastError = `${resp.status} ${txt.slice(0, 300)}`;
          continue;
        }
        const data = (await resp.json()) as GenerationResult;
        clearInterval(timer);
        onStage?.("validating");
        return { result: data, offline: false };
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") {
          clearInterval(timer);
          throw e;
        }
        lastError = e instanceof Error ? e.message : String(e);
        continue;
      }
    }
    throw new Error(lastError || "Backend unreachable");
  } catch (e) {
    clearInterval(timer);
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    // offline fallback — local deterministic planner so UX still works
    if (String(lastError).includes("Failed to fetch") || lastError.includes("fetch") || lastError.includes("Backend unreachable") || lastError.includes("NetworkError")) {
      onStage?.("layout");
      await new Promise((r) => setTimeout(r, 350));
      onStage?.("validating");
      await new Promise((r) => setTimeout(r, 250));
      return { result: localGenerate(req), offline: true };
    }
    throw e instanceof Error ? e : new Error(String(e));
  }
}
