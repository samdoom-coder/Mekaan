import { useEffect, useRef } from "react";
import Header from "./components/common/Header";
import Toolbar from "./components/toolbar/Toolbar";
import Canvas from "./components/editor/Canvas";
import PropertiesPanel from "./components/properties/PropertiesPanel";
import StatusBar from "./components/common/StatusBar";
import AICommandBar from "./components/ai/AICommandBar";
import ProjectsView from "./components/projects/ProjectsView";
import { useUIStore } from "./stores/uiStore";
import { useDesignStore } from "./stores/designStore";
import { useProjectStore, hydrateProjects } from "./stores/projectStore";
import { useSelectionStore } from "./stores/selectionStore";
import { useHistoryStore, hydrateVersions } from "./stores/historyStore";
import { useViewportStore } from "./stores/viewportStore";

export default function App() {
  const ui = useUIStore();
  const designStore = useDesignStore();
  const projectStore = useProjectStore();
  const selection = useSelectionStore();
  const historyStore = useHistoryStore();

  // hydrate
  useEffect(() => {
    hydrateProjects();
    hydrateVersions();
    const proj = useProjectStore.getState().getCurrent();
    if (proj?.design) {
      useDesignStore.getState().setDesign(proj.design);
    } else {
      // ensure demo
      const demoProj = useProjectStore.getState().projects[0];
      if (demoProj?.design) useDesignStore.getState().setDesign(demoProj.design);
    }
  }, []);

  // autosave debounced
  const saveTimeout = useRef<number | null>(null);
  const lastDesignRef = useRef<string>("");
  useEffect(() => {
    const unsub = useDesignStore.subscribe((state) => {
      const d = state.design;
      if (!d) return;
      const str = JSON.stringify(d);
      if (str === lastDesignRef.current) return;
      lastDesignRef.current = str;
      ui.setSaveStatus("unsaved");
      if (saveTimeout.current) window.clearTimeout(saveTimeout.current);
      saveTimeout.current = window.setTimeout(() => {
        ui.setSaveStatus("saving");
        const proj = useProjectStore.getState().getCurrent();
        if (proj) {
          const projs = useProjectStore.getState().projects.map(p => p.id===proj.id ? {...p, design: JSON.parse(JSON.stringify(d)), updatedAt: new Date().toISOString()} : p);
          useProjectStore.setState({ projects: projs });
          localStorage.setItem("floorplan_projects", JSON.stringify(projs));
          // also try backend if available
          fetch(`/projects/${proj.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ design: d }) }).catch(()=>{});
          fetch(`/projects/${proj.id}/design`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ design: d }) }).catch(()=>{});
        }
        ui.setSaveStatus("saved");
      }, 900);
    });
    return () => unsub();
  }, [ui]);

  // keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) return;
      // tool shortcuts
      if (e.key.toLowerCase() === "v") ui.setTool("select");
      if (e.key.toLowerCase() === "r") ui.setTool("room");
      if (e.key.toLowerCase() === "w") ui.setTool("wall");
      if (e.key.toLowerCase() === "d" && !e.ctrlKey && !e.metaKey) ui.setTool("door");
      if (e.key.toLowerCase() === "n") ui.setTool("window");
      if (e.key.toLowerCase() === "m") ui.setTool("dimension");
      if (e.key.toLowerCase() === "f") ui.setTool("furniture");
      if (e.key === "Escape") {
        if (ui.tool !== "select") ui.setTool("select");
        else selection.clearSelection();
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        const sel = selection.selected[0];
        if (sel && designStore.design) {
          const floorId = sel.floorId;
          if (sel.type === "room") designStore.deleteRoom(floorId, sel.id);
          if (sel.type === "wall") designStore.deleteWall(floorId, sel.id);
          if (sel.type === "door") designStore.deleteDoor(floorId, sel.id);
          if (sel.type === "window") designStore.deleteWindow(floorId, sel.id);
          if (sel.type === "object") designStore.deleteObject(floorId, sel.id);
          if (sel.type === "dimension") designStore.deleteDimension(floorId, sel.id);
          selection.clearSelection();
        }
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) designStore.redo();
        else designStore.undo();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        designStore.redo();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c") {
        // copy
        if (selection.selected.length) {
          selection.copy();
          ui.pushToast("Copied", "info");
        }
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "v") {
        // duplicate
        const clip = selection.paste();
        if (clip && designStore.design) {
          const floorId = clip[0].floorId;
          const type = clip[0].type;
          const ids = clip.map(c=>c.id);
          (designStore as any).duplicateSelection?.(floorId, ids, type);
          ui.pushToast("Pasted", "info");
        }
      }
      if (e.key === "+" || e.key === "=") {
        useViewportStore.getState().zoomIn();
      }
      if (e.key === "-" || e.key === "_") {
        useViewportStore.getState().zoomOut();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [ui, selection, designStore]);

  return (
    <div className="h-screen flex flex-col bg-[#0f0f0f] text-zinc-100 overflow-hidden">
      <Header />
      {ui.view === "projects" ? (
        <ProjectsView />
      ) : (
        <div className="flex flex-1 overflow-hidden">
          <Toolbar />
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="flex flex-1 overflow-hidden">
              <Canvas />
              {ui.showProperties && <PropertiesPanel />}
            </div>
            <StatusBar />
            <AICommandBar />
          </div>
        </div>
      )}

      {/* Version history modal */}
      {ui.showVersionHistory && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl w-full max-w-lg max-h-[80vh] flex flex-col">
            <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between">
              <h3 className="font-semibold text-white">Version History</h3>
              <button onClick={()=>ui.toggleVersionHistory()} className="text-zinc-500 hover:text-white">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {historyStore.versions.length===0 ? (
                <p className="text-sm text-zinc-500 text-center py-8">No versions yet. Save a version to track history.</p>
              ) : historyStore.versions.map(v=>(
                <div key={v.id} className="bg-zinc-800 rounded-lg p-3 flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium text-white">{v.name}</div>
                    <div className="text-xs text-zinc-500">{new Date(v.createdAt).toLocaleString()}</div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={()=>{
                      const d = historyStore.restoreVersion(v.id);
                      if (d) { useDesignStore.getState().setDesign(d); ui.pushToast("Version restored", "success"); }
                    }} className="px-3 py-1.5 rounded-full bg-white text-zinc-900 text-xs font-medium">Restore</button>
                    <button onClick={()=>historyStore.deleteVersion(v.id)} className="px-3 py-1.5 rounded-full bg-zinc-700 text-zinc-300 text-xs">Delete</button>
                  </div>
                </div>
              ))}
            </div>
            <div className="p-4 border-t border-zinc-800 flex gap-2">
              <button onClick={()=>{
                const name = prompt("Version name");
                if (name && designStore.design) {
                  historyStore.addVersion(name, designStore.design);
                  ui.pushToast("Version saved", "success");
                }
              }} className="flex-1 bg-white text-zinc-900 py-2 rounded-full text-sm font-semibold">Save Current Version</button>
              <button onClick={()=>ui.toggleVersionHistory()} className="px-4 py-2 rounded-full bg-zinc-800 text-zinc-300 text-sm">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Toasts */}
      <div className="fixed bottom-20 right-4 flex flex-col gap-2 z-50">
        {ui.toasts.map(t=>(
          <div key={t.id} className={`px-4 py-2.5 rounded-lg text-sm shadow-lg border flex items-center gap-2 max-w-sm ${t.type==="error" ? "bg-red-600 border-red-700 text-white" : t.type==="success" ? "bg-emerald-600 border-emerald-700 text-white" : "bg-zinc-900 border-zinc-800 text-white"}`}>
            <span className="flex-1">{t.message}</span>
            <button onClick={()=>ui.dismissToast(t.id)} className="opacity-70 hover:opacity-100">✕</button>
          </div>
        ))}
      </div>
    </div>
  );
}
