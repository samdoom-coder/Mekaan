import type { AICommand } from "../commands/commandTypes";

export function AIResponse({ message, commands, onApply, onCancel, isPreview }: {
  message: string;
  commands: AICommand[];
  onApply?: () => void;
  onCancel?: () => void;
  isPreview?: boolean;
}) {
  if (!message && commands.length === 0) return null;
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-sm text-zinc-300">
      <div className="flex gap-2">
        <span className="text-violet-400">✨</span>
        <span className="flex-1 whitespace-pre-wrap leading-relaxed">{message}</span>
      </div>
      {commands.length > 0 && (
        <div className="mt-3 space-y-2">
          <div className="text-xs text-zinc-500">{commands.length} command{commands.length > 1 ? "s" : ""}:</div>
          <div className="space-y-1">
            {commands.map((c, i) => (
              <div key={c.id || i} className="flex items-center gap-2 bg-zinc-800 rounded-lg px-3 py-2 border border-zinc-700">
                <span className="text-[11px] font-mono bg-zinc-700 text-zinc-200 px-1.5 py-0.5 rounded">{c.type}</span>
                <span className="text-xs text-zinc-400 truncate flex-1">{JSON.stringify(c.parameters)}</span>
              </div>
            ))}
          </div>
          {isPreview && onApply && onCancel && (
            <div className="flex gap-2 pt-2">
              <button onClick={onCancel} className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-full py-2 text-sm font-medium border border-zinc-700">Cancel</button>
              <button onClick={onApply} className="flex-1 bg-white hover:bg-zinc-100 text-zinc-900 rounded-full py-2 text-sm font-semibold">Apply</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
