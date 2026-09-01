import type { AICommand } from "../commands/commandTypes";
import type { Design } from "../../../types/design";

export function AIChangePreview({ commands, design, onApply, onCancel }: {
  commands: AICommand[];
  design: Design;
  onApply: () => void;
  onCancel: () => void;
}) {
  const floor = design.floors[0];
  if (!floor) return null;

  const descriptions: string[] = [];
  for (const c of commands) {
    const p = c.parameters as Record<string, unknown>;
    try {
      if (c.type === "RESIZE_ROOM") {
        const rid = (p.roomId as string) || (p.room_id as string);
        const room = floor.rooms.find(r => r.id === rid);
        const name = room?.name || rid;
        if (p.width != null && p.height != null) descriptions.push(`• ${name}: → ${p.width} × ${p.height} ft`);
        else if (p.width != null) descriptions.push(`• ${name} width → ${p.width} ft`);
        else if (p.height != null) descriptions.push(`• ${name} height → ${p.height} ft`);
        else if (p.widthDelta != null) descriptions.push(`• ${name} width ${Number(p.widthDelta) > 0 ? "+" : ""}${p.widthDelta} ft`);
        else if (p.heightDelta != null) descriptions.push(`• ${name} height ${Number(p.heightDelta) > 0 ? "+" : ""}${p.heightDelta} ft`);
        else descriptions.push(`• Resize ${name}`);
      } else if (c.type === "CREATE_ROOM") {
        descriptions.push(`• Create ${p.name || p.roomType || "room"}`);
      } else if (c.type === "DELETE_ROOM") {
        const rid = (p.roomId as string) || "";
        const room = floor.rooms.find(r => r.id === rid);
        descriptions.push(`• Delete ${room?.name || rid}`);
      } else if (c.type === "MOVE_ROOM") {
        const rid = (p.roomId as string) || "";
        const room = floor.rooms.find(r => r.id === rid);
        descriptions.push(`• Move ${room?.name || rid}${p.position ? ` to ${p.position}` : ""}`);
      } else if (c.type === "CREATE_WINDOW") {
        const rid = (p.roomId as string) || "";
        const room = floor.rooms.find(r => r.id === rid);
        descriptions.push(`• Add window${room ? ` to ${room.name}` : ""}`);
      } else if (c.type === "DELETE_WINDOW" || c.type === "DELETE_DOOR" || c.type === "DELETE_WALL") {
        descriptions.push(`• ${c.type.replace(/_/g, " ")}`);
      } else {
        descriptions.push(`• ${c.type}`);
      }
    } catch {
      descriptions.push(`• ${c.type}`);
    }
  }

  const isDestructive = commands.some(c => c.type.startsWith("DELETE_"));
  const isMulti = commands.length > 1;

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
      <div className="flex items-center gap-2 text-sm font-medium text-white mb-3">
        <span className="text-violet-400">✨</span> AI Suggestion
        {isDestructive && <span className="text-[11px] bg-amber-500/20 text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded-full">Review needed</span>}
      </div>
      <div className="text-sm text-zinc-300 whitespace-pre-wrap mb-3">
        Changes:
        <div className="mt-2 space-y-1 text-xs text-zinc-400 bg-zinc-800 rounded-lg p-3 border border-zinc-700">
          {descriptions.map((d, i) => <div key={i}>{d}</div>)}
          {isMulti && <div className="text-zinc-500 mt-2">Will be applied sequentially with validation</div>}
        </div>
      </div>
      <div className="flex gap-2">
        <button onClick={onCancel} className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-full py-2 text-sm font-medium border border-zinc-700">Cancel</button>
        <button onClick={onApply} className="flex-1 bg-white hover:bg-zinc-100 text-zinc-900 rounded-full py-2 text-sm font-semibold">Apply</button>
      </div>
    </div>
  );
}
