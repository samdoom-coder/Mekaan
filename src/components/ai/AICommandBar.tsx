import { useState } from "react";
import { Sparkles, Send, Loader2 } from "lucide-react";
import { useUIStore } from "../../stores/uiStore";
import { useDesignStore } from "../../stores/designStore";

export default function AICommandBar() {
  const [input, setInput] = useState("");
  const [isMock, setIsMock] = useState(false);
  const [response, setResponse] = useState<string | null>(null);
  const ui = useUIStore();
  const design = useDesignStore(s=>s.design);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    setIsMock(true);
    setResponse(null);
    // mock delay
    setTimeout(() => {
      setIsMock(false);
      setResponse(
        `AI integration coming soon.\n\nExample commands:\n• Make the kitchen 2 feet larger\n• Add a bathroom beside the master bedroom\n• Move the bedroom to the rear\n• Add a window to the living room\n\nYou typed: "${input}"\n\nIn V2 this will produce DesignCommand[] → Validation → Constraint Engine → Design Operations.`
      );
    }, 800);
    setInput("");
  };

  return (
    <div className="border-t border-zinc-800 bg-[#0f0f0f] px-4 py-3">
      <form onSubmit={handleSubmit} className="flex items-center gap-3 max-w-4xl mx-auto">
        <div className="flex-1 flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-full px-4 py-2 focus-within:border-zinc-700 focus-within:bg-zinc-800 transition-colors">
          <Sparkles size={16} className="text-violet-400 shrink-0" />
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Ask AI to modify your plan..."
            className="flex-1 bg-transparent outline-none text-sm text-white placeholder:text-zinc-500"
          />
          <button type="submit" disabled={!input.trim() || isMock} className="bg-white text-zinc-900 rounded-full p-1.5 hover:bg-zinc-100 disabled:opacity-50 disabled:cursor-not-allowed">
            {isMock ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
          </button>
        </div>
        <span className="hidden md:block text-[11px] text-zinc-500">AI • Mock V1</span>
      </form>
      {response && (
        <div className="max-w-4xl mx-auto mt-3 bg-zinc-900 border border-zinc-800 rounded-lg p-3 text-xs text-zinc-300 whitespace-pre-wrap leading-relaxed">
          {response}
          <button onClick={()=>setResponse(null)} className="ml-2 text-zinc-500 hover:text-zinc-300 underline">dismiss</button>
        </div>
      )}
    </div>
  );
}
