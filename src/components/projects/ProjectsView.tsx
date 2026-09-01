import { useState } from "react";
import { useProjectStore } from "../../stores/projectStore";
import { useDesignStore } from "../../stores/designStore";
import { useUIStore } from "../../stores/uiStore";
import { Plus, Trash2, Clock, Layers, Ruler, Home, Sparkles, Loader2, Wand2, Check, X, Minus } from "lucide-react";
import { getFloorPolygon } from "../../utils/floorShape";
import { generateFloorplans } from "../../features/ai/services/generateApi";
import type { Design } from "../../types/design";

export default function ProjectsView() {
  const projectStore = useProjectStore();
  const ui = useUIStore();
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: "", propertyType: "residential", units: "feet", width: 40, depth: 60, floors: 1, plotShape: "rectangle" as any, notchW: 12, notchH: 15, polySides: 6, polyRadius: 18, drawCustom: false });

  // AI generation state
  const [useAI, setUseAI] = useState(false);
  const [aiForm, setAiForm] = useState({
    bedrooms: 3,
    bathrooms: 2,
    toilets: 0,
    kitchens: 1,
    livingRooms: 1,
    diningRooms: 1,
    studies: 0,
    balconies: 1,
    garages: 0,
    stores: 0,
    utilities: 0,
    preferences: "",
    count: 3,
    shapeMode: "same" as "same" | "ai", // same = use form.plotShape, ai = AI decides
  });
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiOptions, setAiOptions] = useState<any[] | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [selectedAiIdx, setSelectedAiIdx] = useState<number | null>(null);

  const handleCreate = () => {
    if (!form.name.trim()) return ui.pushToast("Project name required", "error");
    let plotShape: any = undefined;
    const w = Number(form.width), h = Number(form.depth);
    if (form.plotShape === "square") {
      plotShape = { type: "square" };
    } else if (form.plotShape === "polygon") {
      const sides = Number(form.polySides);
      const radius = Number(form.polyRadius) || Math.min(w,h)*0.45;
      const cx = w/2, cy = h/2;
      const pts = Array.from({length:sides}, (_,i)=>{
        const ang = -Math.PI/2 + i*2*Math.PI/sides;
        return { x: cx + Math.cos(ang)*radius, y: cy + Math.sin(ang)*radius };
      });
      plotShape = { type: "polygon", sides, radius, polygon: pts };
    } else if (form.plotShape === "custom") {
      const cx = w/2, cy = h/2;
      const r = Math.min(w,h)*0.38;
      const pts = Array.from({length:5}, (_,i)=>{
        const ang = -Math.PI/2 + i*2*Math.PI/5;
        return { x: cx + Math.cos(ang)*r, y: cy + Math.sin(ang)*r };
      });
      plotShape = { type: "custom", polygon: pts };
    } else if (form.plotShape !== "rectangle") {
      plotShape = { type: form.plotShape, notchWidth: Number(form.notchW), notchHeight: Number(form.notchH) };
    }
    const proj = projectStore.createProject({ name: form.name, propertyType: form.propertyType as any, units: form.units as any, width: Number(form.width), depth: Number(form.depth), floors: Number(form.floors), plotShape });
    if (proj.design) useDesignStore.getState().setDesign(proj.design);
    ui.setView("editor");
    setShowCreate(false);
    setForm({ name: "", propertyType: "residential", units: "feet", width: 40, depth: 60, floors: 1, plotShape: "rectangle" as any, notchW: 12, notchH: 15, polySides: 6, polyRadius: 18, drawCustom: false });
    setUseAI(false);
    setAiOptions(null);
  };

  const handleAIGenerate = async () => {
    if (!form.name.trim()) return ui.pushToast("Project name required", "error");
    setAiGenerating(true);
    setAiError(null);
    setAiOptions(null);
    try {
      const shapeForAI = aiForm.shapeMode === "ai" ? { type: "ai" } : (() => {
        // build shape same as handleCreate
        const w = Number(form.width), h = Number(form.depth);
        if (form.plotShape === "square") return { type: "square" };
        if (form.plotShape === "polygon") {
          const sides = Number(form.polySides);
          const radius = Number(form.polyRadius) || Math.min(w,h)*0.45;
          const cx = w/2, cy = h/2;
          const pts = Array.from({length:sides}, (_,i)=>{
            const ang = -Math.PI/2 + i*2*Math.PI/sides;
            return { x: cx + Math.cos(ang)*radius, y: cy + Math.sin(ang)*radius };
          });
          return { type: "polygon", sides, radius, polygon: pts };
        }
        if (form.plotShape === "custom") {
          const cx = w/2, cy = h/2;
          const r = Math.min(w,h)*0.38;
          const pts = Array.from({length:5}, (_,i)=>{
            const ang = -Math.PI/2 + i*2*Math.PI/5;
            return { x: cx + Math.cos(ang)*r, y: cy + Math.sin(ang)*r };
          });
          return { type: "custom", polygon: pts };
        }
        if (form.plotShape !== "rectangle") return { type: form.plotShape, notchWidth: Number(form.notchW), notchHeight: Number(form.notchH) };
        return { type: "rectangle" };
      })();

      const res = await generateFloorplans({
        name: form.name,
        plotWidth: Number(form.width),
        plotDepth: Number(form.depth),
        plotShape: shapeForAI as any,
        units: form.units as any,
        propertyType: form.propertyType as any,
        requirements: {
          bedrooms: aiForm.bedrooms,
          bathrooms: aiForm.bathrooms,
          toilets: aiForm.toilets,
          kitchens: aiForm.kitchens,
          livingRooms: aiForm.livingRooms,
          diningRooms: aiForm.diningRooms,
          studies: aiForm.studies,
          balconies: aiForm.balconies,
          garages: aiForm.garages,
          stores: aiForm.stores,
          utilities: aiForm.utilities,
        },
        preferences: aiForm.preferences,
        count: aiForm.count,
      });
      setAiOptions(res.options);
      if (res.options.length === 0) setAiError("No options generated. Try different room counts.");
    } catch (e) {
      setAiError(e instanceof Error ? e.message : String(e));
    } finally {
      setAiGenerating(false);
    }
  };

  const handleSelectAiOption = (idx: number) => {
    if (!aiOptions || !aiOptions[idx]) return;
    const opt = aiOptions[idx];
    const design = opt.design as Design;
    // ensure name
    design.name = form.name;
    const proj = projectStore.createProjectWithDesign({ name: form.name, design, propertyType: form.propertyType as any, units: form.units as any });
    useDesignStore.getState().setDesign(proj.design!);
    ui.setView("editor");
    setShowCreate(false);
    setUseAI(false);
    setAiOptions(null);
    setSelectedAiIdx(null);
    ui.pushToast(`Created ${opt.name}`, "success");
  };

  const Counter = ({ label, value, onChange, min = 0, max = 6 }: { label: string; value: number; onChange: (v:number)=>void; min?: number; max?: number }) => (
    <div className="flex items-center justify-between bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2">
      <span className="text-xs font-medium text-zinc-300">{label}</span>
      <div className="flex items-center gap-2">
        <button type="button" onClick={()=>onChange(Math.max(min, value-1))} className="w-7 h-7 rounded-full bg-zinc-700 hover:bg-zinc-600 flex items-center justify-center text-zinc-300 disabled:opacity-40" disabled={value<=min}><Minus size={14}/></button>
        <span className="w-6 text-center text-sm font-semibold text-white">{value}</span>
        <button type="button" onClick={()=>onChange(Math.min(max, value+1))} className="w-7 h-7 rounded-full bg-white hover:bg-zinc-100 flex items-center justify-center text-zinc-900 disabled:opacity-40" disabled={value>=max}><Plus size={14}/></button>
      </div>
    </div>
  );

  const openProject = (id: string) => {
    projectStore.setCurrent(id);
    const p = projectStore.projects.find(x=>x.id===id);
    if (p?.design) useDesignStore.getState().setDesign(p.design);
    ui.setView("editor");
  };

  return (
    <div className="flex-1 bg-[#0f0f0f] overflow-y-auto p-6 md:p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-semibold text-white tracking-tight">Projects</h1>
            <p className="text-sm text-zinc-500 mt-1">{projectStore.projects.length} projects • Last modified {new Date().toLocaleDateString()}</p>
          </div>
          <button onClick={()=>setShowCreate(true)} className="bg-white text-zinc-900 px-4 py-2 rounded-full text-sm font-semibold flex items-center gap-2 hover:bg-zinc-100">
            <Plus size={16} /> New Project
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {projectStore.projects.map(p=>(
            <div key={p.id} className="group bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden hover:border-zinc-700 transition-colors flex flex-col">
              <div className="h-[160px] bg-[#fdfbf7] relative overflow-hidden">
                <svg viewBox={`0 0 ${p.site.width} ${p.site.depth}`} className="w-full h-full">
                  {(() => {
                    const floor = p.design?.floors[0];
                    if (floor?.plotShape && floor.plotShape.type !== "rectangle") {
                      const poly = getFloorPolygon(floor);
                      const pts = poly.map(pt => `${pt.x},${pt.y}`).join(" ");
                      return <polygon points={pts} fill="#fdfbf7" stroke="#16a34a" strokeWidth={0.15} strokeLinejoin="round" />;
                    }
                    return <rect x={0} y={0} width={p.site.width} height={p.site.depth} fill="#fdfbf7" stroke="#1a1a1a" strokeWidth={0.15} />;
                  })()}
                  {p.design?.floors[0].rooms.slice(0,6).map((r:any)=>(
                    <rect key={r.id} x={r.x} y={r.y} width={r.width} height={r.height} fill="#e5e7eb" stroke="#52525b" strokeWidth={0.08} />
                  ))}
                </svg>
                <div className="absolute top-2 right-2 bg-white/90 backdrop-blur px-2 py-1 rounded-full text-[10px] font-medium text-zinc-700 border border-zinc-200 flex items-center gap-1">
                  <Layers size={10} /> {p.floors} floor
                </div>
              </div>
              <div className="p-4 flex-1 flex flex-col">
                <h3 className="font-medium text-white truncate">{p.name}</h3>
                <div className="flex items-center gap-2 mt-1 text-xs text-zinc-500">
                  <span className="capitalize flex items-center gap-1"><Home size={12} /> {p.propertyType}</span>
                  <span>•</span>
                  <span className="flex items-center gap-1"><Ruler size={12} /> {p.site.width}×{p.site.depth} {p.units}</span>
                </div>
                <div className="flex items-center gap-1 mt-2 text-[11px] text-zinc-600">
                  <Clock size={11} /> {new Date(p.updatedAt).toLocaleString()}
                </div>
                <div className="mt-4 flex gap-2">
                  <button onClick={()=>openProject(p.id)} className="flex-1 bg-white text-zinc-900 py-2 rounded-full text-sm font-medium hover:bg-zinc-100">Open</button>
                  <button onClick={()=>{
                    if (confirm(`Delete "${p.name}"?`)) projectStore.deleteProject(p.id);
                  }} className="w-9 h-9 rounded-full bg-zinc-800 hover:bg-red-600 hover:text-white flex items-center justify-center text-zinc-400">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </div>
          ))}
          <button onClick={()=>setShowCreate(true)} className="border-2 border-dashed border-zinc-800 rounded-xl h-[280px] flex flex-col items-center justify-center gap-3 hover:border-zinc-700 hover:bg-zinc-900/50 transition-colors text-zinc-500 hover:text-zinc-300">
            <div className="w-12 h-12 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center"><Plus size={20} /></div>
            <span className="text-sm font-medium">Create New Project</span>
            <span className="text-xs">40×60 ft • Residential</span>
          </button>
        </div>
      </div>

      {showCreate && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-start justify-center p-4 z-50 overflow-y-auto">
          <div className={`bg-zinc-900 border border-zinc-800 rounded-2xl w-full my-6 max-h-[90vh] flex flex-col overflow-hidden shadow-2xl ${useAI && aiOptions ? "max-w-5xl" : useAI ? "max-w-2xl" : "max-w-md"}`}>
            <div className="px-6 py-4 border-b border-zinc-800 shrink-0 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                  {useAI && <Sparkles size={18} className="text-violet-400" />}
                  {useAI ? "Generate with AI" : "Create New Project"}
                </h2>
                <p className="text-xs text-zinc-500 mt-1">{useAI ? "Describe rooms & plot — AI creates 3-4 options" : "Set up your plot and property type"}</p>
              </div>
              <button onClick={()=>{setShowCreate(false); setAiOptions(null); setUseAI(false);}} className="text-zinc-500 hover:text-white"><X size={18}/></button>
            </div>

            {/* Toggle */}
            <div className="px-6 py-3 bg-zinc-800/30 border-b border-zinc-800 flex items-center justify-between">
              <span className="text-xs font-semibold text-zinc-400 uppercase tracking-widest flex items-center gap-2"><Wand2 size={14}/> Generate floor plan using AI</span>
              <button
                onClick={()=>{setUseAI(!useAI); setAiOptions(null); setAiError(null);}}
                className={`relative w-12 h-6 rounded-full transition-colors ${useAI ? "bg-violet-600" : "bg-zinc-700"}`}
              >
                <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-transform ${useAI ? "translate-x-6" : "translate-x-0.5"}`} />
              </button>
            </div>

            <div className="p-6 space-y-4 overflow-y-auto flex-1 overscroll-contain">
              {/* Common top fields */}
              <div>
                <label className="text-xs uppercase tracking-widest font-semibold text-zinc-500">Project Name</label>
                <input value={form.name} onChange={e=>setForm({...form, name:e.target.value})} placeholder="Modern Villa" className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-zinc-600" />
              </div>
              <div>
                <label className="text-xs uppercase tracking-widest font-semibold text-zinc-500">Property Type</label>
                <div className="grid grid-cols-3 gap-2 mt-2">
                  {(["residential","apartment","villa","office","commercial"] as const).map(t=>(
                    <button key={t} onClick={()=>setForm({...form, propertyType:t})} className={`px-3 py-2 rounded-lg text-xs font-medium border capitalize ${form.propertyType===t ? "bg-white text-zinc-900 border-white" : "bg-zinc-800 text-zinc-400 border-zinc-700 hover:border-zinc-600"}`}>{t}</button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs uppercase tracking-widest font-semibold text-zinc-500">Units</label>
                <div className="flex gap-2 mt-2">
                  {(["feet","meters","centimeters"] as const).map(u=>(
                    <button key={u} onClick={()=>setForm({...form, units:u})} className={`flex-1 py-2 rounded-lg text-xs font-medium border capitalize ${form.units===u ? "bg-white text-zinc-900 border-white" : "bg-zinc-800 text-zinc-400 border-zinc-700"}`}>{u}</button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs uppercase tracking-widest font-semibold text-zinc-500">Plot Shape</label>
                <div className="grid grid-cols-4 gap-1.5 mt-2">
                  {(["rectangle","square","polygon","L","U","T","custom"] as const).map(s=>(
                    <button key={s} onClick={()=>setForm({...form, plotShape:s})} className={`px-2 py-2.5 rounded-lg text-[11px] font-medium border flex flex-col items-center gap-1 ${form.plotShape===s ? "bg-white text-zinc-900 border-white" : "bg-zinc-800 text-zinc-400 border-zinc-700 hover:border-zinc-600"}`}>
                      <span className="text-[14px]">{s==="rectangle"?"▭":s==="square"?"⬜":s==="polygon"?"⬡":s==="L"?"⌜":s==="U"?"⊔":s==="T"?"┬":"✏️"}</span>{s}
                    </button>
                  ))}
                </div>
                {useAI && (
                  <label className="flex items-center gap-2 mt-3 text-xs text-zinc-400 cursor-pointer">
                    <input type="checkbox" checked={aiForm.shapeMode==="ai"} onChange={e=>setAiForm({...aiForm, shapeMode: e.target.checked ? "ai" : "same"})} className="rounded border-zinc-600 bg-zinc-800 text-violet-600" />
                    <span className="flex items-center gap-1"><Sparkles size={12} className="text-violet-400"/> Let AI decide best shape for plot</span>
                  </label>
                )}
                {form.plotShape === "polygon" && (
                  <div className="grid grid-cols-2 gap-3 mt-3">
                    <div>
                      <label className="text-[11px] uppercase tracking-widest font-semibold text-zinc-500">Sides (3-12)</label>
                      <input type="number" min={3} max={12} value={form.polySides} onChange={e=>setForm({...form, polySides: Number(e.target.value)})} className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-2 text-sm text-white" />
                    </div>
                    <div>
                      <label className="text-[11px] uppercase tracking-widest font-semibold text-zinc-500">Radius (ft)</label>
                      <input type="number" value={form.polyRadius} onChange={e=>setForm({...form, polyRadius: Number(e.target.value)})} className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-2 text-sm text-white" />
                    </div>
                  </div>
                )}
                {(form.plotShape === "L" || form.plotShape === "U" || form.plotShape === "T") && (
                  <div className="grid grid-cols-2 gap-3 mt-3">
                    <div>
                      <label className="text-[11px] uppercase tracking-widest font-semibold text-zinc-500">Notch Width</label>
                      <input type="number" value={form.notchW} onChange={e=>setForm({...form, notchW: Number(e.target.value)})} className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-2 text-sm text-white" />
                    </div>
                    <div>
                      <label className="text-[11px] uppercase tracking-widest font-semibold text-zinc-500">Notch Height</label>
                      <input type="number" value={form.notchH} onChange={e=>setForm({...form, notchH: Number(e.target.value)})} className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-2 text-sm text-white" />
                    </div>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs uppercase tracking-widest font-semibold text-zinc-500">Plot Width</label>
                  <input type="number" value={form.width} onChange={e=>setForm({...form, width: Number(e.target.value)})} className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-white" />
                </div>
                <div>
                  <label className="text-xs uppercase tracking-widest font-semibold text-zinc-500">Plot Depth</label>
                  <input type="number" value={form.depth} onChange={e=>setForm({...form, depth: Number(e.target.value)})} className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-white" />
                </div>
              </div>
              <div>
                <label className="text-xs uppercase tracking-widest font-semibold text-zinc-500">Number of Floors</label>
                <input type="number" min={1} max={5} value={form.floors} onChange={e=>setForm({...form, floors: Number(e.target.value)})} className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-white" />
                <p className="text-[11px] text-zinc-600 mt-1">V1 supports 1 floor, model is multi-floor ready</p>
              </div>

              {useAI && !aiOptions && (
                <div className="border-t border-zinc-800 pt-4 space-y-4">
                  <h3 className="text-sm font-semibold text-white flex items-center gap-2"><Sparkles size={14} className="text-violet-400"/> How many rooms?</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <Counter label="Bedrooms" value={aiForm.bedrooms} onChange={v=>setAiForm({...aiForm, bedrooms:v})} />
                    <Counter label="Bathrooms" value={aiForm.bathrooms} onChange={v=>setAiForm({...aiForm, bathrooms:v})} />
                    <Counter label="Toilets" value={aiForm.toilets} onChange={v=>setAiForm({...aiForm, toilets:v})} />
                    <Counter label="Kitchens" value={aiForm.kitchens} onChange={v=>setAiForm({...aiForm, kitchens:v})} max={2}/>
                    <Counter label="Living Rooms" value={aiForm.livingRooms} onChange={v=>setAiForm({...aiForm, livingRooms:v})} max={2}/>
                    <Counter label="Dining" value={aiForm.diningRooms} onChange={v=>setAiForm({...aiForm, diningRooms:v})} max={2}/>
                    <Counter label="Study" value={aiForm.studies} onChange={v=>setAiForm({...aiForm, studies:v})} />
                    <Counter label="Balcony" value={aiForm.balconies} onChange={v=>setAiForm({...aiForm, balconies:v})} />
                    <Counter label="Garage" value={aiForm.garages} onChange={v=>setAiForm({...aiForm, garages:v})} />
                    <Counter label="Store" value={aiForm.stores} onChange={v=>setAiForm({...aiForm, stores:v})} />
                  </div>
                  <div>
                    <label className="text-xs uppercase tracking-widest font-semibold text-zinc-500">Preferences (optional)</label>
                    <textarea value={aiForm.preferences} onChange={e=>setAiForm({...aiForm, preferences:e.target.value})} placeholder="e.g., vastu east facing, open kitchen, big balcony, attached bathrooms..." rows={2} className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-zinc-600" />
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-zinc-400">Generate</span>
                    <div className="flex gap-2">
                      {[3,4].map(n=>(
                        <button key={n} onClick={()=>setAiForm({...aiForm, count:n})} className={`px-3 py-1.5 rounded-full text-xs font-medium border ${aiForm.count===n ? "bg-white text-zinc-900 border-white" : "bg-zinc-800 text-zinc-400 border-zinc-700"}`}>{n} options</button>
                      ))}
                    </div>
                    <span className="text-[11px] text-zinc-600">AI auto-decides sizes & layout</span>
                  </div>
                </div>
              )}

              {aiError && (
                <div className="bg-red-950/40 border border-red-900 rounded-lg p-3 text-xs text-red-300">{aiError}</div>
              )}

              {aiOptions && (
                <div className="border-t border-zinc-800 pt-4">
                  <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2"><Sparkles size={14} className="text-violet-400"/> AI generated {aiOptions.length} options — pick one</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {aiOptions.map((opt:any, idx:number)=> {
                      const floor = opt.design.floors[0];
                      const totalArea = floor.rooms.reduce((s:any,r:any)=>s+r.width*r.height,0);
                      const coverage = Math.round(totalArea/(floor.width*floor.height)*100);
                      return (
                        <div key={idx} className={`bg-zinc-800 border rounded-xl overflow-hidden flex flex-col ${selectedAiIdx===idx ? "border-violet-500 ring-1 ring-violet-500" : "border-zinc-700 hover:border-zinc-600"}`}>
                          <div className="h-[180px] bg-[#fdfbf7] relative">
                            <svg viewBox={`0 0 ${floor.width} ${floor.height}`} className="w-full h-full">
                              {(() => {
                                const poly = getFloorPolygon(floor);
                                const pts = poly.map(pt=>`${pt.x},${pt.y}`).join(" ");
                                return <polygon points={pts} fill="#fdfbf7" stroke="#16a34a" strokeWidth={0.14} />;
                              })()}
                              {floor.rooms.map((r:any)=>(
                                <g key={r.id}>
                                  <rect x={r.x} y={r.y} width={r.width} height={r.height} fill={r.type==="living-room"?"#fef3c7":r.type==="master-bedroom"?"#bfdbfe":r.type==="bedroom"?"#dbeafe":r.type==="kitchen"?"#fed7aa":r.type==="bathroom"||r.type==="toilet"?"#e0f2fe":"#e5e7eb"} stroke="#52525b" strokeWidth={0.09} rx={0.2} />
                                  <text x={r.x+r.width/2} y={r.y+r.height/2} textAnchor="middle" dominantBaseline="middle" fontSize={`${Math.max(0.6, Math.min(r.width,r.height)/6)}`} fill="#27272a" style={{fontFamily:"Inter,sans-serif"}}>{r.name}</text>
                                </g>
                              ))}
                            </svg>
                            <span className="absolute top-2 left-2 bg-white/90 backdrop-blur px-2 py-0.5 rounded-full text-[10px] font-medium border">{opt.name}</span>
                            <span className="absolute top-2 right-2 bg-zinc-900 text-white px-2 py-0.5 rounded-full text-[10px]">{floor.rooms.length} rooms • {coverage}%</span>
                          </div>
                          <div className="p-3 flex-1 flex flex-col">
                            <p className="text-xs text-zinc-400 line-clamp-2">{opt.description}</p>
                            <div className="flex flex-wrap gap-1 mt-2">
                              {floor.rooms.slice(0,5).map((r:any)=><span key={r.id} className="text-[10px] bg-zinc-700 text-zinc-300 px-1.5 py-0.5 rounded">{r.name}</span>)}
                              {floor.rooms.length>5 && <span className="text-[10px] text-zinc-500">+{floor.rooms.length-5}</span>}
                            </div>
                            <button onClick={()=>handleSelectAiOption(idx)} className={`mt-3 w-full py-2 rounded-full text-xs font-semibold flex items-center justify-center gap-1.5 ${selectedAiIdx===idx ? "bg-violet-600 text-white" : "bg-white text-zinc-900 hover:bg-zinc-100"}`}>
                              <Check size={14}/> Use this plan
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <button onClick={()=>{setAiOptions(null); setAiError(null);}} className="mt-4 text-xs text-zinc-500 hover:text-zinc-300 underline">← Back to edit requirements</button>
                </div>
              )}
            </div>

            <div className="px-6 py-4 bg-zinc-800/50 flex justify-end gap-2 shrink-0 border-t border-zinc-800">
              {!aiOptions ? (
                <>
                  <button onClick={()=>{setShowCreate(false); setAiOptions(null); setUseAI(false);}} className="px-4 py-2 rounded-full text-sm font-medium text-zinc-400 hover:text-white">Cancel</button>
                  {useAI ? (
                    <button onClick={handleAIGenerate} disabled={aiGenerating || !form.name.trim()} className="px-6 py-2 rounded-full text-sm font-semibold bg-violet-600 text-white hover:bg-violet-500 disabled:opacity-50 flex items-center gap-2">
                      {aiGenerating ? <><Loader2 size={16} className="animate-spin"/> Generating 3-4 plans...</> : <><Sparkles size={16}/> Generate {aiForm.count} Floor Plans</>}
                    </button>
                  ) : (
                    <button onClick={handleCreate} className="px-6 py-2 rounded-full text-sm font-semibold bg-white text-zinc-900 hover:bg-zinc-100">Create Project</button>
                  )}
                </>
              ) : (
                <button onClick={()=>{setShowCreate(false); setAiOptions(null);}} className="px-4 py-2 rounded-full text-sm font-medium text-zinc-400">Close</button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
