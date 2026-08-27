import { MousePointer2, Square, Minus, DoorOpen, AppWindow, Ruler, Sofa, LayoutGrid, Magnet, Pentagon, PenTool } from "lucide-react";
import { useUIStore } from "../../stores/uiStore";
import { useViewportStore } from "../../stores/viewportStore";

const tools = [
  { id: "select", label: "Select", icon: MousePointer2, shortcut: "V" },
  { id: "room", label: "Room", icon: Square, shortcut: "R" },
  { id: "wall", label: "Wall", icon: Minus, shortcut: "W" },
  { id: "door", label: "Door", icon: DoorOpen, shortcut: "D" },
  { id: "window", label: "Window", icon: AppWindow, shortcut: "N" },
  { id: "dimension", label: "Dimension", icon: Ruler, shortcut: "M" },
  { id: "furniture", label: "Furniture", icon: Sofa, shortcut: "F" },
  { id: "plot", label: "Plot", icon: Pentagon, shortcut: "P" },
] as const;

const roomTypes = [
  "living-room","bedroom","master-bedroom","kitchen","dining-room","bathroom","toilet","study","balcony","garage","utility","store","hall","other"
];
const furnitureTypes = ["bed","sofa","dining-table","chair","kitchen-counter","toilet","sink","shower","bathtub","wardrobe","car"];

export default function Toolbar() {
  const ui = useUIStore();
  const vp = useViewportStore();
  return (
    <div className="w-[64px] bg-[#171717] border-r border-zinc-800 flex flex-col items-center py-3 gap-1 shrink-0">
      {tools.map(t => {
        const active = ui.tool === t.id;
        const Icon = t.icon;
        return (
          <button
            key={t.id}
            onClick={() => ui.setTool(t.id as any)}
            title={`${t.label} (${t.shortcut})`}
            className={`w-[44px] h-[44px] rounded-lg flex flex-col items-center justify-center gap-0.5 transition-colors ${active ? "bg-white text-zinc-900" : "text-zinc-400 hover:text-white hover:bg-zinc-800"}`}
          >
            <Icon size={18} strokeWidth={active ? 2.2 : 1.9} />
            <span className="text-[9px] tracking-wide font-medium leading-none">{t.shortcut}</span>
          </button>
        );
      })}
      <div className="h-px w-8 bg-zinc-800 my-2" />
      {/* Room type selector when room tool */}
      {ui.tool === "room" && (
        <div className="w-full px-1">
          <div className="text-[10px] text-zinc-500 uppercase tracking-widest text-center mb-1">Room</div>
          <select value={ui.roomType} onChange={e=>ui.setRoomType(e.target.value)} className="w-full bg-zinc-800 text-zinc-200 text-[11px] rounded-md px-1 py-1.5 border border-zinc-700">
            {roomTypes.map(rt=><option key={rt} value={rt}>{rt.replace("-"," ")}</option>)}
          </select>
        </div>
      )}
      {ui.tool === "furniture" && (
        <div className="w-full px-1">
          <div className="text-[10px] text-zinc-500 uppercase tracking-widest text-center mb-1">Object</div>
          <select value={ui.furnitureType} onChange={e=>ui.setFurnitureType(e.target.value)} className="w-full bg-zinc-800 text-zinc-200 text-[11px] rounded-md px-1 py-1.5 border border-zinc-700">
            {furnitureTypes.map(ft=><option key={ft} value={ft}>{ft}</option>)}
          </select>
        </div>
      )}
      <div className="mt-auto flex flex-col items-center gap-2 py-2">
        <button onClick={()=>vp.setViewport({showGrid: !vp.showGrid})} title="Toggle Grid (G)" className={`w-8 h-8 rounded-md flex items-center justify-center ${vp.showGrid ? "bg-zinc-800 text-white" : "text-zinc-500 hover:text-zinc-300"}`}>
          <LayoutGrid size={14} />
        </button>
        <button onClick={()=>vp.setViewport({snapToGrid: !vp.snapToGrid})} title="Toggle Snap (S)" className={`w-8 h-8 rounded-md flex items-center justify-center ${vp.snapToGrid ? "bg-blue-600 text-white" : "text-zinc-500 hover:text-zinc-300"}`}>
          <Magnet size={14} />
        </button>
      </div>
    </div>
  );
}
