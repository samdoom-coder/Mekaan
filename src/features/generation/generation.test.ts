import { describe, it, expect, beforeEach } from "vitest";
import { defaultRequest, type DesignGenerationRequest } from "./generationTypes";
import { localGenerate } from "./localPlanner";
import { useDesignStore } from "../../stores/designStore";
import { createDemoDesign } from "../../utils/demoData";
import { ALLOWED_COMMANDS } from "../ai/commands/commandTypes";

function req(seed = 1): DesignGenerationRequest {
  return { ...defaultRequest(), seed };
}

function noOverlaps(rooms: Array<{ x: number; y: number; width: number; height: number }>) {
  for (let i = 0; i < rooms.length; i++) {
    for (let j = i + 1; j < rooms.length; j++) {
      const a = rooms[i], b = rooms[j];
      const overlap = !(a.x + a.width <= b.x || a.x >= b.x + b.width || a.y + a.height <= b.y || a.y >= b.y + b.height);
      if (overlap) return false;
    }
  }
  return true;
}

type R = { name: string; x: number; y: number; width: number; height: number };

function contacts(rooms: R[], plotW: number, plotH: number): Map<string, number> {
  const out = new Map<string, number>(rooms.map((r) => [r.name, 0]));
  const tol = 0.51;
  const shared = (a: R, b: R): number => {
    let t = 0;
    if (Math.abs(a.x + a.width - b.x) <= tol || Math.abs(b.x + b.width - a.x) <= tol) {
      t += Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
    }
    if (Math.abs(a.y + a.height - b.y) <= tol || Math.abs(b.y + b.height - a.y) <= tol) {
      t += Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
    }
    return t;
  };
  for (let i = 0; i < rooms.length; i++) {
    for (let j = i + 1; j < rooms.length; j++) {
      const s = shared(rooms[i], rooms[j]);
      if (s >= 1) {
        out.set(rooms[i].name, (out.get(rooms[i].name) || 0) + s);
        out.set(rooms[j].name, (out.get(rooms[j].name) || 0) + s);
      }
    }
  }
  for (const r of rooms) {
    let border = 0;
    if (r.x <= tol) border += r.height;
    if (r.x + r.width >= plotW - tol) border += r.height;
    if (r.y <= tol) border += r.width;
    if (r.y + r.height >= plotH - tol) border += r.width;
    out.set(r.name, (out.get(r.name) || 0) + border);
  }
  return out;
}

describe("Phase 3 generation (frontend fallback planner)", () => {
  it("generates a valid 3-bedroom layout on 40x60", () => {
    const res = localGenerate(req(1));
    expect(res.success).toBe(true);
    expect(res.rooms!.length).toBeGreaterThanOrEqual(7);
    for (const r of res.rooms!) {
      expect(r.x).toBeGreaterThanOrEqual(0);
      expect(r.y).toBeGreaterThanOrEqual(0);
      expect(r.x + r.width).toBeLessThanOrEqual(40 + 1e-6);
      expect(r.y + r.height).toBeLessThanOrEqual(60 + 1e-6);
      expect(r.width).toBeGreaterThanOrEqual(4);
      expect(r.height).toBeGreaterThanOrEqual(4);
    }
    expect(noOverlaps(res.rooms!)).toBe(true);
  });

  it("handles small and large plots", () => {
    // small plot gets a fitting program (a full 8-room program cannot fit 20x30)
    const small: DesignGenerationRequest = {
      ...req(5),
      plot: { width: 20, depth: 30, unit: "ft" },
      rooms: [
        { type: "living-room", name: "Living Room", count: 1, preferredWidth: 12, preferredHeight: 10, required: true },
        { type: "kitchen", name: "Kitchen", count: 1, preferredWidth: 8, preferredHeight: 9, required: true },
        { type: "bedroom", name: "Bedroom", count: 1, preferredWidth: 10, preferredHeight: 10, required: true },
        { type: "bathroom", name: "Bathroom", count: 1, preferredWidth: 5, preferredHeight: 6, required: true },
      ],
    };
    const large: DesignGenerationRequest = { ...req(5), plot: { width: 60, depth: 100, unit: "ft" } };
    for (const r of [small, large]) {
      const res = localGenerate(r);
      const w = r.plot.width, d = r.plot.depth;
      expect(res.success).toBe(true);
      expect(noOverlaps(res.rooms!)).toBe(true);
      for (const room of res.rooms!) {
        expect(room.x + room.width).toBeLessThanOrEqual(w + 1e-6);
        expect(room.y + room.height).toBeLessThanOrEqual(d + 1e-6);
      }
    }
  });

  it("respects preferred dimensions when they fit", () => {
    const r = req(2);
    r.rooms = [{ type: "bedroom", name: "B1", count: 1, preferredWidth: 14, preferredHeight: 13, required: true }];
    const res = localGenerate(r);
    // preferred dims are the starting size; void-filling may grow the room
    // into empty space but never beyond 2x area and never below preferred
    expect(res.rooms![0].width).toBeGreaterThanOrEqual(14);
    expect(res.rooms![0].height).toBeGreaterThanOrEqual(13);
    expect(res.rooms![0].width * res.rooms![0].height).toBeLessThanOrEqual(14 * 13 * 2 + 1e-6);
  });

  it("different seeds produce different valid layouts", () => {
    const a = localGenerate(req(1));
    const b = localGenerate(req(2));
    expect(a.success && b.success).toBe(true);
    expect(noOverlaps(a.rooms!) && noOverlaps(b.rooms!)).toBe(true);
    expect(JSON.stringify(a.rooms)).not.toBe(JSON.stringify(b.rooms));
  });

  it("returns multiple selectable options", () => {
    const res = localGenerate({ ...req(3), count: 3 });
    expect(res.success).toBe(true);
    expect(res.options!.length).toBe(3);
    expect(res.options!.map((o) => o.label)).toEqual(["A", "B", "C"]);
    for (const o of res.options!) {
      expect(noOverlaps(o.rooms)).toBe(true);
      expect(o.roomCount).toBe(o.rooms.length);
      expect(o.totalArea).toBeGreaterThan(0);
    }
  });

  it("fills most of the footprint", () => {
    const res = localGenerate(req(1));
    const area = res.rooms!.reduce((s, r) => s + r.width * r.height, 0);
    expect(area / (40 * 60)).toBeGreaterThan(0.6);
  });

  it("commands only use the existing command system", () => {
    const res = localGenerate(req(4));
    expect(res.commands!.length).toBeGreaterThan(0);
    for (const c of res.commands!) {
      expect(ALLOWED_COMMANDS.has(c.type)).toBe(true);
    }
    expect(res.commands!.some((c) => c.type === "CREATE_ROOM")).toBe(true);
    expect(res.commands!.some((c) => c.type === "CREATE_WALL")).toBe(true);
  });

  it("rooms share walls — small rooms never float", () => {
    const res = localGenerate(req(1));
    expect(res.success).toBe(true);
    const c = contacts(res.rooms as R[], 40, 60);
    const floating = (res.rooms as R[]).filter((r) => (c.get(r.name) || 0) < 1);
    expect(floating.map((r) => r.name)).toEqual([]);
  });

  it("reports assumptions and warnings, never raw code", () => {
    const res = localGenerate(req(1));
    expect(res.assumptions!.length).toBeGreaterThan(0);
    expect(res.warnings.length).toBeGreaterThan(0);
    const blob = JSON.stringify(res);
    expect(blob).not.toMatch(/<svg/i);
    expect(blob).not.toMatch(/javascript:/i);
  });
});

describe("Phase 3 history (one undoable transaction)", () => {
  beforeEach(() => {
    useDesignStore.setState({ design: null, past: [], future: [] });
  });

  it("generate -> apply -> undo removes the entire generated design", () => {
    const before = createDemoDesign();
    useDesignStore.getState().setDesign(before);
    const beforeCount = useDesignStore.getState().design!.floors[0].rooms.length;
    expect(beforeCount).toBeGreaterThan(0);

    const res = localGenerate(req(9));
    const pastLen = useDesignStore.getState().past.length;
    useDesignStore.getState().applyGeneratedDesign(res.design!);

    // exactly one history entry for the whole generation
    expect(useDesignStore.getState().past.length).toBe(pastLen + 1);
    expect(useDesignStore.getState().design!.floors[0].rooms.length).toBe(res.rooms!.length);

    useDesignStore.getState().undo();
    expect(useDesignStore.getState().design!.floors[0].rooms.length).toBe(beforeCount);

    useDesignStore.getState().redo();
    expect(useDesignStore.getState().design!.floors[0].rooms.length).toBe(res.rooms!.length);
  });
});
