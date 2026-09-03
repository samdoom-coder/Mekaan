import { Undo2, Redo2, Save, Download, FolderOpen, Layers, History, Sparkles, Settings, Box } from "lucide-react";
import { useDesignStore } from "../../stores/designStore";
import { useProjectStore } from "../../stores/projectStore";
import { useUIStore } from "../../stores/uiStore";
import { useHistoryStore } from "../../stores/historyStore";
import { useGenerationStore } from "../../features/generation/generationStore";

export default function Header() {
  const designStore = useDesignStore();
  const projectStore = useProjectStore();
  const ui = useUIStore();
  const design = designStore.design;
  const project = projectStore.getCurrent();
  const canUndo = designStore.canUndo();
  const canRedo = designStore.canRedo();

  const handleSave = () => {
    if (!design || !project) return;
    // save to localStorage and mock backend
    ui.setSaveStatus("saving");
    setTimeout(() => {
      projectStore.updateProject(project.id, { design } as any);
      // also update design in project
      const idx = projectStore.projects.findIndex(p=>p.id===project.id);
      if (idx>=0) {
        const projs = [...projectStore.projects];
        projs[idx] = { ...projs[idx], design: JSON.parse(JSON.stringify(design)), updatedAt: new Date().toISOString() };
        localStorage.setItem("floorplan_projects", JSON.stringify(projs));
        useProjectStore.setState({ projects: projs });
      }
      ui.setSaveStatus("saved");
      ui.pushToast("Project saved", "success");
    }, 600);
  };

  const handleExportJSON = () => {
    if (!design) return;
    const blob = new Blob([JSON.stringify(design, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${design.name || "floorplan"}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportSVG = () => {
    const svg = document.querySelector("svg");
    if (!svg) return;
    const clone = svg.cloneNode(true) as SVGElement;
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    const serializer = new XMLSerializer();
    const source = serializer.serializeToString(clone);
    const blob = new Blob([source], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${design?.name || "floorplan"}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <header className="h-[52px] bg-[#0f0f0f] border-b border-zinc-800 flex items-center px-3 gap-3 shrink-0">
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center">
          <Box size={16} className="text-zinc-900" />
        </div>
        <div>
          <div className="text-[13px] font-semibold text-white leading-none tracking-tight">Floorplan Studio</div>
          <div className="text-[10px] tracking-widest uppercase text-zinc-500 font-medium">V1 • 2D Editor</div>
        </div>
      </div>

      <div className="h-6 w-px bg-zinc-800 mx-1" />

      <button onClick={()=>ui.setView("projects")} className={`px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 ${ui.view==="projects" ? "bg-white text-zinc-900" : "text-zinc-400 hover:text-white hover:bg-zinc-800"}`}>
        <FolderOpen size={14} /> Projects
      </button>
      <button onClick={()=>ui.setView("editor")} className={`px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 ${ui.view==="editor" ? "bg-white text-zinc-900" : "text-zinc-400 hover:text-white hover:bg-zinc-800"}`}>
        <Layers size={14} /> Editor
      </button>
      <span className="hidden lg:flex items-center gap-1.5 text-[11px] text-zinc-600 ml-2">
        <span className="px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-800">3D</span>
        <span className="px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-800">Materials</span>
        <span className="px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-800">Export</span>
        <span className="opacity-50">coming soon</span>
      </span>

      <div className="flex-1 flex items-center justify-center gap-2">
        <div className="hidden md:flex items-center gap-1 bg-zinc-900 border border-zinc-800 rounded-full px-1 py-1">
          <button onClick={()=>designStore.undo()} disabled={!canUndo} className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-zinc-800 disabled:opacity-30 text-zinc-300">
            <Undo2 size={14} />
          </button>
          <button onClick={()=>designStore.redo()} disabled={!canRedo} className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-zinc-800 disabled:opacity-30 text-zinc-300">
            <Redo2 size={14} />
          </button>
          <div className="h-4 w-px bg-zinc-800 mx-1" />
          <span className="text-xs font-medium text-white px-2 min-w-[140px] text-center truncate">{project?.name || design?.name || "Untitled Project"}</span>
        </div>
        <div className="hidden lg:flex items-center gap-1 text-[11px] text-zinc-500">
          <span className={`w-2 h-2 rounded-full ${ui.saveStatus==="saved" ? "bg-emerald-500" : ui.saveStatus==="saving" ? "bg-amber-500 animate-pulse" : "bg-zinc-500"}`} />
          {ui.saveStatus==="saved" ? "Saved" : ui.saveStatus==="saving" ? "Saving..." : "Unsaved changes"}
        </div>
      </div>

      <div className="flex items-center gap-1.5">
        <button
          onClick={() => {
            const d = useDesignStore.getState().design;
            if (d) {
              const site = d.site;
              const unit = d.units === "meters" ? "m" : d.units === "centimeters" ? "cm" : d.units === "inches" ? "in" : "ft";
              useGenerationStore.getState().updateRequest({ plot: { width: site.width, depth: site.depth, unit }, projectId: d.id });
            }
            useGenerationStore.getState().setOpen(true);
          }}
          title="Generate a complete floor plan from an architectural brief"
          className="hidden sm:flex items-center gap-1.5 bg-white text-zinc-900 px-3.5 py-1.5 rounded-full text-xs font-semibold hover:bg-zinc-100"
        >
          <Sparkles size={14} /> Generate with AI
        </button>
        <button onClick={()=>ui.toggleVersionHistory()} title="Version History" className="hidden sm:flex items-center gap-1.5 bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1.5 rounded-full text-xs font-medium hover:bg-zinc-800">
          <History size={14} /> Versions
        </button>
        <button onClick={handleSave} className="hidden sm:flex items-center gap-1.5 bg-white text-zinc-900 px-3 py-1.5 rounded-full text-xs font-semibold hover:bg-zinc-100">
          <Save size={14} /> Save
        </button>
        <div className="hidden sm:flex bg-zinc-900 border border-zinc-800 rounded-full p-1 gap-1">
          <button onClick={handleExportJSON} title="Export JSON" className="w-7 h-7 rounded-full bg-zinc-800 hover:bg-zinc-700 flex items-center justify-center text-zinc-300">
            <Download size={14} />
          </button>
          <button onClick={handleExportSVG} title="Export SVG" className="w-7 h-7 rounded-full bg-zinc-800 hover:bg-zinc-700 flex items-center justify-center text-zinc-300">
            <span className="text-[9px] font-bold">SVG</span>
          </button>
        </div>
        <button onClick={()=>ui.pushToast("Collaboration coming in V7", "info")} className="w-8 h-8 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-400 hover:text-white">
          <Settings size={14} />
        </button>
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-indigo-500 flex items-center justify-center text-white text-xs font-bold">A</div>
      </div>
    </header>
  );
}
