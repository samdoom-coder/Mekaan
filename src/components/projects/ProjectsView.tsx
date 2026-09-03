import { useState } from "react";
import { useProjectStore } from "../../stores/projectStore";
import { useDesignStore } from "../../stores/designStore";
import { useUIStore } from "../../stores/uiStore";
import { useGenerationStore } from "../../features/generation/generationStore";
import { Plus, Trash2, Clock, Layers, Ruler, Home, Sparkles, X } from "lucide-react";
import { getFloorPolygon } from "../../utils/floorShape";
import type { Design } from "../../types/design";

export default function ProjectsView() {
  const projectStore = useProjectStore();
  const ui = useUIStore();
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: "", propertyType: "residential", units: "feet", width: 40, depth: 60, floors: 1, plotShape: "rectangle" as any, notchW: 12, notchH: 15, polySides: 6, polyRadius: 18, drawCustom: false });

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
  };

  /** Start from a blank project and open the Phase 3 generation wizard.
   *  The wizard owns plot, program and layout — this card stays manual-only. */
  const handleGenerateWithAI = () => {
    const proj = projectStore.createProject({
      name: `AI Plan ${new Date().toLocaleDateString()}`,
      propertyType: "residential",
      units: "feet",
      width: 40,
      depth: 60,
      floors: 1,
    });
    const W = 40, H = 60;
    const blank: Design = {
      ...(proj.design as Design),
      site: { width: W, depth: H },
      floors: [{
        id: "floor_ground",
        name: "Ground Floor",
        level: 0,
        width: W,
        height: H,
        rooms: [],
        walls: [
          { id: `wall_${Math.random().toString(36).slice(2, 7)}`, start: { x: 0, y: 0 }, end: { x: W, y: 0 }, thickness: 0.5, height: 9, type: "exterior" },
          { id: `wall_${Math.random().toString(36).slice(2, 7)}`, start: { x: W, y: 0 }, end: { x: W, y: H }, thickness: 0.5, height: 9, type: "exterior" },
          { id: `wall_${Math.random().toString(36).slice(2, 7)}`, start: { x: W, y: H }, end: { x: 0, y: H }, thickness: 0.5, height: 9, type: "exterior" },
          { id: `wall_${Math.random().toString(36).slice(2, 7)}`, start: { x: 0, y: H }, end: { x: 0, y: 0 }, thickness: 0.5, height: 9, type: "exterior" },
        ],
        doors: [],
        windows: [],
        objects: [],
        dimensions: [],
        annotations: [],
      }],
    };
    projectStore.updateProject(proj.id, { design: blank } as any);
    useDesignStore.getState().setDesign(blank);
    ui.setView("editor");
    const g = useGenerationStore.getState();
    g.resetRequest();
    g.setStep(0);
    g.setOpen(true);
  };

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
          <div className="flex items-center gap-2">
            <button onClick={handleGenerateWithAI} title="Start from an architectural brief — plot, rooms, layout options" className="bg-white text-zinc-900 px-4 py-2 rounded-full text-sm font-semibold flex items-center gap-2 hover:bg-zinc-100">
              <Sparkles size={16} /> Generate with AI
            </button>
            <button onClick={()=>setShowCreate(true)} className="bg-zinc-900 border border-zinc-700 text-zinc-200 px-4 py-2 rounded-full text-sm font-medium flex items-center gap-2 hover:bg-zinc-800">
              <Plus size={16} /> New Project
            </button>
          </div>
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
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full my-6 max-h-[90vh] flex flex-col overflow-hidden shadow-2xl max-w-md">
            <div className="px-6 py-4 border-b border-zinc-800 shrink-0 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                  Create New Project
                </h2>
                <p className="text-xs text-zinc-500 mt-1">Set up your plot and property type — or use Generate with AI for a full plan from a brief</p>
              </div>
              <button onClick={()=>{setShowCreate(false);}} className="text-zinc-500 hover:text-white"><X size={18}/></button>
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

            </div>

            <div className="px-6 py-4 bg-zinc-800/50 flex justify-end gap-2 shrink-0 border-t border-zinc-800">
              <button onClick={()=>{setShowCreate(false);}} className="px-4 py-2 rounded-full text-sm font-medium text-zinc-400 hover:text-white">Cancel</button>
              <button onClick={handleCreate} className="px-6 py-2 rounded-full text-sm font-semibold bg-white text-zinc-900 hover:bg-zinc-100">Create Project</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
