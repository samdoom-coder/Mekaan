import { useMemo, useState } from "react";
import { X, Plus, Trash2, Loader2, Check, RotateCcw, Pencil, Ban, ArrowLeft, ArrowRight } from "lucide-react";
import { useGenerationStore } from "../generationStore";
import type { SpatialRelationship } from "../generationTypes";
import { STATUS_LABEL } from "../generationTypes";
import GenerationPreview from "./GenerationPreview";

const STEPS = ["Plot", "Rooms", "Sizes", "Layout", "Brief", "Review"];

const RELS: SpatialRelationship[] = ["ADJACENT", "NEAR", "FAR", "ATTACHED", "ACCESSIBLE_FROM", "FRONT_OF", "BEHIND", "LEFT_OF", "RIGHT_OF"];

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-widest font-semibold text-zinc-500 mb-1.5">{label}</div>
      {children}
    </div>
  );
}

function Seg<T extends string | number>({ options, value, onChange }: { options: readonly T[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button
          key={o}
          onClick={() => onChange(o)}
          className={`px-2.5 py-1.5 rounded-md text-xs font-medium border ${value === o ? "bg-white text-zinc-900 border-white" : "bg-zinc-800/60 text-zinc-400 border-zinc-700 hover:border-zinc-500 hover:text-zinc-200"}`}
        >
          {o}
        </button>
      ))}
    </div>
  );
}

function Counter({ label, value, onChange, hint }: { label: string; value: number; onChange: (v: number) => void; hint?: string }) {
  return (
    <div className="bg-zinc-800/50 border border-zinc-700/60 rounded-lg px-3 py-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-zinc-200">{label}</span>
        <div className="flex items-center gap-2">
          <button onClick={() => onChange(Math.max(0, value - 1))} className="w-6 h-6 rounded-full bg-zinc-700 hover:bg-zinc-600 text-zinc-200 text-sm leading-none">−</button>
          <span className="w-5 text-center text-sm font-semibold text-white">{value}</span>
          <button onClick={() => onChange(Math.min(6, value + 1))} className="w-6 h-6 rounded-full bg-white hover:bg-zinc-100 text-zinc-900 text-sm leading-none">+</button>
        </div>
      </div>
      {hint && <div className="text-[11px] text-zinc-500 mt-1">{hint}</div>}
    </div>
  );
}

export default function GenerationWizard() {
  const g = useGenerationStore();
  const { request, status, result, error, offline } = g;
  const [customRoom, setCustomRoom] = useState("");
  const [adj, setAdj] = useState<{ source: string; relationship: SpatialRelationship; target: string; strength: "required" | "preferred" }>({ source: "Kitchen", relationship: "ADJACENT" as SpatialRelationship, target: "Dining Room", strength: "required" });

  const generating = ["understanding", "planning", "layout", "validating", "repairing"].includes(status);
  const showPreview = status === "ready" && result?.success;
  const showError = status === "failed";

  const roomNames = useMemo(() => {
    const names: string[] = [];
    for (const r of request.rooms) {
      for (let i = 0; i < r.count; i++) {
        names.push(r.count > 1 ? `${r.name || r.type} ${i + 1}` : r.name || r.type);
      }
    }
    return names.length ? names : ["Room 1"];
  }, [request.rooms]);

  const setCount = (type: string, count: number) => {
    const rooms = request.rooms.some((r) => r.type === type)
      ? request.rooms.map((r) => (r.type === type ? { ...r, count } : r))
      : [...request.rooms, { type, name: type.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()), count, required: false }];
    g.updateRequest({ rooms: rooms.filter((r) => r.count > 0 || ["living-room", "kitchen"].includes(r.type)) });
  };
  const getCount = (type: string) => request.rooms.find((r) => r.type === type)?.count ?? 0;

  const summary = useMemo(() => {
    const beds = getCount("bedroom") + getCount("master-bedroom");
    const baths = getCount("bathroom") + getCount("toilet");
    return { beds, baths, kitchen: getCount("kitchen"), dining: getCount("dining-room"), living: getCount("living-room") };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request.rooms]);

  const valid = request.plot.width > 0 && request.plot.depth > 0 && request.rooms.reduce((s, r) => s + r.count, 0) >= 1;

  if (!g.open) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden shadow-2xl">
        {/* header */}
        <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-base font-semibold text-white tracking-tight">Generate with AI</h2>
            <p className="text-xs text-zinc-500 mt-0.5">Architectural planning — intent in, schematic plan out. Geometry is solved by the layout engine, not the model.</p>
          </div>
          <button onClick={() => g.setOpen(false)} className="text-zinc-500 hover:text-white p-1"><X size={18} /></button>
        </div>

        {/* steps */}
        {!showPreview && !generating && !showError && (
          <div className="px-6 py-3 border-b border-zinc-800 flex items-center gap-1.5 shrink-0 overflow-x-auto">
            {STEPS.map((s, i) => (
              <div key={s} className="flex items-center gap-1.5 shrink-0">
                <button
                  onClick={() => g.setStep(i)}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium ${g.step === i ? "bg-white text-zinc-900" : "text-zinc-500 hover:text-zinc-200"}`}
                >
                  {i + 1}. {s}
                </button>
                {i < STEPS.length - 1 && <span className="text-zinc-700 text-xs">›</span>}
              </div>
            ))}
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-6">
          {/* GENERATING */}
          {generating && (
            <div className="max-w-md mx-auto py-10 text-center">
              <Loader2 size={28} className="animate-spin text-white mx-auto" />
              <div className="mt-4 text-sm font-medium text-white">{STATUS_LABEL[status]}</div>
              <div className="mt-2 text-xs text-zinc-500">Seed {request.seed} • {request.plot.width}×{request.plot.depth} {request.plot.unit} • {request.rooms.reduce((s, r) => s + r.count, 0)} rooms</div>
              <div className="mt-6 space-y-1.5 text-left">
                {(["understanding", "planning", "layout", "validating"] as const).map((s) => {
                  const order = ["understanding", "planning", "layout", "validating", "repairing", "ready"];
                  const active = order.indexOf(status) >= order.indexOf(s);
                  return (
                    <div key={s} className={`flex items-center gap-2 text-xs px-3 py-2 rounded-lg border ${active ? "bg-zinc-800 border-zinc-700 text-zinc-200" : "border-zinc-800 text-zinc-600"}`}>
                      {active ? <Check size={13} className="text-emerald-400" /> : <span className="w-3.5" />}
                      {STATUS_LABEL[s]}
                    </div>
                  );
                })}
              </div>
              <button onClick={() => g.cancel()} className="mt-6 px-4 py-2 rounded-full bg-zinc-800 border border-zinc-700 text-xs text-zinc-300 hover:text-white">Cancel generation</button>
            </div>
          )}

          {/* FAILED */}
          {showError && (
            <div className="max-w-lg mx-auto py-6">
              <div className="bg-red-950/30 border border-red-900 rounded-xl p-5">
                <div className="text-sm font-semibold text-red-200">Generation needs adjustment</div>
                <p className="text-xs text-red-300/90 mt-2 whitespace-pre-wrap">{result?.message || error}</p>
                {result?.suggestions && result.suggestions.length > 0 && (
                  <ul className="mt-3 space-y-1">
                    {result.suggestions.map((s) => (
                      <li key={s} className="text-xs text-zinc-300 flex gap-2"><span className="text-zinc-500">•</span>{s}</li>
                    ))}
                  </ul>
                )}
                {error && !result?.message && <div className="mt-3 text-xs text-red-300 bg-red-950 rounded p-2 border border-red-900">{error}</div>}
              </div>
              <div className="mt-4 flex gap-2">
                <button onClick={() => g.setStep(0)} className="flex-1 bg-zinc-800 border border-zinc-700 rounded-full py-2.5 text-xs font-medium text-zinc-200 hover:bg-zinc-700 flex items-center justify-center gap-1.5">
                  <Pencil size={13} /> Modify requirements
                </button>
                <button onClick={() => g.generate()} className="flex-1 bg-white rounded-full py-2.5 text-xs font-semibold text-zinc-900 hover:bg-zinc-100 flex items-center justify-center gap-1.5">
                  <RotateCcw size={13} /> Retry
                </button>
                <button onClick={() => { g.discard(); }} className="px-4 py-2.5 rounded-full text-xs text-zinc-500 hover:text-zinc-300">Discard</button>
              </div>
            </div>
          )}

          {/* WIZARD STEPS */}
          {!generating && !showPreview && !showError && g.step === 0 && (
            <div className="max-w-lg mx-auto space-y-5">
              <Field label="Plot width">
                <input type="number" min={10} max={500} value={request.plot.width} onChange={(e) => g.updateRequest({ plot: { ...request.plot, width: Number(e.target.value) } })} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-white" />
              </Field>
              <Field label="Plot depth">
                <input type="number" min={10} max={500} value={request.plot.depth} onChange={(e) => g.updateRequest({ plot: { ...request.plot, depth: Number(e.target.value) } })} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-white" />
              </Field>
              <Field label="Unit system (reuses editor units)">
                <Seg options={["ft", "m", "cm", "in"] as const} value={request.plot.unit as never} onChange={(u) => g.updateRequest({ plot: { ...request.plot, unit: u } })} />
              </Field>
              <Field label="Floors">
                <input type="number" value={1} disabled className="w-full bg-zinc-800/50 border border-zinc-800 rounded-lg px-3 py-2.5 text-sm text-zinc-500" />
                <p className="text-[11px] text-zinc-600 mt-1">Phase 3 supports 1 floor. The model is multi-floor ready.</p>
              </Field>
            </div>
          )}

          {!generating && !showPreview && !showError && g.step === 1 && (
            <div className="max-w-2xl mx-auto space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Counter label="Master bedrooms" value={getCount("master-bedroom")} onChange={(v) => setCount("master-bedroom", v)} />
                <Counter label="Bedrooms" value={getCount("bedroom")} onChange={(v) => setCount("bedroom", v)} />
                <Counter label="Bathrooms" value={getCount("bathroom")} onChange={(v) => setCount("bathroom", v)} />
                <Counter label="Toilets" value={getCount("toilet")} onChange={(v) => setCount("toilet", v)} />
                <Counter label="Kitchens" value={getCount("kitchen")} onChange={(v) => setCount("kitchen", Math.max(0, Math.min(2, v)))} />
                <Counter label="Living rooms" value={getCount("living-room")} onChange={(v) => setCount("living-room", Math.max(0, Math.min(2, v)))} />
                <Counter label="Dining rooms" value={getCount("dining-room")} onChange={(v) => setCount("dining-room", Math.max(0, Math.min(2, v)))} />
                <Counter label="Studies" value={getCount("study")} onChange={(v) => setCount("study", v)} />
              </div>
              <Field label="Optional rooms">
                <div className="flex flex-wrap gap-1.5">
                  {["office", "family-room", "laundry", "pantry", "walk-in-closet", "utility-room", "prayer-room", "storage", "guest-room", "garage", "balcony", "patio"].map((t) => (
                    <button
                      key={t}
                      onClick={() => setCount(t, getCount(t) > 0 ? 0 : 1)}
                      className={`px-2.5 py-1.5 rounded-md text-xs border capitalize ${getCount(t) > 0 ? "bg-white text-zinc-900 border-white font-semibold" : "bg-zinc-800/60 text-zinc-400 border-zinc-700 hover:text-zinc-200"}`}
                    >
                      {t.replace(/-/g, " ")}{getCount(t) > 0 ? ` ×${getCount(t)}` : ""}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2 mt-2">
                  <input value={customRoom} onChange={(e) => setCustomRoom(e.target.value)} placeholder="Custom room name (e.g. Puja Room)" className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-white placeholder:text-zinc-600" />
                  <button
                    onClick={() => {
                      const n = customRoom.trim();
                      if (!n) return;
                      g.updateRequest({ rooms: [...request.rooms, { type: "other", name: n, count: 1, required: false }] });
                      setCustomRoom("");
                    }}
                    className="px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-xs text-zinc-200 hover:bg-zinc-700 flex items-center gap-1"
                  >
                    <Plus size={13} /> Add
                  </button>
                </div>
                {request.rooms.filter((r) => r.type === "other").length > 0 && (
                  <div className="mt-2 space-y-1">
                    {request.rooms.filter((r) => r.type === "other").map((r, i) => (
                      <div key={i} className="flex items-center justify-between bg-zinc-800/60 border border-zinc-700 rounded-lg px-3 py-1.5 text-xs text-zinc-300">
                        <span>{r.name} × {r.count}</span>
                        <button onClick={() => g.updateRequest({ rooms: request.rooms.filter((x) => x !== r) })} className="text-zinc-500 hover:text-red-400"><Trash2 size={13} /></button>
                      </div>
                    ))}
                  </div>
                )}
              </Field>
            </div>
          )}

          {!generating && !showPreview && !showError && g.step === 2 && (
            <div className="max-w-2xl mx-auto space-y-3">
              <p className="text-xs text-zinc-500">Target dimensions are <span className="text-zinc-300">preferences, not hard constraints</span> — unless marked Exact. The layout engine resolves final geometry.</p>
              {request.rooms.filter((r) => r.count > 0).map((r, i) => (
                <div key={`${r.type}-${i}`} className="bg-zinc-800/40 border border-zinc-700/60 rounded-xl p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-white capitalize">{r.name || r.type.replace(/-/g, " ")}{r.count > 1 ? ` × ${r.count}` : ""}</span>
                    <Seg
                      options={["preferred", "exact", "minimum"] as const}
                      value={(r.sizeMode as never) || "preferred"}
                      onChange={(m) => g.updateRequest({ rooms: request.rooms.map((x) => (x === r ? { ...x, sizeMode: m as never } : x)) })}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="text-[11px] text-zinc-500">Width ({request.plot.unit})
                      <input type="number" value={r.preferredWidth ?? ""} placeholder="auto" onChange={(e) => g.updateRequest({ rooms: request.rooms.map((x) => (x === r ? { ...x, preferredWidth: e.target.value ? Number(e.target.value) : undefined } : x)) })} className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-xs text-white" />
                    </label>
                    <label className="text-[11px] text-zinc-500">Height ({request.plot.unit})
                      <input type="number" value={r.preferredHeight ?? ""} placeholder="auto" onChange={(e) => g.updateRequest({ rooms: request.rooms.map((x) => (x === r ? { ...x, preferredHeight: e.target.value ? Number(e.target.value) : undefined } : x)) })} className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-xs text-white" />
                    </label>
                  </div>
                </div>
              ))}
            </div>
          )}

          {!generating && !showPreview && !showError && g.step === 3 && (
            <div className="max-w-2xl mx-auto space-y-5">
              <Field label="Entrance">
                <Seg options={["front", "left", "right", "rear", "any"] as const} value={request.preferences.entrance} onChange={(v) => g.updateRequest({ preferences: { ...request.preferences, entrance: v } })} />
              </Field>
              <Field label="Master bedroom">
                <Seg options={["front", "rear", "left", "right", "any"] as const} value={request.preferences.masterBedroom} onChange={(v) => g.updateRequest({ preferences: { ...request.preferences, masterBedroom: v } })} />
              </Field>
              <Field label="Kitchen">
                <Seg options={["near-dining", "near-entrance", "rear", "any"] as const} value={request.preferences.kitchen} onChange={(v) => g.updateRequest({ preferences: { ...request.preferences, kitchen: v } })} />
              </Field>
              <Field label="Living room">
                <Seg options={["near-entrance", "center", "rear", "any"] as const} value={request.preferences.livingRoom} onChange={(v) => g.updateRequest({ preferences: { ...request.preferences, livingRoom: v } })} />
              </Field>
              <Field label="Bedrooms">
                <Seg options={["grouped", "separated", "private-zone", "any"] as const} value={request.preferences.bedrooms} onChange={(v) => g.updateRequest({ preferences: { ...request.preferences, bedrooms: v } })} />
              </Field>
              <Field label="Adjacency requirements (structured constraints)">
                <div className="bg-zinc-800/40 border border-zinc-700/60 rounded-xl p-3 space-y-2">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    <select value={adj.source} onChange={(e) => setAdj({ ...adj, source: e.target.value })} className="bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-xs text-white">
                      {roomNames.map((n) => <option key={n}>{n}</option>)}
                    </select>
                    <select value={adj.relationship} onChange={(e) => setAdj({ ...adj, relationship: e.target.value as SpatialRelationship })} className="bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-xs text-white">
                      {RELS.map((r) => <option key={r}>{r}</option>)}
                    </select>
                    <select value={adj.target} onChange={(e) => setAdj({ ...adj, target: e.target.value })} className="bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-xs text-white">
                      {roomNames.map((n) => <option key={n}>{n}</option>)}
                      <option>Entrance</option>
                    </select>
                    <div className="flex gap-1.5">
                      <button onClick={() => setAdj({ ...adj, strength: adj.strength === "required" ? "preferred" : "required" })} className={`flex-1 rounded-lg text-xs border ${adj.strength === "required" ? "bg-white text-zinc-900 border-white font-semibold" : "bg-zinc-800 text-zinc-400 border-zinc-700"}`}>
                        {adj.strength}
                      </button>
                      <button
                        onClick={() => g.updateRequest({ relationships: [...request.relationships, { sourceRoom: adj.source, relationship: adj.relationship, targetRoom: adj.target, strength: adj.strength }] })}
                        className="px-3 rounded-lg bg-white text-zinc-900 text-xs font-semibold"
                      >
                        <Plus size={13} />
                      </button>
                    </div>
                  </div>
                  {request.relationships.length === 0 && <p className="text-[11px] text-zinc-600">No adjacency rules yet. Example: Kitchen ADJACENT Dining Room (required).</p>}
                  {request.relationships.map((r, i) => (
                    <div key={i} className="flex items-center justify-between bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-xs">
                      <span className="text-zinc-300">{r.sourceRoom} <span className="text-violet-300 font-mono">{r.relationship}</span> {r.targetRoom} <span className="text-zinc-500">({r.strength})</span></span>
                      <button onClick={() => g.updateRequest({ relationships: request.relationships.filter((_, j) => j !== i) })} className="text-zinc-500 hover:text-red-400"><Trash2 size={13} /></button>
                    </div>
                  ))}
                </div>
              </Field>
            </div>
          )}

          {!generating && !showPreview && !showError && g.step === 4 && (
            <div className="max-w-2xl mx-auto space-y-3">
              <Field label="Free-form architectural brief">
                <textarea
                  value={request.brief || ""}
                  onChange={(e) => g.updateRequest({ brief: e.target.value })}
                  rows={8}
                  placeholder={"Create a modern 3-bedroom house. The living room should be close to the entrance. The kitchen should be next to the dining room. The master bedroom should be at the rear with an attached bathroom. Good natural light and reasonable circulation."}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500"
                />
              </Field>
              <p className="text-[11px] text-zinc-600">Structured fields + brief are both passed to the generation system. The brief guides intent; the planner solves geometry.</p>
            </div>
          )}

          {!generating && !showPreview && !showError && g.step === 5 && (
            <div className="max-w-lg mx-auto">
              <div className="border border-zinc-700/60 rounded-xl overflow-hidden">
                <div className="px-4 py-2.5 bg-zinc-800/60 border-b border-zinc-700/60 text-[11px] uppercase tracking-widest font-semibold text-zinc-400">Your design</div>
                <div className="p-4 space-y-2 text-sm">
                  <div className="flex justify-between text-zinc-300"><span>Plot</span><span className="text-white font-medium">{request.plot.width} × {request.plot.depth} {request.plot.unit}</span></div>
                  <div className="flex justify-between text-zinc-300"><span>Bedrooms</span><span className="text-white font-medium">{summary.beds}</span></div>
                  <div className="flex justify-between text-zinc-300"><span>Bathrooms</span><span className="text-white font-medium">{summary.baths}</span></div>
                  <div className="flex justify-between text-zinc-300"><span>Kitchen / Dining / Living</span><span className="text-white font-medium">{summary.kitchen} / {summary.dining} / {summary.living}</span></div>
                  <div className="pt-2 border-t border-zinc-800">
                    <div className="text-[11px] uppercase tracking-widest text-zinc-500 font-semibold mb-1.5">Preferences</div>
                    <ul className="space-y-1 text-xs text-zinc-300">
                      <li>• Master bedroom: {request.preferences.masterBedroom}</li>
                      <li>• Kitchen: {request.preferences.kitchen.replace("-", " ")}</li>
                      <li>• Living room: {request.preferences.livingRoom.replace("-", " ")}</li>
                      <li>• Entrance: {request.preferences.entrance}</li>
                      {request.relationships.slice(0, 4).map((r, i) => <li key={i}>• {r.sourceRoom} {r.relationship.toLowerCase().replace("_", " ")} {r.targetRoom}</li>)}
                    </ul>
                  </div>
                  {request.brief && <p className="text-xs text-zinc-500 italic line-clamp-3">“{request.brief}”</p>}
                </div>
              </div>
              <div className="mt-4">
                <Field label="Layout options to generate">
                  <Seg options={[1, 3, 5] as const} value={(request.count ?? 3) as 1 | 3 | 5} onChange={(v) => g.updateRequest({ count: v })} />
                </Field>
                <p className="text-[11px] text-zinc-600 mt-1">Each option is a different valid arrangement of the same program — pick your favourite from the preview.</p>
              </div>
              {!valid && <p className="text-xs text-red-400 mt-3">Add at least one room and valid plot dimensions.</p>}
            </div>
          )}

          {/* PREVIEW */}
          {showPreview && <GenerationPreview />}
        </div>

        {/* footer */}
        {!generating && !showPreview && !showError && (
          <div className="px-6 py-4 border-t border-zinc-800 flex items-center justify-between shrink-0 bg-zinc-800/30">
            <button
              onClick={() => (g.step === 0 ? g.setOpen(false) : g.setStep(g.step - 1))}
              className="px-4 py-2 rounded-full text-xs font-medium text-zinc-400 hover:text-white flex items-center gap-1.5"
            >
              <ArrowLeft size={13} /> {g.step === 0 ? "Close" : "Back"}
            </button>
            {g.step < STEPS.length - 1 ? (
              <button onClick={() => g.setStep(g.step + 1)} className="px-6 py-2 rounded-full text-xs font-semibold bg-white text-zinc-900 hover:bg-zinc-100 flex items-center gap-1.5">
                Continue <ArrowRight size={13} />
              </button>
            ) : (
              <button
                onClick={() => { g.updateRequest({ seed: request.seed ?? Math.floor(Math.random() * 100000) }); g.generate(); }}
                disabled={!valid}
                className="px-6 py-2 rounded-full text-xs font-semibold bg-white text-zinc-900 hover:bg-zinc-100 disabled:opacity-40 flex items-center gap-1.5"
              >
                Generate {request.count ?? 3} floor plan{(request.count ?? 3) > 1 ? "s" : ""}
              </button>
            )}
          </div>
        )}

        {showPreview && (
          <div className="px-6 py-3 border-t border-zinc-800 shrink-0 bg-zinc-800/30 flex items-center justify-between">
            <span className="text-[11px] text-zinc-500 flex items-center gap-1.5">
              {offline ? "Offline engine • start backend for cloud reasoning" : `Plan: ${result?.planSource || "heuristic"} • Seed ${result?.seed}`}
              <Ban size={0} className="hidden" />
            </span>
            <button onClick={() => { g.discard(); g.setStep(5); }} className="text-[11px] text-zinc-500 hover:text-zinc-300 underline">Back to requirements</button>
          </div>
        )}
      </div>
    </div>
  );
}
