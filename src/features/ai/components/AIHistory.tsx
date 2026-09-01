import { getAIHistory } from "../services/aiApi";

export function AIHistory({ onSelectPrompt }: { onSelectPrompt?: (p: string) => void }) {
  const hist = getAIHistory();
  if (hist.length === 0) return null;
  return (
    <div className="space-y-2">
      <div className="text-xs text-zinc-500 font-medium">Recent</div>
      {hist.slice(-4).reverse().map((h, i) => (
        <button
          key={i}
          onClick={() => onSelectPrompt?.(h.content)}
          className="w-full text-left bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-400 truncate"
        >
          <span className={h.role === "user" ? "text-zinc-300" : "text-violet-400"}>{h.role === "user" ? "You: " : "AI: "}</span>
          {h.content.slice(0, 80)}
        </button>
      ))}
    </div>
  );
}
