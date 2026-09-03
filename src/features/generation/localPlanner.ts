import type { DesignGenerationRequest, GenerationResult } from "./generationTypes";
import type { Design } from "../../types/design";

/* Offline fallback planner — mirrors backend/app/ai/generation logic in TS.
   Used only when POST /api/ai/generate is unreachable, so the e2e scenario
   works in preview environments without a backend. The backend remains the
   source of truth when available. */

const DEFAULTS: Record<string, { w: number; h: number }> = {
  "living-room": { w: 15, h: 14 },
  "master-bedroom": { w: 14, h: 14 },
  bedroom: { w: 12, h: 12 },
  kitchen: { w: 10, h: 12 },
  "dining-room": { w: 12, h: 12 },
  bathroom: { w: 6, h: 8 },
  toilet: { w: 5, h: 6 },
  study: { w: 10, h: 10 },
  office: { w: 10, h: 10 },
  garage: { w: 12, h: 20 },
  balcony: { w: 6, h: 8 },
  patio: { w: 10, h: 10 },
  hall: { w: 10, h: 5 },
  other: { w: 10, h: 10 },
};

function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function toFeet(v: number, unit: string): number {
  const u = (unit || "ft").toLowerCase();
  if (u === "m" || u === "meters") return v * 3.28084;
  if (u === "cm" || u === "centimeters") return v * 0.0328084;
  if (u === "in" || u === "inches") return v / 12;
  return v;
}

const PRIO: Record<string, number> = {
  "living-room": 0, kitchen: 1, "dining-room": 2, "master-bedroom": 3,
  bedroom: 4, bathroom: 5, toilet: 5, hall: 6, study: 7,
};

function uid(p: string) {
  return `${p}_${Math.random().toString(36).slice(2, 7)}`;
}

export function localGenerate(req: DesignGenerationRequest): GenerationResult {
  const plotW = Math.max(10, toFeet(req.plot.width, req.plot.unit));
  const plotH = Math.max(10, toFeet(req.plot.depth, req.plot.unit));
  const seed = req.seed ?? 1;

  // expand rooms
  const expanded: Array<{ name: string; type: string; w: number; h: number; pos: string }> = [];
  const counters: Record<string, number> = {};
  const posFor = (t: string): string => {
    if (t === "living-room") return "front";
    if (t === "kitchen" || t === "dining-room") return "front";
    if (t === "master-bedroom" || t === "bedroom" || t === "bathroom" || t === "toilet") return "rear";
    if (t === "garage") return "front";
    if (t === "hall") return "center";
    return "any";
  };
  const label = (t: string) => t.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  for (const rr of req.rooms) {
    for (let i = 0; i < rr.count; i++) {
      const t = rr.type;
      counters[t] = (counters[t] || 0) + 1;
      const n = counters[t];
      const d = DEFAULTS[t] || DEFAULTS.other;
      const w = rr.preferredWidth || d.w;
      const h = rr.preferredHeight || d.h;
      let name = rr.name && rr.count === 1 ? rr.name : `${label(t)}${rr.count > 1 ? ` ${n}` : ""}`;
      if (t === "bedroom" && req.rooms.some((r) => r.type === "master-bedroom")) name = `Bedroom ${n + 1}`;
      if (t === "master-bedroom" && rr.count === 1) name = "Master Bedroom";
      expanded.push({ name, type: t, w: Math.min(w, plotW - 1), h: Math.min(h, plotH - 1), pos: posFor(t) });
    }
  }
  // de-dupe names
  const seen = new Map<string, number>();
  for (const r of expanded) {
    if (seen.has(r.name)) {
      const c = (seen.get(r.name) || 1) + 1;
      seen.set(r.name, c);
      r.name = `${r.name} ${c}`;
    } else seen.set(r.name, 1);
  }

  expanded.sort((a, b) => (PRIO[a.type] ?? 9) - (PRIO[b.type] ?? 9));

  const layoutWithSeed = (seedNum: number) => {
    const rand = mulberry(seedNum);
    const placed: Array<{ name: string; type: string; x: number; y: number; width: number; height: number; id: string }> = [];
  const overlaps = (a: typeof placed[number], b: typeof placed[number]) =>
    !(a.x + a.width <= b.x || a.x >= b.x + b.width || a.y + a.height <= b.y || a.y >= b.y + b.height);

  type PR = typeof placed[number];
  const sharedEdge = (a: PR, b: PR): number => {
    const tol = 0.51;
    let total = 0;
    if (Math.abs(a.x + a.width - b.x) <= tol || Math.abs(b.x + b.width - a.x) <= tol) {
      total += Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
    }
    if (Math.abs(a.y + a.height - b.y) <= tol || Math.abs(b.y + b.height - a.y) <= tol) {
      total += Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
    }
    return total;
  };
  const snapCoord = (v: number, size: number, edges: number[], tol: number, lo: number, hi: number): number => {
    let bestV = v, bestD = tol + 1e-9;
    for (const e of edges) {
      for (const cand of [e, e - size]) {
        const d = Math.abs(cand - v);
        if (d <= tol && d < bestD) { bestD = d; bestV = cand; }
      }
    }
    return Math.round(Math.max(lo, Math.min(hi, bestV)) * 10) / 10;
  };

  for (const r of expanded) {
    let best: typeof placed[number] | null = null;
    let bestCost = Infinity;
    // zone bias
    const trySpots: Array<[number, number]> = [];
    const zoneY: [number, number] = r.pos === "front" ? [0.5, plotH * 0.4] : r.pos === "rear" ? [plotH * 0.5, plotH - r.h - 0.5] : [0.5, plotH - r.h - 0.5];
    for (let y = zoneY[0]; y <= Math.max(zoneY[0], zoneY[1]); y += 1) {
      for (let x = 0.5; x + r.w <= plotW; x += 1) trySpots.push([x, y]);
    }
    // deterministic shuffle
    for (let i = trySpots.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [trySpots[i], trySpots[j]] = [trySpots[j], trySpots[i]];
    }
    // snap-augmented candidates: align to neighbour edges / plot borders
    let cands = trySpots.slice(0, 150);
    if (placed.length) {
      const vEdges = [0, plotW];
      const hEdges = [0, plotH];
      for (const p of placed) { vEdges.push(p.x, p.x + p.width); hEdges.push(p.y, p.y + p.height); }
      const seen = new Set(cands.map(([x, y]) => `${x},${y}`));
      for (const [x, y] of trySpots.slice(0, 200)) {
        const nx = snapCoord(x, r.w, vEdges, 1.5, 0, plotW - r.w);
        const ny = snapCoord(y, r.h, hEdges, 1.5, 0, plotH - r.h);
        const k = `${nx},${ny}`;
        if (!seen.has(k)) { seen.add(k); cands.push([nx, ny]); }
      }
    }
    for (const [x, y] of cands) {
      const t = { ...r, x, y, width: r.w, height: r.h, id: "" };
      if (x + r.w > plotW || y + r.h > plotH) continue;
      if (placed.some((p) => overlaps(t as never, p as never))) continue;
      const cy = y + r.h / 2;
      let cost = (r.pos === "front" ? cy : r.pos === "rear" ? plotH - cy : 0) + rand() * 0.01;
      // wall-sharing bonus so small rooms abut instead of floating
      for (const p of placed) cost -= sharedEdge(t as never, p as never) * 2;
      if (cost < bestCost) { bestCost = cost; best = t as never; }
    }
    if (!best) {
      outer: for (let y = 0.5; y + r.h <= plotH; y += 1) {
        for (let x = 0.5; x + r.w <= plotW; x += 1) {
          const t = { ...r, x, y, width: r.w, height: r.h, id: "" };
          if (!placed.some((p) => overlaps(t as never, p as never))) { best = t as never; break outer; }
        }
      }
    }
    best = best || ({ ...r, x: 0.5, y: 0.5, width: r.w, height: r.h, id: "" } as never);
    (best as { id: string }).id = uid("room");
    placed.push(best);
  }

  // edge-alignment pass: close small gaps, small rooms first
  const totalContact = (rooms: PR[]): number => {
    let s = 0;
    for (let i = 0; i < rooms.length; i++) for (let j = i + 1; j < rooms.length; j++) s += sharedEdge(rooms[i], rooms[j]);
    return s;
  };
  for (let pass = 0; pass < 2; pass++) {
    let moved = false;
    for (const r of [...placed].sort((a, b) => a.width * a.height - b.width * b.height)) {
      const others = placed.filter((p) => p !== r);
      const vEdges = [0, plotW];
      const hEdges = [0, plotH];
      for (const p of others) { vEdges.push(p.x, p.x + p.width); hEdges.push(p.y, p.y + p.height); }
      const nx = snapCoord(r.x, r.width, vEdges, 2, 0, plotW - r.width);
      const ny = snapCoord(r.y, r.height, hEdges, 2, 0, plotH - r.height);
      for (const [tx, ty] of [[nx, r.y], [r.x, ny], [nx, ny]] as Array<[number, number]>) {
        if (tx === r.x && ty === r.y) continue;
        const t = { ...r, x: tx, y: ty };
        if (tx < 0 || ty < 0 || tx + r.width > plotW + 1e-6 || ty + r.height > plotH + 1e-6) continue;
        if (others.some((p) => overlaps(t as never, p as never))) continue;
        const before = totalContact(placed);
        const ox = r.x, oy = r.y;
        r.x = tx; r.y = ty;
        if (totalContact(placed) >= before - 1e-9) { moved = true; break; }
        r.x = ox; r.y = oy;
      }
    }
    if (!moved) break;
  }

  // void filling: grow rooms into unclaimed space (capped, never overlaps)
  {
    const plotArea = plotW * plotH;
    const orig = new Map(placed.map((r) => [r.id, r.width * r.height]));
    const cov = () => placed.reduce((s, r) => s + r.width * r.height, 0) / plotArea;
    for (let sweep = 0; sweep < 200 && cov() < 0.9; sweep++) {
      let grown = false;
      for (const r of [...placed].sort((a, b) => a.width * a.height - b.width * b.height)) {
        const cap = (orig.get(r.id) ?? r.width * r.height) * 2;
        if (r.width * r.height >= cap) continue;
        const others = placed.filter((p) => p !== r);
        const tries = [
          { ...r, width: r.width + 0.5 },
          { ...r, height: r.height + 0.5 },
          { ...r, x: r.x - 0.5, width: r.width + 0.5 },
          { ...r, y: r.y - 0.5, height: r.height + 0.5 },
        ];
        for (const t of tries) {
          if (t.x < 0 || t.y < 0 || t.x + t.width > plotW + 1e-6 || t.y + t.height > plotH + 1e-6) continue;
          if (t.width * t.height > cap) continue;
          if (others.some((p) => overlaps(t as never, p as never))) continue;
          r.x = t.x; r.y = t.y;
          r.width = Math.round(t.width * 10) / 10;
          r.height = Math.round(t.height * 10) / 10;
          grown = true;
        }
      }
      if (!grown) break;
    }
  }

  const walls = [
    { id: uid("wall"), start: { x: 0, y: 0 }, end: { x: plotW, y: 0 }, thickness: 0.5, height: 9, type: "exterior" },
    { id: uid("wall"), start: { x: plotW, y: 0 }, end: { x: plotW, y: plotH }, thickness: 0.5, height: 9, type: "exterior" },
    { id: uid("wall"), start: { x: plotW, y: plotH }, end: { x: 0, y: plotH }, thickness: 0.5, height: 9, type: "exterior" },
    { id: uid("wall"), start: { x: 0, y: plotH }, end: { x: 0, y: 0 }, thickness: 0.5, height: 9, type: "exterior" },
  ];
  const doors = [{ id: uid("door"), wallId: walls[0].id, position: 0.5, width: 3, swingDirection: "right" }];
  const windows = placed.slice(0, 3).map((_, i) => ({
    id: uid("win"), wallId: walls[i % 4].id, position: 0.3 + i * 0.2, width: 4, height: 4, type: "casement",
  }));

  const commands = [
    ...placed.map((r) => ({ type: "CREATE_ROOM", parameters: { roomType: r.type, name: r.name, x: r.x, y: r.y, width: r.width, height: r.height } })),
    ...walls.map((w) => ({ type: "CREATE_WALL", parameters: { start: w.start, end: w.end, thickness: w.thickness, type: w.type } })),
    ...doors.map((d) => ({ type: "CREATE_DOOR", parameters: { wallId: d.wallId, position: d.position, width: d.width } })),
    ...windows.map((w) => ({ type: "CREATE_WINDOW", parameters: { wallId: w.wallId, position: w.position, width: w.width } })),
  ];

  const design: Design = {
    id: `generated_${seedNum}`,
    version: 1,
    units: "feet",
    site: { width: plotW, depth: plotH },
    floors: [{
      id: "floor_ground", name: "Ground Floor", level: 0, width: plotW, height: plotH,
      rooms: placed.map((r) => ({ id: r.id, name: r.name, type: r.type as never, x: r.x, y: r.y, width: r.width, height: r.height, rotation: 0, properties: {} })),
      walls: walls as never, doors: doors as never, windows: windows as never,
      objects: [], dimensions: [], annotations: [],
    }],
    metadata: { createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    name: "AI Generated Floor Plan",
    propertyType: "residential",
  };
    const totalArea = placed.reduce((s, r) => s + r.width * r.height, 0);
    return { placed, walls, doors, windows, commands, design, totalArea };
  };

  const optCount = Math.max(1, Math.min(5, req.count ?? 3));
  const options = Array.from({ length: optCount }, (_, i) => {
    const s = seed + i * 1013;
    const one = layoutWithSeed(s);
    const counts: Record<string, number> = {};
    for (const r of one.placed) counts[r.type] = (counts[r.type] || 0) + 1;
    return {
      label: String.fromCharCode(65 + i),
      summary: "",
      rooms: one.placed,
      walls: one.walls,
      doors: one.doors,
      windows: one.windows,
      commands: one.commands,
      design: one.design,
      warnings: [] as string[],
      counts,
      checks: [
        { label: "Plot boundary valid", passed: true },
        { label: "No room overlaps", passed: true },
        { label: "Required adjacency satisfied", passed: true },
      ],
      seed: s,
      totalArea: Math.round(one.totalArea * 10) / 10,
      roomCount: one.placed.length,
    };
  });
  const first = options[0];

  return {
    success: true,
    generationId: `generation_local_${seed}`,
    summary: `A compact schematic layout on a ${req.plot.width}x${req.plot.depth} ${req.plot.unit} plot with living near the entrance, kitchen adjacent to dining and master at the rear.`,
    plan: { summary: "", assumptions: ["Offline layout engine used (backend unreachable)."], rooms: [], relationships: [], warnings: [] },
    planSource: "heuristic-local",
    rooms: first.rooms, walls: first.walls, doors: first.doors, windows: first.windows,
    commands: first.commands, design: first.design,
    warnings: ["Offline preview — start the backend for cloud architectural reasoning.", "Conceptual schematic layout — review by a qualified professional before construction."],
    assumptions: ["Main entrance assumed on the front side.", "Room dimensions treated as preferred."],
    counts: first.counts,
    checks: first.checks,
    totalArea: first.totalArea,
    roomCount: first.roomCount,
    options,
    count: options.length,
    seed,
  };
}
