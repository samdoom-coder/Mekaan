import { useDesignStore } from "../../stores/designStore";
import { useSelectionStore } from "../../stores/selectionStore";
import { useUIStore } from "../../stores/uiStore";
import { formatDistance, formatArea } from "../../engine/measurement";
import { pointOnWall, wallLength } from "../../engine/geometry";
import { getFloorPolygon, getPlotArea } from "../../engine/plotShape";

export default function PropertiesPanel() {
  const { design } = useDesignStore();
  const ds = useDesignStore.getState();
  const selection = useSelectionStore();
  const ui = useUIStore();
  const floor = design?.floors[0];
  if (!design || !floor) return null;

  const selected = selection.selected[0];
  if (!selected) {
    const curShape = floor.plotShape?.type || "rectangle";
    const poly = getFloorPolygon(floor);
    const area = getPlotArea(poly);
    const setShape = (type: any) => {
      if (type === "custom") {
        ds.setFloorShape(floor.id, { type: "custom", polygon: poly });
        ui.setTool("plot");
        ui.pushToast("Plot tool active: click to add points, double-click or press Enter to finish, Esc to cancel", "info");
      } else if (type === "rectangle") {
        ds.setFloorShape(floor.id, { type: "rectangle" });
      } else if (type === "square") {
        ds.setFloorShape(floor.id, { type: "square" });
      } else if (type === "polygon") {
        const sides = floor.plotShape?.sides || 6;
        const radius = floor.plotShape?.radius || Math.min(floor.width, floor.height) * 0.45;
        const cx = floor.width / 2, cy = floor.height / 2;
        const pts = Array.from({ length: sides }, (_, i) => {
          const ang = -Math.PI / 2 + (i * 2 * Math.PI) / sides;
          return { x: cx + Math.cos(ang) * radius, y: cy + Math.sin(ang) * radius };
        });
        ds.setFloorShape(floor.id, { type: "polygon", sides, radius, polygon: pts });
      } else {
        ds.setFloorShape(floor.id, { type, notchWidth: Math.floor(floor.width * 0.3), notchHeight: Math.floor(floor.height * 0.3) });
      }
    };
    return (
      <div className="w-[300px] bg-[#171717] border-l border-zinc-800 flex flex-col shrink-0 overflow-y-auto">
        <div className="px-4 py-3 border-b border-zinc-800">
          <h3 className="text-[11px] tracking-widest uppercase text-zinc-400 font-semibold">Properties</h3>
          <p className="text-xs text-zinc-500 mt-1">Select an object to edit</p>
        </div>
        <div className="flex-1 p-4 space-y-4">
          <div className="rounded-lg bg-zinc-900 border border-zinc-800 p-4">
            <h4 className="text-sm font-medium text-white">Floor: {floor.name}</h4>
            <div className="mt-3 space-y-2 text-xs">
              <div className="flex justify-between"><span className="text-zinc-500">Outer</span><span className="text-zinc-200 font-mono">{floor.width}' × {floor.height}'</span></div>
              <div className="flex justify-between"><span className="text-zinc-500">Plot Area</span><span className="text-zinc-200 font-mono">{Math.round(area)} sq ft</span></div>
              <div className="flex justify-between"><span className="text-zinc-500">Rooms</span><span className="text-zinc-200">{floor.rooms.length}</span></div>
              <div className="flex justify-between"><span className="text-zinc-500">Walls</span><span className="text-zinc-200">{floor.walls.length}</span></div>
              <div className="flex justify-between"><span className="text-zinc-500">Doors/Windows</span><span className="text-zinc-200">{floor.doors.length}/{floor.windows.length}</span></div>
            </div>
          </div>

          <div className="rounded-lg bg-zinc-900 border border-zinc-800 p-3">
            <h4 className="text-[11px] uppercase tracking-widest text-zinc-400 font-semibold">Plot Shape</h4>
            <p className="text-[11px] text-zinc-500 mt-1">Choose preset or draw custom according to your plot</p>
            <div className="grid grid-cols-4 gap-1.5 mt-3">
              {(["rectangle","square","polygon","L","U","T","custom"] as const).map(s=>(
                <button key={s} onClick={()=>setShape(s)} className={`py-2 rounded-lg text-[11px] font-medium border flex flex-col items-center gap-1 ${curShape===s ? "bg-white text-zinc-900 border-white" : "bg-zinc-800 text-zinc-400 border-zinc-700 hover:border-zinc-600"}`}>
                  <span className="text-sm">{s==="rectangle"?"▭":s==="square"?"⬜":s==="polygon"?"⬡":s==="L"?"⌜":s==="U"?"⊔":s==="T"?"┬":"✏️"}</span>{s}
                </button>
              ))}
            </div>
            {curShape==="polygon" && (
              <div className="grid grid-cols-2 gap-2 mt-3">
                <div>
                  <label className="text-[10px] uppercase tracking-widest text-zinc-500">Sides (3-12)</label>
                  <input type="number" min={3} max={12} value={floor.plotShape?.sides ?? 6} onChange={e=>{
                    const sides = Math.max(3, Math.min(12, Number(e.target.value)||6));
                    const radius = floor.plotShape?.radius || Math.min(floor.width, floor.height)*0.45;
                    const cx=floor.width/2, cy=floor.height/2;
                    const pts = Array.from({length:sides}, (_,i)=>{ const ang=-Math.PI/2 + i*2*Math.PI/sides; return {x: cx+Math.cos(ang)*radius, y: cy+Math.sin(ang)*radius }; });
                    ds.setFloorShape(floor.id, { type:"polygon", sides, radius, polygon: pts });
                  }} className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-md px-2 py-1.5 text-xs text-white" />
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-widest text-zinc-500">Radius</label>
                  <input type="number" value={Math.round(floor.plotShape?.radius ?? Math.min(floor.width,floor.height)*0.45)} onChange={e=>{
                    const radius = Number(e.target.value)||10;
                    const sides = floor.plotShape?.sides || 6;
                    const cx=floor.width/2, cy=floor.height/2;
                    const pts = Array.from({length:sides}, (_,i)=>{ const ang=-Math.PI/2 + i*2*Math.PI/sides; return {x: cx+Math.cos(ang)*radius, y: cy+Math.sin(ang)*radius }; });
                    ds.setFloorShape(floor.id, { type:"polygon", sides, radius, polygon: pts });
                  }} className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-md px-2 py-1.5 text-xs text-white" />
                </div>
              </div>
            )}
            {(curShape==="L"||curShape==="U"||curShape==="T") && (
              <div className="grid grid-cols-2 gap-2 mt-3">
                <div>
                  <label className="text-[10px] uppercase tracking-widest text-zinc-500">Notch W</label>
                  <input type="number" value={floor.plotShape?.notchWidth ?? 12} onChange={e=>ds.setFloorShape(floor.id, { type: curShape as any, notchWidth: Number(e.target.value)||12, notchHeight: floor.plotShape?.notchHeight ?? 15 })} className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-md px-2 py-1.5 text-xs text-white" />
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-widest text-zinc-500">Notch H</label>
                  <input type="number" value={floor.plotShape?.notchHeight ?? 15} onChange={e=>ds.setFloorShape(floor.id, { type: curShape as any, notchWidth: floor.plotShape?.notchWidth ?? 12, notchHeight: Number(e.target.value)||15 })} className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-md px-2 py-1.5 text-xs text-white" />
                </div>
              </div>
            )}
            {curShape==="square" && <p className="text-[11px] text-zinc-400 mt-2">Square: {Math.min(floor.width,floor.height)} ft side • centered</p>}
            {curShape==="custom" && (
              <div className="mt-3">
                <button onClick={()=>{ ui.setTool("plot"); ui.pushToast("Plot tool: click to add points, double-click to finish", "info"); }} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-2 rounded-full text-xs font-semibold flex items-center justify-center gap-1.5">
                  <span>✏️</span> Draw Custom Plot
                </button>
                <p className="text-[11px] text-zinc-500 mt-2">Tip: Draw clockwise, at least 3 points. Press Enter or double-click to close. Click near first point to close.</p>
                <button onClick={()=>{ ds.setFloorShape(floor.id, { type: "rectangle" }); }} className="w-full mt-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 py-1.5 rounded-full text-xs">Reset to Rectangle</button>
              </div>
            )}
            <div className="mt-3 p-2 bg-zinc-800 rounded-md">
              <div className="text-[11px] text-zinc-500">Current: <span className="text-white font-medium capitalize">{curShape}</span> • {poly.length} points • {Math.round(area)} sq ft</div>
              <svg viewBox={`0 0 ${floor.width} ${floor.height}`} className="w-full h-20 mt-2 bg-[#f0fdf4] rounded border border-emerald-200">
                <polygon points={poly.map(p=>`${p.x},${p.y}`).join(" ")} fill="#dcfce7" stroke="#16a34a" strokeWidth={0.3} />
              </svg>
            </div>
          </div>

          <div className="rounded-lg bg-zinc-900 border border-zinc-800 p-3">
            <h4 className="text-[11px] uppercase tracking-widest text-zinc-400 font-semibold">Plot Dimensions</h4>
            <div className="grid grid-cols-2 gap-2 mt-2">
              <div>
                <label className="text-[10px] uppercase tracking-widest text-zinc-500">Width</label>
                <input type="number" value={floor.width} onChange={e=>ds.updateFloor(floor.id, { width: Number(e.target.value)||40 })} className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-md px-2 py-1.5 text-xs text-white" />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-widest text-zinc-500">Depth</label>
                <input type="number" value={floor.height} onChange={e=>ds.updateFloor(floor.id, { height: Number(e.target.value)||60 })} className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-md px-2 py-1.5 text-xs text-white" />
              </div>
            </div>
          </div>

          <div className="mt-2">
            <h4 className="text-[11px] uppercase tracking-widest text-zinc-500 font-semibold">Project</h4>
            <div className="mt-2 text-xs text-zinc-300">
              <div className="font-medium text-white">{design.name}</div>
              <div className="text-zinc-500 capitalize">{design.propertyType} • {design.units}</div>
              <div className="font-mono text-[11px] mt-1">{design.site.width} × {design.site.depth} {design.units}</div>
            </div>
          </div>
          <div className="mt-2">
            <h4 className="text-[11px] uppercase tracking-widest text-zinc-500 font-semibold">Shortcuts</h4>
            <div className="mt-2 grid grid-cols-2 gap-1.5 text-[11px]">
              <span className="text-zinc-500">Select</span><span className="text-zinc-300 font-mono">V</span>
              <span className="text-zinc-500">Room</span><span className="text-zinc-300 font-mono">R</span>
              <span className="text-zinc-500">Plot</span><span className="text-zinc-300 font-mono">P</span>
              <span className="text-zinc-500">Wall</span><span className="text-zinc-300 font-mono">W</span>
              <span className="text-zinc-500">Undo</span><span className="text-zinc-300 font-mono">Ctrl+Z</span>
              <span className="text-zinc-500">Delete</span><span className="text-zinc-300 font-mono">Del</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Find selected entity
  const room = floor.rooms.find(r=>r.id===selected.id && selected.type==="room");
  const wall = floor.walls.find(w=>w.id===selected.id && selected.type==="wall");
  const door = floor.doors.find(d=>d.id===selected.id && selected.type==="door");
  const win = floor.windows.find(w=>w.id===selected.id && selected.type==="window");
  const obj = floor.objects.find(o=>o.id===selected.id && selected.type==="object");
  const dim = floor.dimensions.find(d=>d.id===selected.id && selected.type==="dimension");

  const handleDelete = () => {
    if (room) ds.deleteRoom(floor.id, room.id);
    if (wall) ds.deleteWall(floor.id, wall.id);
    if (door) ds.deleteDoor(floor.id, door.id);
    if (win) ds.deleteWindow(floor.id, win.id);
    if (obj) ds.deleteObject(floor.id, obj.id);
    if (dim) ds.deleteDimension(floor.id, dim.id);
    selection.clearSelection();
  };

  return (
    <div className="w-[300px] bg-[#171717] border-l border-zinc-800 flex flex-col shrink-0 overflow-y-auto">
      <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
        <h3 className="text-[11px] tracking-widest uppercase text-zinc-400 font-semibold">{selected.type}</h3>
        <button onClick={handleDelete} className="text-[11px] bg-red-600 hover:bg-red-700 text-white px-2.5 py-1 rounded-md font-medium">Delete</button>
      </div>

      <div className="p-4 space-y-5">
        {room && (
          <>
            <div>
              <label className="text-[11px] uppercase tracking-widest text-zinc-500 font-semibold">Name</label>
              <input value={room.name} onChange={e=>ds.updateRoom(floor.id, room.id, {name:e.target.value})} className="mt-1 w-full bg-zinc-900 border border-zinc-800 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:border-zinc-700" />
            </div>
            <div>
              <label className="text-[11px] uppercase tracking-widest text-zinc-500 font-semibold">Type</label>
              <select value={room.type} onChange={e=>ds.updateRoom(floor.id, room.id, {type:e.target.value as any, name: e.target.value.replace("-"," ")})} className="mt-1 w-full bg-zinc-900 border border-zinc-800 rounded-md px-3 py-2 text-sm text-white">
                <option value="living-room">Living Room</option>
                <option value="bedroom">Bedroom</option>
                <option value="master-bedroom">Master Bedroom</option>
                <option value="kitchen">Kitchen</option>
                <option value="dining-room">Dining</option>
                <option value="bathroom">Bathroom</option>
                <option value="toilet">Toilet</option>
                <option value="study">Study</option>
                <option value="balcony">Balcony</option>
                <option value="garage">Garage</option>
                <option value="utility">Utility</option>
                <option value="store">Store</option>
                <option value="hall">Hall</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] uppercase tracking-widest text-zinc-500 font-semibold">Width</label>
                <div className="flex mt-1">
                  <input type="number" step={0.5} value={room.width} onChange={e=>ds.resizeRoom(floor.id, room.id, parseFloat(e.target.value)||room.width, room.height)} className="w-full bg-zinc-900 border border-zinc-800 rounded-l-md px-3 py-2 text-sm text-white" />
                  <span className="bg-zinc-800 border border-l-0 border-zinc-800 px-2 flex items-center text-xs text-zinc-400">ft</span>
                </div>
                <div className="text-[11px] text-zinc-500 mt-1 font-mono">{formatDistance(room.width, design.units)}</div>
              </div>
              <div>
                <label className="text-[11px] uppercase tracking-widest text-zinc-500 font-semibold">Height</label>
                <div className="flex mt-1">
                  <input type="number" step={0.5} value={room.height} onChange={e=>ds.resizeRoom(floor.id, room.id, room.width, parseFloat(e.target.value)||room.height)} className="w-full bg-zinc-900 border border-zinc-800 rounded-l-md px-3 py-2 text-sm text-white" />
                  <span className="bg-zinc-800 border border-l-0 border-zinc-800 px-2 flex items-center text-xs text-zinc-400">ft</span>
                </div>
                <div className="text-[11px] text-zinc-500 mt-1 font-mono">{formatDistance(room.height, design.units)}</div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] uppercase tracking-widest text-zinc-500 font-semibold">X</label>
                <input type="number" step={0.5} value={room.x} onChange={e=>ds.moveRoom(floor.id, room.id, parseFloat(e.target.value)||0, room.y)} className="mt-1 w-full bg-zinc-900 border border-zinc-800 rounded-md px-3 py-2 text-sm text-white" />
              </div>
              <div>
                <label className="text-[11px] uppercase tracking-widest text-zinc-500 font-semibold">Y</label>
                <input type="number" step={0.5} value={room.y} onChange={e=>ds.moveRoom(floor.id, room.id, room.x, parseFloat(e.target.value)||0)} className="mt-1 w-full bg-zinc-900 border border-zinc-800 rounded-md px-3 py-2 text-sm text-white" />
              </div>
            </div>
            <div>
              <label className="text-[11px] uppercase tracking-widest text-zinc-500 font-semibold">Rotation</label>
              <input type="range" min={0} max={360} step={15} value={room.rotation} onChange={e=>ds.updateRoom(floor.id, room.id, {rotation: parseInt(e.target.value)})} className="w-full mt-2" />
              <div className="text-xs text-zinc-400 mt-1">{room.rotation}°</div>
            </div>
            <div className="bg-zinc-900 rounded-lg p-3 border border-zinc-800">
              <div className="text-xs text-zinc-400">Area</div>
              <div className="text-sm font-mono text-white">{formatArea(room.width, room.height, design.units)} • {room.width * room.height} sq ft</div>
            </div>
          </>
        )}

        {wall && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] uppercase tracking-widest text-zinc-500 font-semibold">Thickness</label>
                <input type="number" step={0.1} value={wall.thickness} onChange={e=>ds.updateWall(floor.id, wall.id, {thickness: parseFloat(e.target.value)||0.5})} className="mt-1 w-full bg-zinc-900 border border-zinc-800 rounded-md px-3 py-2 text-sm text-white" />
              </div>
              <div>
                <label className="text-[11px] uppercase tracking-widest text-zinc-500 font-semibold">Type</label>
                <select value={wall.type} onChange={e=>ds.updateWall(floor.id, wall.id, {type:e.target.value as any})} className="mt-1 w-full bg-zinc-900 border border-zinc-800 rounded-md px-3 py-2 text-sm text-white">
                  <option value="exterior">Exterior</option>
                  <option value="interior">Interior</option>
                  <option value="partition">Partition</option>
                </select>
              </div>
            </div>
            <div>
              <label className="text-[11px] uppercase tracking-widest text-zinc-500 font-semibold">Length</label>
              <div className="mt-1 text-sm font-mono text-white bg-zinc-900 border border-zinc-800 rounded-md px-3 py-2">{wallLength(wall).toFixed(2)} ft • {formatDistance(wallLength(wall), design.units)}</div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] uppercase tracking-widest text-zinc-500 font-semibold">Start X/Y</label>
                <div className="mt-1 flex gap-1">
                  <input type="number" value={wall.start.x.toFixed(1)} onChange={e=>ds.updateWall(floor.id, wall.id, {start:{...wall.start, x: parseFloat(e.target.value)||0}})} className="w-full bg-zinc-900 border border-zinc-800 rounded-md px-2 py-1.5 text-xs text-white" />
                  <input type="number" value={wall.start.y.toFixed(1)} onChange={e=>ds.updateWall(floor.id, wall.id, {start:{...wall.start, y: parseFloat(e.target.value)||0}})} className="w-full bg-zinc-900 border border-zinc-800 rounded-md px-2 py-1.5 text-xs text-white" />
                </div>
              </div>
              <div>
                <label className="text-[11px] uppercase tracking-widest text-zinc-500 font-semibold">End X/Y</label>
                <div className="mt-1 flex gap-1">
                  <input type="number" value={wall.end.x.toFixed(1)} onChange={e=>ds.updateWall(floor.id, wall.id, {end:{...wall.end, x: parseFloat(e.target.value)||0}})} className="w-full bg-zinc-900 border border-zinc-800 rounded-md px-2 py-1.5 text-xs text-white" />
                  <input type="number" value={wall.end.y.toFixed(1)} onChange={e=>ds.updateWall(floor.id, wall.id, {end:{...wall.end, y: parseFloat(e.target.value)||0}})} className="w-full bg-zinc-900 border border-zinc-800 rounded-md px-2 py-1.5 text-xs text-white" />
                </div>
              </div>
            </div>
          </>
        )}

        {door && (
          <>
            <div>
              <label className="text-[11px] uppercase tracking-widest text-zinc-500 font-semibold">Wall</label>
              <select value={door.wallId} onChange={e=>ds.updateDoor(floor.id, door.id, {wallId:e.target.value})} className="mt-1 w-full bg-zinc-900 border border-zinc-800 rounded-md px-3 py-2 text-sm text-white">
                {floor.walls.map(w=><option key={w.id} value={w.id}>{w.id.slice(0,8)} • {wallLength(w).toFixed(1)}ft</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] uppercase tracking-widest text-zinc-500 font-semibold">Position</label>
                <input type="range" min={0} max={1} step={0.05} value={door.position} onChange={e=>ds.updateDoor(floor.id, door.id, {position: parseFloat(e.target.value)})} className="w-full mt-2" />
                <div className="text-xs text-zinc-500">{Math.round(door.position*100)}%</div>
              </div>
              <div>
                <label className="text-[11px] uppercase tracking-widest text-zinc-500 font-semibold">Width</label>
                <input type="number" step={0.5} value={door.width} onChange={e=>ds.updateDoor(floor.id, door.id, {width: parseFloat(e.target.value)||3})} className="mt-1 w-full bg-zinc-900 border border-zinc-800 rounded-md px-3 py-2 text-sm text-white" />
              </div>
            </div>
            <div>
              <label className="text-[11px] uppercase tracking-widest text-zinc-500 font-semibold">Swing</label>
              <div className="mt-2 flex gap-2">
                <button onClick={()=>ds.updateDoor(floor.id, door.id, {swingDirection:"left"})} className={`flex-1 py-2 rounded-md text-sm border ${door.swingDirection==="left" ? "bg-white text-zinc-900 border-white" : "bg-zinc-900 text-zinc-400 border-zinc-800"}`}>Left</button>
                <button onClick={()=>ds.updateDoor(floor.id, door.id, {swingDirection:"right"})} className={`flex-1 py-2 rounded-md text-sm border ${door.swingDirection==="right" ? "bg-white text-zinc-900 border-white" : "bg-zinc-900 text-zinc-400 border-zinc-800"}`}>Right</button>
              </div>
            </div>
          </>
        )}

        {win && (
          <>
            <div>
              <label className="text-[11px] uppercase tracking-widest text-zinc-500 font-semibold">Wall</label>
              <select value={win.wallId} onChange={e=>ds.updateWindow(floor.id, win.id, {wallId:e.target.value})} className="mt-1 w-full bg-zinc-900 border border-zinc-800 rounded-md px-3 py-2 text-sm text-white">
                {floor.walls.map(w=><option key={w.id} value={w.id}>{w.id.slice(0,8)}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] uppercase tracking-widest text-zinc-500 font-semibold">Position</label>
                <input type="range" min={0} max={1} step={0.05} value={win.position} onChange={e=>ds.updateWindow(floor.id, win.id, {position: parseFloat(e.target.value)})} className="w-full mt-2" />
              </div>
              <div>
                <label className="text-[11px] uppercase tracking-widest text-zinc-500 font-semibold">Width</label>
                <input type="number" step={0.5} value={win.width} onChange={e=>ds.updateWindow(floor.id, win.id, {width: parseFloat(e.target.value)||4})} className="mt-1 w-full bg-zinc-900 border border-zinc-800 rounded-md px-3 py-2 text-sm text-white" />
              </div>
            </div>
          </>
        )}

        {obj && (
          <>
            <div>
              <label className="text-[11px] uppercase tracking-widest text-zinc-500 font-semibold">Type</label>
              <div className="mt-1 text-sm text-white capitalize bg-zinc-900 border border-zinc-800 rounded-md px-3 py-2">{obj.type}</div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] uppercase tracking-widest text-zinc-500 font-semibold">X / Y</label>
                <div className="flex gap-1 mt-1">
                  <input type="number" value={obj.x.toFixed(1)} onChange={e=>ds.updateObject(floor.id, obj.id, {x: parseFloat(e.target.value)||0})} className="w-full bg-zinc-900 border border-zinc-800 rounded-md px-2 py-2 text-sm text-white" />
                  <input type="number" value={obj.y.toFixed(1)} onChange={e=>ds.updateObject(floor.id, obj.id, {y: parseFloat(e.target.value)||0})} className="w-full bg-zinc-900 border border-zinc-800 rounded-md px-2 py-2 text-sm text-white" />
                </div>
              </div>
              <div>
                <label className="text-[11px] uppercase tracking-widest text-zinc-500 font-semibold">W / H</label>
                <div className="flex gap-1 mt-1">
                  <input type="number" value={obj.width} onChange={e=>ds.updateObject(floor.id, obj.id, {width: parseFloat(e.target.value)||2})} className="w-full bg-zinc-900 border border-zinc-800 rounded-md px-2 py-2 text-sm text-white" />
                  <input type="number" value={obj.height} onChange={e=>ds.updateObject(floor.id, obj.id, {height: parseFloat(e.target.value)||2})} className="w-full bg-zinc-900 border border-zinc-800 rounded-md px-2 py-2 text-sm text-white" />
                </div>
              </div>
            </div>
            <div>
              <label className="text-[11px] uppercase tracking-widest text-zinc-500 font-semibold">Rotation</label>
              <input type="range" min={0} max={360} step={15} value={obj.rotation} onChange={e=>ds.updateObject(floor.id, obj.id, {rotation: parseInt(e.target.value)})} className="w-full mt-2" />
              <div className="text-xs text-zinc-400">{obj.rotation}°</div>
            </div>
          </>
        )}

        {dim && (
          <div className="text-xs text-zinc-500">
            Dimension from ({dim.start.x.toFixed(1)}, {dim.start.y.toFixed(1)}) to ({dim.end.x.toFixed(1)}, {dim.end.y.toFixed(1)})
          </div>
        )}
      </div>
    </div>
  );
}
