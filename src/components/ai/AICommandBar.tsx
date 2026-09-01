import { useState, useRef, useEffect } from "react";
import { Sparkles, Send, Loader2, X, Undo2, Check } from "lucide-react";
import { useDesignStore } from "../../stores/designStore";
import { useUIStore } from "../../stores/uiStore";
import { fetchAICommands, pushAIHistory } from "../../features/ai/services/aiApi";
import { executeCommands } from "../../features/ai/commands/commandExecutor";
import { validateCommands } from "../../features/ai/commands/commandValidator";
import type { AICommand } from "../../features/ai/commands/commandTypes";

type AIState = "idle" | "thinking" | "preview" | "applying" | "success" | "error";

export default function AICommandBar() {
  const [input, setInput] = useState("");
  const [focused, setFocused] = useState(false);
  const [state, setState] = useState<AIState>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [commands, setCommands] = useState<AICommand[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const design = useDesignStore((s) => s.design);
  const ui = useUIStore();
  const inputRef = useRef<HTMLInputElement>(null);

  const examples = [
    "Make the master bedroom 2 feet wider",
    "Add a bathroom next to the master bedroom",
    "Move the kitchen closer to the dining room",
    "Add a window to the living room",
  ];

  const needsPreview = (cmds: AICommand[]) => {
    if (cmds.length === 0) return false;
    if (cmds.length > 1) return true;
    const t = cmds[0].type;
    if (t.startsWith("DELETE_")) return true;
    // threshold for resize larger? consider destructive
    return false;
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const prompt = input.trim();
    if (!prompt || !design) return;
    if (state === "thinking" || state === "applying") return;

    setState("thinking");
    setMessage(null);
    setError(null);
    setCommands([]);
    setShowHistory(false);

    try {
      const floorId = design.floors[0]?.id;
      const res = await fetchAICommands(prompt, design, floorId);
      // validate frontend again
      const { valid, errors } = validateCommands(res.commands as AICommand[]);
      const allErrors = [...(res.errors || []), ...errors];
      if (allErrors.length && valid.length === 0) {
        // no valid commands
        setState("error");
        setMessage(res.message || "Could not understand request.");
        setError(allErrors.join("; ").slice(0, 400));
        pushAIHistory({ role: "user", content: prompt });
        pushAIHistory({ role: "assistant", content: res.message || "No commands" });
        return;
      }
      if (res.provider_error) {
        // show but still allow valid commands
        setError(res.provider_error.slice(0, 300));
      }
      setCommands(valid as AICommand[]);
      setMessage(res.message || (valid.length ? `Generated ${valid.length} command(s)` : "No changes"));

      // push history
      pushAIHistory({ role: "user", content: prompt });
      pushAIHistory({ role: "assistant", content: res.message || "" });

      if (valid.length === 0) {
        setState("success");
        return;
      }

      if (needsPreview(valid as AICommand[])) {
        setState("preview");
      } else {
        // auto apply
        await applyCommands(valid as AICommand[], res.message || "", floorId);
      }
    } catch (err) {
      setState("error");
      setMessage(null);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setInput("");
    }
  };

  const applyCommands = async (cmds: AICommand[], msg: string, floorId?: string) => {
    setState("applying");
    // small delay for UX
    await new Promise((r) => setTimeout(r, 300));
    const result = executeCommands(cmds, floorId);
    if (result.failedCount === 0) {
      setState("success");
      const successMsg = msg || `✓ Updated your floor plan (${result.successCount} changes)`;
      setMessage(successMsg);
      setCommands([]);
      ui.pushToast(successMsg, "success");
      // explainability: show details if repair happened
      const details = result.results.map((r) => r.message).filter(Boolean).join("; ");
      if (details && details !== msg) {
        setMessage(`${successMsg}\n${details}`);
      }
    } else if (result.successCount > 0) {
      setState("error");
      const failed = result.results.filter((r) => !r.success).map((r) => r.error).join("; ");
      setMessage(msg);
      setError(`Partially applied (${result.successCount} ok, ${result.failedCount} failed): ${failed}`);
      ui.pushToast(`Partially applied - ${failed}`, "error");
    } else {
      setState("error");
      const failed = result.results.map((r) => r.error).join("; ");
      setMessage(msg);
      setError(failed || "Failed to apply changes");
      ui.pushToast(failed || "Failed to apply", "error");
    }
  };

  const handleApplyPreview = async () => {
    if (!design) return;
    const floorId = design.floors[0]?.id;
    await applyCommands(commands, message || "", floorId);
  };

  const handleCancel = () => {
    setState("idle");
    setMessage(null);
    setCommands([]);
    setError(null);
  };

  // auto-dismiss success after 4s
  useEffect(() => {
    if (state === "success" || state === "error") {
      const t = setTimeout(() => {
        if (state === "success") handleCancel();
      }, 5000);
      return () => clearTimeout(t);
    }
  }, [state]);

  const isBusy = state === "thinking" || state === "applying";

  return (
    <div className="border-t border-zinc-800 bg-[#0f0f0f] px-4 py-3">
      <form onSubmit={handleSubmit} className="flex items-center gap-3 max-w-4xl mx-auto">
        <div className="flex-1 flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-full px-4 py-2 focus-within:border-zinc-700 focus-within:bg-zinc-800 transition-colors">
          <Sparkles size={16} className="text-violet-400 shrink-0" />
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setTimeout(() => setFocused(false), 200)}
            placeholder="Ask AI to modify your floor plan..."
            className="flex-1 bg-transparent outline-none text-sm text-white placeholder:text-zinc-500"
            disabled={isBusy || !design}
          />
          {input && (
            <button type="button" onClick={() => setInput("")} className="text-zinc-500 hover:text-zinc-300">
              <X size={14} />
            </button>
          )}
          <button
            type="submit"
            disabled={!input.trim() || isBusy || !design}
            className="bg-white text-zinc-900 rounded-full p-1.5 hover:bg-zinc-100 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isBusy ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
          </button>
        </div>
        <span className="hidden md:block text-[11px] text-zinc-500">
          {state === "thinking" ? "✨ Thinking..." : state === "applying" ? "✨ Applying..." : "AI"}
        </span>
      </form>

      {/* Example prompts on focus */}
      {focused && state === "idle" && !message && !error && (
        <div className="max-w-4xl mx-auto mt-3 bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <div className="text-xs text-zinc-400 mb-2">Try:</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {examples.map((ex) => (
              <button
                key={ex}
                onMouseDown={(e) => {
                  e.preventDefault();
                  setInput(ex);
                  inputRef.current?.focus();
                }}
                className="text-left text-xs bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-full px-3 py-2 text-zinc-300"
              >
                &quot;{ex}&quot;
              </button>
            ))}
          </div>
          <div className="text-[11px] text-zinc-600 mt-3">
            Works with OpenAI, OpenRouter, GMI Cloud, Gemini, Anthropic - configure via AI_PROVIDER / AI_API_KEY / AI_MODEL
          </div>
        </div>
      )}

      {/* Thinking / Applying */}
      {isBusy && (
        <div className="max-w-4xl mx-auto mt-3 bg-zinc-900 border border-zinc-800 rounded-lg p-3 text-xs text-zinc-400 flex items-center gap-2">
          <Loader2 size={14} className="animate-spin text-violet-400" />
          {state === "thinking" ? "✨ Thinking..." : "✨ Applying changes..."}
        </div>
      )}

      {/* Preview */}
      {state === "preview" && commands.length > 0 && design && (
        <div className="max-w-4xl mx-auto mt-3">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <div className="text-sm font-medium text-white mb-2 flex items-center gap-2">
              <Sparkles size={14} className="text-violet-400" /> AI Suggestion
              <span className="text-xs font-normal text-zinc-400 ml-2">{message}</span>
            </div>
            <div className="text-xs text-zinc-400 mb-3">
              Changes:
              <div className="mt-2 bg-zinc-800 rounded-lg border border-zinc-700 p-3 space-y-1">
                {commands.map((c, i) => {
                  const p = c.parameters as Record<string, unknown>;
                  // human readable
                  let desc: string = c.type;
                  if (c.type === "RESIZE_ROOM") {
                    const room = design.floors[0]?.rooms.find((r) => r.id === (p.roomId as string));
                    const name = room?.name || (p.roomId as string);
                    if (p.width != null) desc = `Resize ${String(name)} → ${String(p.width)} ft wide`;
                    else if (p.widthDelta != null) desc = `${String(name)} width ${Number(p.widthDelta) > 0 ? "+" : ""}${String(p.widthDelta)} ft`;
                    else if (p.height != null) desc = `Resize ${String(name)} to ${String(p.width)}×${String(p.height)}`;
                    else desc = `Resize ${String(name)}`;
                  } else if (c.type === "MOVE_ROOM") {
                    const room = design.floors[0]?.rooms.find((r) => r.id === (p.roomId as string));
                    desc = `Move ${String(room?.name || p.roomId)} ${p.position ? `to ${String(p.position)}` : ""}`;
                  } else if (c.type === "CREATE_ROOM") {
                    desc = `Create ${String(p.name || p.roomType)}`;
                  } else if (c.type === "DELETE_ROOM") {
                    const room = design.floors[0]?.rooms.find((r) => r.id === (p.roomId as string));
                    desc = `Delete ${String(room?.name || p.roomId)}`;
                  } else if (c.type === "CREATE_WINDOW") {
                    const room = design.floors[0]?.rooms.find((r) => r.id === (p.roomId as string));
                    desc = `Add window ${room ? `to ${room.name}` : ""}`;
                  }
                  return (
                    <div key={c.id || i} className="flex gap-2 text-xs">
                      <span className="font-mono text-violet-300">{c.type}</span>
                      <span className="text-zinc-300">{desc}</span>
                      <span className="text-zinc-500 truncate">{JSON.stringify(p)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={handleCancel} className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-full py-2 text-sm border border-zinc-700">
                Cancel
              </button>
              <button onClick={handleApplyPreview} className="flex-1 bg-white hover:bg-zinc-100 text-zinc-900 rounded-full py-2 text-sm font-semibold">
                Apply
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Success */}
      {state === "success" && message && (
        <div className="max-w-4xl mx-auto mt-3 bg-emerald-950/40 border border-emerald-800 rounded-lg p-3 text-xs text-emerald-200 flex items-start gap-2 whitespace-pre-wrap">
          <Check size={14} className="text-emerald-400 mt-0.5 shrink-0" />
          <span className="flex-1">{message}</span>
          <button onClick={handleCancel} className="text-emerald-400 hover:text-emerald-200">
            <X size={14} />
          </button>
          <button onClick={() => useDesignStore.getState().undo()} className="ml-2 flex items-center gap-1 text-emerald-300 hover:text-white bg-emerald-900 border border-emerald-800 rounded-full px-2 py-1 text-[11px]">
            <Undo2 size={12} /> Undo
          </button>
        </div>
      )}

      {/* Error */}
      {state === "error" && (
        <div className="max-w-4xl mx-auto mt-3 bg-red-950/40 border border-red-900 rounded-lg p-3 text-xs text-red-200">
          <div className="flex gap-2">
            <span className="flex-1 whitespace-pre-wrap">{message || "Failed"}</span>
            <button onClick={handleCancel} className="text-red-400 hover:text-red-200">
              <X size={14} />
            </button>
          </div>
          {error && <div className="mt-2 text-red-300/80 bg-red-950 rounded p-2 border border-red-900">{error}</div>}
          <div className="mt-2 flex gap-2">
            <button onClick={handleCancel} className="text-red-300 underline text-xs">
              Dismiss
            </button>
            <button
              onClick={() => {
                setState("idle");
                setError(null);
                setMessage(null);
                inputRef.current?.focus();
              }}
              className="text-zinc-400 underline text-xs"
            >
              Try again
            </button>
          </div>
        </div>
      )}

      {/* No commands but message (unsupported) */}
      {state === "success" && commands.length === 0 && message && !error && (
        <div className="max-w-4xl mx-auto mt-1 text-xs text-zinc-500 text-center">
          {message.includes("modify the floor-plan") ? null : null}
        </div>
      )}
    </div>
  );
}
