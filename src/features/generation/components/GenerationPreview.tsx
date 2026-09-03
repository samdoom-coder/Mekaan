import { Check, X, RotateCcw, Pencil, Ban } from "lucide-react";
import type { Door, Room, Wall, Window as Win } from "../../../types/design";
import { useGenerationStore } from "../generationStore";
import type { GenerationOption } from "../generationTypes";
import { useDesignStore } from "../../../stores/designStore";
import { useProjectStore } from "../../../stores/projectStore";
import { useHistoryStore } from "../../../stores/historyStore";
import { useUIStore } from "../../../stores/uiStore";
import { ROOM_TYPE_COLORS } from "../../../utils/demoData";

function fmtFt(v: number): string {
  const r = Math.round(v * 10) / 10;
  return `${Number.isInteger(r) ? r : r.toFixed(1)}'`;
}

/** Professional plan rendering: pastel rooms, thick exterior / thin interior
 *  walls, door gaps with swing arcs, windows as wall breaks. */
function PlanSvg({ opt, detailed }: { opt: GenerationOption; detailed?: boolean }) {
  const floor = opt.design.floors[0];
  const W = floor.width, H = floor.height;
  const wallsById = new Map(floor.walls.map((w) => [w.id, w]));

  const doorGeom = (d: Door) => {
    const w = wallsById.get(d.wallId);
    if (!w) return null;
    const dx = w.end.x - w.start.x, dy = w.end.y - w.start.y;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len, uy = dy / len;
    const cx = w.start.x + dx * d.position, cy = w.start.y + dy * d.position;
    const half = d.width / 2;
    const gx1 = cx - ux * half, gy1 = cy - uy * half;
    const gx2 = cx + ux * half, gy2 = cy + uy * half;
    // leaf swings perpendicular; side from swingDirection
    const s = d.swingDirection === "left" ? -1 : 1;
    const px = -uy * s, py = ux * s;
    const lx = gx1 + px * d.width, ly = gy1 + py * d.width;
    return { gx1, gy1, gx2, gy2, lx, ly, large: 0, sweep: s > 0 ? 1 : 0 };
  };

  return (
    <svg viewBox={`-1.5 -2.5 ${W + 3} ${H + 5}`} className={detailed ? "w-full max-h-[400px]" : "w-full h-full"}>
      {/* plot paper + rooms */}
      <rect x={0} y={0} width={W} height={H} fill="#ffffff" stroke="none" />
      {floor.rooms.map((r: Room) => {
        const fs = Math.max(0.45, Math.min(Math.min(r.width, r.height) / 7, detailed ? 1.0 : 2.2));
        return (
          <g key={r.id}>
            <rect x={r.x} y={r.y} width={r.width} height={r.height} fill={ROOM_TYPE_COLORS[r.type] || "#f5f5f5"} stroke="none" />
            {detailed && (
              <>
                <text x={r.x + r.width / 2} y={r.y + r.height / 2 - 0.25} textAnchor="middle" fontSize={fs} fontWeight={600} fill="#27272a" style={{ fontFamily: "Inter, sans-serif" }}>
                  {r.name}
                </text>
                <text x={r.x + r.width / 2} y={r.y + r.height / 2 + fs * 0.75} textAnchor="middle" fontSize={fs * 0.62} fill="#52525b" style={{ fontFamily: "Inter, sans-serif" }}>
                  {fmtFt(r.width)} × {fmtFt(r.height)}
                </text>
              </>
            )}
          </g>
        );
      })}
      {/* walls: thick dark exterior, thin interior */}
      {floor.walls.map((w: Wall) => {
        const ext = w.type === "exterior";
        return (
          <line
            key={w.id}
            x1={w.start.x} y1={w.start.y} x2={w.end.x} y2={w.end.y}
            stroke={ext ? "#3f3f46" : "#a1a1aa"}
            strokeWidth={ext ? 0.55 : 0.24}
            strokeLinecap="square"
          />
        );
      })}
      {/* windows as paper breaks in the wall */}
      {detailed && floor.windows.map((wn: Win) => {
        const w = wallsById.get(wn.wallId);
        if (!w) return null;
        const dx = w.end.x - w.start.x, dy = w.end.y - w.start.y;
        const len = Math.hypot(dx, dy) || 1;
        const ux = dx / len, uy = dy / len;
        const cx = w.start.x + dx * wn.position, cy = w.start.y + dy * wn.position;
        const half = wn.width / 2;
        return (
          <line
            key={wn.id}
            x1={cx - ux * half} y1={cy - uy * half} x2={cx + ux * half} y2={cy + uy * half}
            stroke="#ffffff" strokeWidth={(w.type === "exterior" ? 0.55 : 0.24) + 0.1}
          />
        );
      })}
      {/* doors: gap + leaf + swing arc */}
      {detailed && floor.doors.map((d: Door) => {
        const g = doorGeom(d);
        if (!g) return null;
        const w = wallsById.get(d.wallId)!;
        return (
          <g key={d.id}>
            <line x1={g.gx1} y1={g.gy1} x2={g.gx2} y2={g.gy2} stroke="#ffffff" strokeWidth={(w.type === "exterior" ? 0.55 : 0.24) + 0.12} />
            <line x1={g.gx1} y1={g.gy1} x2={g.lx} y2={g.ly} stroke="#3f3f46" strokeWidth={0.12} />
            <path d={`M ${g.lx} ${g.ly} A ${d.width} ${d.width} 0 0 ${g.sweep} ${g.gx2} ${g.gy2}`} fill="none" stroke="#71717a" strokeWidth={0.09} strokeDasharray="0.3 0.18" />
          </g>
        );
      })}
    </svg>
  );
}

export default function GenerationPreview() {
  const g = useGenerationStore();
  const result = g.result;

  if (!result?.success) return null;
  const options = result.options && result.options.length ? result.options : [];
  if (!options.length) return null;
  const sel = Math.min(g.selected, options.length - 1);
  const opt = options[sel];
  const floor = opt.design.floors[0];
  const counts = opt.counts || {};
  const countRows = Object.entries(counts).sort((a, b) => b[1] - a[1]);

  const apply = () => {
    // One undoable transaction (spec #21) + new design version (spec #37)
    useDesignStore.getState().applyGeneratedDesign(opt.design);
    try {
      useHistoryStore.getState().addVersion(`AI Generated Layout ${opt.label}`, useDesignStore.getState().design!);
    } catch { /* version history is best-effort */ }
    // keep the project card in sync: generated plot dims/units can differ
    // from the blank project the wizard started from
    try {
      const proj = useProjectStore.getState().getCurrent();
      const d = useDesignStore.getState().design;
      if (proj && d) {
        useProjectStore.getState().updateProject(proj.id, {
          site: { width: d.site.width, depth: d.site.depth },
          units: d.units,
        } as never);
      }
    } catch { /* non-fatal */ }
    useUIStore.getState().pushToast(`Option ${opt.label} applied — one undo removes it`, "success");
    g.setOpen(false);
    g.discard();
    useUIStore.getState().setView("editor");
  };

  return (
    <div className="max-w-3xl mx-auto">
      <div className="text-[11px] uppercase tracking-[0.2em] font-semibold text-zinc-500 text-center">AI generated floor plans</div>
      <h3 className="text-center text-base font-semibold text-white mt-1">{result.summary}</h3>

      {/* option picker */}
      {options.length > 1 && (
        <div className="mt-4 flex justify-center gap-2.5">
          {options.map((o, i) => (
            <button
              key={o.label}
              onClick={() => g.selectOption(i)}
              className={`w-[86px] rounded-xl overflow-hidden border-2 transition-colors ${i === sel ? "border-white" : "border-zinc-700 hover:border-zinc-500"}`}
            >
              <div className="h-[64px] bg-[#fdfbf7]">
                <PlanSvg opt={o} />
              </div>
              <div className={`py-1 text-center text-[11px] font-bold ${i === sel ? "bg-white text-zinc-900" : "bg-zinc-800 text-zinc-400"}`}>
                {o.label} • {o.roomCount}
              </div>
            </button>
          ))}
        </div>
      )}

      <div className="mt-4 bg-[#fdfbf7] rounded-xl overflow-hidden border border-zinc-700">
        <PlanSvg opt={opt} detailed />
      </div>

      {/* totals bar like professional pickers */}
      <div className="mt-2 text-center text-xs text-zinc-400">
        Total <span className="text-white font-semibold">{Math.round(opt.totalArea || 0).toLocaleString()} ft²</span>
        <span className="mx-2 text-zinc-700">|</span>
        <span className="text-white font-semibold">{opt.roomCount} Rooms</span>
        <span className="mx-2 text-zinc-700">|</span>
        Option {opt.label} • Seed {opt.seed}
      </div>

      <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-zinc-800/40 border border-zinc-700/60 rounded-xl p-4">
          <div className="text-[11px] uppercase tracking-widest font-semibold text-zinc-500 mb-2">Program — option {opt.label}</div>
          <div className="space-y-1">
            {countRows.map(([t, n]: [string, number]) => (
              <div key={t} className="flex justify-between text-xs"><span className="text-zinc-400 capitalize">{t.replace(/-/g, " ")}</span><span className="text-white font-medium">{n}</span></div>
            ))}
          </div>
          <div className="mt-3 space-y-1">
            {(opt.checks || []).map((c) => (
              <div key={c.label} className={`flex items-center gap-1.5 text-xs ${c.passed ? "text-emerald-300" : "text-amber-300"}`}>
                {c.passed ? <Check size={13} /> : <X size={13} />} {c.label}
              </div>
            ))}
          </div>
          <div className="mt-3 space-y-1">
            {floor.rooms.map((r: Room) => (
              <div key={r.id} className="flex justify-between text-[11px]"><span className="text-zinc-500">{r.name}</span><span className="text-zinc-400">{fmtFt(r.width)} × {fmtFt(r.height)}</span></div>
            ))}
          </div>
        </div>
        <div className="space-y-3">
          {((opt.assumptions?.length ?? result.assumptions?.length ?? 0) > 0) && (
            <div className="bg-zinc-800/40 border border-zinc-700/60 rounded-xl p-4">
              <div className="text-[11px] uppercase tracking-widest font-semibold text-zinc-500 mb-2">Assumptions</div>
              <ul className="space-y-1">
                {(opt.assumptions || result.assumptions || []).slice(0, 5).map((a: string, i: number) => <li key={i} className="text-xs text-zinc-300">• {a}</li>)}
              </ul>
            </div>
          )}
          {(opt.warnings?.length ?? 0) > 0 && (
            <div className="bg-amber-950/20 border border-amber-900/60 rounded-xl p-4">
              <div className="text-[11px] uppercase tracking-widest font-semibold text-amber-500/80 mb-2">Warnings</div>
              <ul className="space-y-1">
                {opt.warnings.slice(0, 5).map((w: string, i: number) => <li key={i} className="text-xs text-amber-200/90">• {w}</li>)}
              </ul>
            </div>
          )}
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 md:grid-cols-4 gap-2">
        <button onClick={apply} className="bg-white text-zinc-900 rounded-full py-2.5 text-xs font-semibold hover:bg-zinc-100 flex items-center justify-center gap-1.5">
          <Check size={14} /> Apply option {opt.label}
        </button>
        <button onClick={() => g.regenerate()} className="bg-zinc-800 border border-zinc-700 text-zinc-200 rounded-full py-2.5 text-xs font-medium hover:bg-zinc-700 flex items-center justify-center gap-1.5">
          <RotateCcw size={13} /> Regenerate
        </button>
        <button onClick={() => g.setStep(0)} className="bg-zinc-800 border border-zinc-700 text-zinc-200 rounded-full py-2.5 text-xs font-medium hover:bg-zinc-700 flex items-center justify-center gap-1.5">
          <Pencil size={13} /> Modify
        </button>
        <button onClick={() => g.discard()} className="text-zinc-500 hover:text-zinc-300 rounded-full py-2.5 text-xs flex items-center justify-center gap-1.5">
          <Ban size={13} /> Discard
        </button>
      </div>
      <p className="text-center text-[11px] text-zinc-600 mt-3">Applying replaces the current floor in <span className="text-zinc-400">one undoable step</span> and saves a version. Discard leaves your design untouched.</p>
    </div>
  );
}
