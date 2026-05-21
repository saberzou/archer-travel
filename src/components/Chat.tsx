"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";
import { Send, Sparkles } from "lucide-react";
import FlightCard, { type FlightOption } from "./FlightCard";

const TOOL_LABELS: Record<string, string> = {
  flight_search: "consulting the rolodex…",
  flight_verify_solution: "verifying availability…",
  flight_create_order: "writing your ticket…",
  flight_pay_order: "processing payment…",
  flight_download_itinerary: "preparing your itinerary…",
  flight_query_order: "checking your booking…",
  flight_cancel_order: "cancelling…",
};

function toolLabel(name: string) {
  return TOOL_LABELS[name] ?? `working: ${name.replace(/_/g, " ")}…`;
}

type ToolUIPart = {
  type: string; // e.g. "tool-flight_search" or "dynamic-tool"
  toolName?: string;
  state?: string;
  input?: unknown;
  output?: unknown;
};

function getToolName(part: ToolUIPart): string | null {
  if (part.toolName) return part.toolName;
  if (part.type?.startsWith("tool-")) return part.type.slice(5);
  return null;
}

function extractFlightOptions(output: unknown): FlightOption[] | null {
  if (!output || typeof output !== "object") return null;
  const o = output as Record<string, unknown>;
  // MCP tool result shape: { content: [{type:'text', text:'...json...'}], ... } or direct data
  const tryParse = (v: unknown): FlightOption[] | null => {
    if (Array.isArray(v)) return v as FlightOption[];
    if (v && typeof v === "object") {
      const d = v as Record<string, unknown>;
      if (Array.isArray(d.displayOptions)) return d.displayOptions as FlightOption[];
      if (d.data && typeof d.data === "object") {
        const dd = d.data as Record<string, unknown>;
        if (Array.isArray(dd.displayOptions)) return dd.displayOptions as FlightOption[];
      }
    }
    return null;
  };
  const direct = tryParse(o);
  if (direct) return direct;
  if (Array.isArray(o.content)) {
    for (const c of o.content) {
      if (c && typeof c === "object" && "text" in c) {
        try {
          const parsed = JSON.parse((c as { text: string }).text);
          const found = tryParse(parsed);
          if (found) return found;
        } catch {
          /* not json */
        }
      }
    }
  }
  return null;
}

export default function Chat() {
  const { messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({ api: "/api/chat" }),
  });
  const [input, setInput] = useState("");

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || status !== "ready") return;
    sendMessage({ text: input });
    setInput("");
  };

  const pickOption = (i: number) => {
    sendMessage({ text: `I'd like to book option ${i + 1}.` });
  };

  return (
    <div
      className="fixed z-10 flex flex-col
        md:right-6 md:top-6 md:bottom-6 md:w-[420px]
        inset-x-0 bottom-0 h-[72vh] md:h-auto
        bg-white/[0.06] backdrop-blur-2xl
        border border-white/10
        md:rounded-3xl rounded-t-3xl
        shadow-2xl shadow-black/50
        overflow-hidden"
    >
      <header className="flex items-center gap-2 px-5 py-4 border-b border-white/10">
        <div className="h-8 w-8 rounded-full bg-gradient-to-br from-sky-400 to-indigo-500 grid place-items-center text-sm">
          🐾
        </div>
        <div>
          <div className="font-medium tracking-tight">Archer</div>
          <div className="text-[10px] uppercase tracking-widest text-white/40">
            Travel · Snow Leopard
          </div>
        </div>
        <Sparkles className="ml-auto h-4 w-4 text-white/30" />
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-white/50 text-sm leading-relaxed">
            Hi Saber. Where are we going?
            <div className="mt-2 text-xs text-white/30">
              Try: <em>&ldquo;PEK to BKK next Friday for 5 days&rdquo;</em>
            </div>
          </div>
        )}

        <AnimatePresence initial={false}>
          {messages.map((m) => (
            <motion.div
              key={m.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className={m.role === "user" ? "text-right" : "text-left"}
            >
              {m.parts.map((part, i) => {
                if (part.type === "text") {
                  return (
                    <div
                      key={i}
                      className={
                        m.role === "user"
                          ? "inline-block max-w-[85%] rounded-2xl rounded-br-md px-3.5 py-2 bg-sky-500/90 text-white text-sm"
                          : "inline-block max-w-full rounded-2xl rounded-bl-md px-3.5 py-2 bg-white/10 text-white/90 text-sm whitespace-pre-wrap"
                      }
                    >
                      {part.text}
                    </div>
                  );
                }
                // Tool parts in AI SDK v6: type starts with "tool-" or is "dynamic-tool"
                if (part.type?.startsWith("tool-") || part.type === "dynamic-tool") {
                  const tp = part as unknown as ToolUIPart;
                  const name = getToolName(tp) ?? "tool";
                  const opts =
                    name === "flight_search" && tp.state === "output-available"
                      ? extractFlightOptions(tp.output)
                      : null;

                  return (
                    <div key={i} className="my-2 space-y-2">
                      {tp.state !== "output-available" && (
                        <div className="text-xs italic text-white/40">
                          {toolLabel(name)}
                        </div>
                      )}
                      {opts && (
                        <div className="space-y-2">
                          {opts.slice(0, 5).map((opt, idx) => (
                            <FlightCard
                              key={idx}
                              option={opt}
                              index={idx}
                              onPick={pickOption}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  );
                }
                return null;
              })}
            </motion.div>
          ))}
        </AnimatePresence>

        {status === "submitted" && (
          <div className="text-xs italic text-white/40">thinking…</div>
        )}
      </div>

      <form
        onSubmit={onSubmit}
        className="p-3 border-t border-white/10 flex gap-2"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={status !== "ready"}
          placeholder="Ask Archer…"
          className="flex-1 bg-white/5 border border-white/10 rounded-full px-4 py-2.5 text-sm placeholder:text-white/30 focus:outline-none focus:border-white/30 transition"
        />
        <button
          type="submit"
          disabled={status !== "ready" || !input.trim()}
          className="h-10 w-10 grid place-items-center rounded-full bg-sky-500 hover:bg-sky-400 disabled:bg-white/10 disabled:text-white/30 transition"
        >
          <Send className="h-4 w-4" />
        </button>
      </form>
    </div>
  );
}
