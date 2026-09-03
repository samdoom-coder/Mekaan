import { create } from "zustand";
import type {
  DesignGenerationRequest,
  GenerationResult,
  GenerationStatus,
} from "./generationTypes";
import { defaultRequest } from "./generationTypes";
import { generateFloorPlan } from "./generationApi";

/** Isolated generation store — never pollutes the core design store (spec #35). */
interface GenerationStore {
  open: boolean;
  step: number;
  request: DesignGenerationRequest;
  status: GenerationStatus;
  result: GenerationResult | null;
  error: string | null;
  offline: boolean;
  generationId?: string;
  selected: number;

  setOpen: (v: boolean) => void;
  setStep: (n: number) => void;
  selectOption: (i: number) => void;
  updateRequest: (patch: Partial<DesignGenerationRequest>) => void;
  resetRequest: () => void;
  setRequest: (r: DesignGenerationRequest) => void;

  generate: () => Promise<void>;
  regenerate: () => Promise<void>;
  cancel: () => void;
  discard: () => void;
}

let aborter: AbortController | null = null;

export const useGenerationStore = create<GenerationStore>((set, get) => ({
  open: false,
  step: 0,
  request: defaultRequest(),
  status: "idle",
  result: null,
  error: null,
  offline: false,
  selected: 0,

  setOpen: (open) => {
    if (open) set({ open: true, status: get().result ? get().status : "idle", error: null });
    else {
      get().cancel();
      set({ open: false });
    }
  },
  setStep: (step) => set({ step }),
  selectOption: (selected) => set({ selected }),
  updateRequest: (patch) => set({ request: { ...get().request, ...patch } }),
  resetRequest: () => set({ request: defaultRequest(), result: null, status: "idle", error: null }),
  setRequest: (request) => set({ request }),

  generate: async () => {
    get().cancel();
    aborter = new AbortController();
    set({ status: "understanding", error: null, result: null });
    const stageMap: Record<string, GenerationStatus> = {
      understanding: "understanding",
      planning: "planning",
      layout: "layout",
      validating: "validating",
      repairing: "repairing",
    };
    try {
      const { result, offline } = await generateFloorPlan(
        get().request,
        aborter.signal,
        (stage) => {
          const s = stageMap[stage];
          if (s && get().status !== "ready" && get().status !== "failed") set({ status: s });
        },
      );
      if (!result.success) {
        set({
          status: "failed",
          error: result.message || "Generation failed",
          result,
          generationId: result.generationId,
          offline,
        });
        return;
      }
      set({ status: "ready", result, error: null, generationId: result.generationId, offline, selected: 0 });
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        set({ status: "idle", error: "Generation cancelled." });
        return;
      }
      set({ status: "failed", error: e instanceof Error ? e.message : String(e) });
    } finally {
      aborter = null;
    }
  },

  regenerate: async () => {
    const req = get().request;
    const nextSeed = (req.seed ?? 0) + 1;
    // different seed => meaningfully different valid arrangement (spec #25)
    set({ request: { ...req, seed: nextSeed } });
    await get().generate();
  },

  cancel: () => {
    try { aborter?.abort(); } catch { /* noop */ }
    aborter = null;
  },

  discard: () => {
    get().cancel();
    set({ status: "idle", result: null, error: null });
  },
}));
