import { useViewportStore } from "../../stores/viewportStore";
import { useUIStore } from "../../stores/uiStore";
import { Minus, Plus, Maximize2 } from "lucide-react";
import { useDesignStore } from "../../stores/designStore";

export default function StatusBar() {
  const vp = useViewportStore();
  const ui = useUIStore();
  const design = useDesignStore(s=>s.design);
  const floor = design?.floors[0];
  return (
    <div className="h-[32px] bg-[#0f0f0f] border-t border-zinc-800 flex items-center px-3 gap-3 text-xs shrink-0">
      <div className="flex items-center gap-1 bg-zinc-900 border border-zinc-800 rounded-full px-1 py-0.5">
        <button onClick={()=>vp.zoomOut()} className="w-6 h-6 rounded-full hover:bg-zinc-800 flex items-center justify-center text-zinc-400"><Minus size={12} /></button>
        <span className="font-mono text-[11px] text-white min-w-[48px] text-center">{Math.round(vp.zoom * 5)}%</span>
        <button onClick={()=>vp.zoomIn()} className="w-6 h-6 rounded-full hover:bg-zinc-800 flex items-center justify-center text-zinc-400"><Plus size={12} /></button>
      </div>
      {floor && (
        <button onClick={()=>{
          const container = document.querySelector("div.flex-1.relative") as HTMLElement;
          if (container) {
            const rect = container.getBoundingClientRect();
            vp.fitToFloor(floor.width, floor.height, rect.width, rect.height);
          }
        }} className="flex items-center gap-1 text-zinc-400 hover:text-white">
          <Maximize2 size={12} /> Fit
        </button>
      )}
      <div className="h-4 w-px bg-zinc-800" />
      <button onClick={()=>vp.setViewport({showGrid: !vp.showGrid})} className={`px-2.5 py-1 rounded-full text-[11px] font-medium border ${vp.showGrid ? "bg-white text-zinc-900 border-white" : "bg-zinc-900 text-zinc-500 border-zinc-800"}`}>Grid {vp.showGrid ? "On" : "Off"}</button>
      <button onClick={()=>vp.setViewport({snapToGrid: !vp.snapToGrid})} className={`px-2.5 py-1 rounded-full text-[11px] font-medium border ${vp.snapToGrid ? "bg-blue-600 text-white border-blue-600" : "bg-zinc-900 text-zinc-500 border-zinc-800"}`}>Snap {vp.snapToGrid ? "On" : "Off"}</button>
      <div className="flex items-center gap-1">
        <span className="text-zinc-500">Grid</span>
        <select value={vp.gridSize} onChange={e=>vp.setViewport({gridSize: parseFloat(e.target.value)})} className="bg-zinc-900 border border-zinc-800 rounded-md px-1.5 py-0.5 text-[11px] text-white">
          <option value={0.5}>0.5 ft</option>
          <option value={1}>1 ft</option>
          <option value={2}>2 ft</option>
          <option value={5}>5 ft</option>
        </select>
      </div>
      <div className="flex items-center gap-1">
        <span className="text-zinc-500">Units</span>
        <select value={vp.units} onChange={e=>vp.setViewport({units: e.target.value as any})} className="bg-zinc-900 border border-zinc-800 rounded-md px-1.5 py-0.5 text-[11px] text-white">
          <option value="feet">Feet</option>
          <option value="meters">Meters</option>
          <option value="centimeters">Centimeters</option>
          <option value="inches">Inches</option>
        </select>
      </div>
      <div className="flex-1" />
      <div className="hidden md:flex items-center gap-3 text-[11px] text-zinc-500">
        <span>Space+Drag = Pan</span>
        <span>Scroll = Zoom</span>
        <span className="text-zinc-600">|</span>
        <span className="text-white font-medium">{ui.tool}</span>
      </div>
      <div className={`hidden lg:flex items-center gap-1.5 text-[11px] ${ui.saveStatus==="saved" ? "text-emerald-400" : ui.saveStatus==="saving" ? "text-amber-400" : "text-zinc-500"}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${ui.saveStatus==="saved" ? "bg-emerald-500" : ui.saveStatus==="saving" ? "bg-amber-500 animate-pulse" : "bg-zinc-500"}`} />
        {ui.saveStatus==="saved" ? "Saved" : ui.saveStatus==="saving" ? "Saving..." : "Unsaved"}
      </div>
    </div>
  );
}
