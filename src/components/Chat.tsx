"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useMemo, useRef, useState, useEffect, Fragment } from "react";
import { ArrowUp } from "lucide-react";
import Archer, { type ArcherState } from "./Archer";
import { lookupAirport } from "@/lib/airports";
import FlightResultCard from "./FlightResultCard";
import { parseFlightOutput } from "@/lib/flight-parser";

/* ------------------------------------------------------------------ */
/*  Tool helpers (preserved from prior scaffold)                       */
/* ------------------------------------------------------------------ */

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
  type: string;
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

/* ------------------------------------------------------------------ */
/*  Mono moments — IATA pairs / flight numbers / prices                */
/* ------------------------------------------------------------------ */

// Tokens that should render in IBM Plex Mono within assistant prose.
const MONO_RE =
  /(\b[A-Z]{3}\s*(?:→|->|to)\s*[A-Z]{3}\b|\b[A-Z]{2}\s?\d{2,4}\b|\$\d[\d,]*(?:\.\d{2})?)/g;

function renderWithMono(text: string) {
  const parts: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  // Reset regex state per call.
  MONO_RE.lastIndex = 0;
  while ((m = MONO_RE.exec(text))) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    parts.push(
      <span
        key={`m-${m.index}`}
        style={{
          fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
          fontSize: 14,
          lineHeight: "20px",
        }}
      >
        {m[0]}
      </span>
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

/* ------------------------------------------------------------------ */

export default function Chat() {
  // Hydrate from sessionStorage so a tab refresh doesn't wipe the conversation.
  // sessionStorage (not localStorage) so opening a fresh tab starts clean —
  // matches the "within a session" mental model.
  const STORAGE_KEY = "archer:chat:v1";
  const initialMessages = useMemo(() => {
    if (typeof window === "undefined") return [];
    try {
      const raw = window.sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }, []);

  const { messages, sendMessage, status, error, setMessages } = useChat({
    transport: new DefaultChatTransport({ api: "/api/chat" }),
    messages: initialMessages,
  });
  const [input, setInput] = useState("");
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  // Persist on every change once the stream is idle to avoid thrash mid-stream.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (status === "streaming" || status === "submitted") return;
    try {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
    } catch {
      // quota / serialization — fail silently, refresh just loses history
    }
  }, [messages, status]);

  // Suppress unused-var warning for setMessages (kept exported for future "clear chat").
  void setMessages;

  // Auto-scroll on new content.
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, status]);

  // Watch for flight_search tool calls — extract IATA pair, focus the globe.
  const lastFocusedRef = useRef<string>("");
  useEffect(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.role !== "assistant") continue;
      for (const part of m.parts) {
        const tp = part as ToolUIPart;
        const name = getToolName(tp);
        if (!name) continue;
        if (name !== "flight_search" && !name.endsWith("_flight_search")) continue;
        const input = (tp.input ?? {}) as Record<string, unknown>;
        // TravelKit input shape: { from, to, ... } where from/to are IATA strings
        // or objects with .code. Be defensive.
        const pick = (v: unknown): string | null => {
          if (typeof v === "string") return v.toUpperCase();
          if (v && typeof v === "object") {
            const o = v as Record<string, unknown>;
            const k = o.code ?? o.iata ?? o.airport;
            if (typeof k === "string") return k.toUpperCase();
          }
          return null;
        };
        const fromCode =
          pick(input.from) ?? pick(input.origin) ?? pick(input.depCity) ?? pick(input.dep);
        const toCode =
          pick(input.to) ?? pick(input.destination) ?? pick(input.arrCity) ?? pick(input.arr);
        if (!fromCode || !toCode) continue;
        const key = `${fromCode}>${toCode}`;
        if (key === lastFocusedRef.current) return;
        const fromC = lookupAirport(fromCode);
        const toC = lookupAirport(toCode);
        if (!fromC || !toC) return;
        lastFocusedRef.current = key;
        window.dispatchEvent(
          new CustomEvent("archer:focus", {
            detail: {
              from: { iata: fromCode, ...fromC },
              to: { iata: toCode, ...toC },
            },
          })
        );
        return;
      }
    }
  }, [messages]);

  const archerState: ArcherState = useMemo(() => {
    if (error) return "error";
    if (status === "submitted" || status === "streaming") return "thinking";
    return "neutral";
  }, [status, error]);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || status !== "ready") return;
    // Eager globe focus: if the user typed an IATA pair (e.g. "HKG to BKK",
    // "HKG → NRT", "HKG-LAX"), jump the globe immediately so it feels
    // connected to the message — don't wait for the tool round-trip.
    const pair = input.toUpperCase().match(/\b([A-Z]{3})\s*(?:->|→|TO|-|–|—)\s*([A-Z]{3})\b/);
    if (pair) {
      const [, a, b] = pair;
      const fromC = lookupAirport(a);
      const toC = lookupAirport(b);
      const key = `${a}>${b}`;
      if (fromC && toC && key !== lastFocusedRef.current) {
        lastFocusedRef.current = key;
        window.dispatchEvent(
          new CustomEvent("archer:focus", {
            detail: { from: { iata: a, ...fromC }, to: { iata: b, ...toC } },
          })
        );
      }
    }
    sendMessage({ text: input });
    setInput("");
  };

  return (
    <div className="flex flex-col h-full min-h-0 bg-[var(--bg)]">
      {/* Scroller */}
      <div
        ref={scrollerRef}
        className="flex-1 min-h-0 overflow-y-auto px-4 py-5 space-y-4"
      >
        {messages.length === 0 && (
          <div className="text-[var(--text-secondary)] text-sm leading-relaxed pl-1">
            Hi Saber. Where are we going?
            <div
              className="mt-2"
              style={{
                fontFamily: "var(--font-plex-mono), monospace",
                fontSize: 12,
                letterSpacing: "0.04em",
                textTransform: "uppercase",
                color: "var(--text-secondary)",
              }}
            >
              Try · PEK → BKK next friday
            </div>
          </div>
        )}

        {messages.map((m, mi) => {
          const isUser = m.role === "user";
          const prev = messages[mi - 1];
          const showAvatar = !isUser && (!prev || prev.role !== m.role);
          return (
            <div
              key={m.id}
              className={`flex gap-2 ${isUser ? "justify-end" : "justify-start"}`}
            >
              {!isUser && (
                <div className="w-8 shrink-0">
                  {showAvatar && (
                    <Archer size={32} state={mi === messages.length - 1 ? archerState : "neutral"} />
                  )}
                </div>
              )}
              <div
                className={`flex flex-col gap-1 ${
                  isUser ? "items-end" : "items-start"
                } w-fit min-w-0 max-w-full`}
              >
                {m.parts.map((part, i) => {
                  if (part.type === "text") {
                    const text = (part as { text: string }).text;
                    return (
                      <div
                        key={i}
                        className="px-[14px] py-[10px] rounded-[18px] text-[15px] leading-[22px] whitespace-pre-wrap break-words"
                        style={{
                          background: isUser
                            ? "var(--bubble-user-bg)"
                            : "var(--bubble-assistant-bg)",
                          color: isUser
                            ? "var(--bubble-user-text)"
                            : "var(--bubble-assistant-text)",
                          maxWidth: "min(560px, 75vw)",
                        }}
                      >
                        {isUser ? text : <Fragment>{renderWithMono(text)}</Fragment>}
                      </div>
                    );
                  }

                  if (
                    part.type?.startsWith("tool-") ||
                    part.type === "dynamic-tool"
                  ) {
                    const tp = part as unknown as ToolUIPart;
                    const name = getToolName(tp) ?? "tool";

                    // When a flight_search call completes, render the result
                    // as a stack of boarding-pass cards instead of plain text.
                    if (
                      tp.state === "output-available" &&
                      name.startsWith("flight_search")
                    ) {
                      const flights = parseFlightOutput(tp.output);
                      if (flights.length === 0) return null;
                      const top = flights.slice(0, 5);
                      return (
                        <div key={i} className="flex flex-col gap-2 w-full">
                          {top.map((f, fi) => (
                            <FlightResultCard key={`${f.id}-${fi}`} flight={f} />
                          ))}
                        </div>
                      );
                    }

                    if (tp.state === "output-available") return null;
                    return (
                      <div
                        key={i}
                        className="px-[14px] py-[8px] rounded-[18px] text-[13px] italic"
                        style={{
                          background: "var(--surface)",
                          color: "var(--text-secondary)",
                        }}
                      >
                        {toolLabel(name)}
                      </div>
                    );
                  }
                  return null;
                })}
              </div>
            </div>
          );
        })}

        {(status === "submitted" ||
          (status === "streaming" &&
            !(() => {
              const last = messages[messages.length - 1];
              if (!last || last.role !== "assistant") return false;
              return last.parts.some(
                (p) => p.type === "text" && (p as { text: string }).text?.length > 0
              );
            })())) && (
          <div className="flex gap-2 justify-start">
            <div className="w-8 shrink-0">
              <Archer size={32} state="thinking" />
            </div>
            <div
              className="px-[14px] py-[12px] rounded-[18px] flex items-center gap-1"
              style={{ background: "var(--bubble-assistant-bg)" }}
              aria-label="Archer is thinking"
            >
              <span className="archer-dot" />
              <span className="archer-dot" style={{ animationDelay: "0.15s" }} />
              <span className="archer-dot" style={{ animationDelay: "0.3s" }} />
            </div>
          </div>
        )}

        {error && (
          <div
            className="text-[13px] px-3 py-2 rounded-[12px]"
            style={{
              background: "color-mix(in oklab, var(--error) 12%, transparent)",
              color: "var(--error)",
            }}
          >
            Archer hit a snag — try again or rephrase?
          </div>
        )}
      </div>

      {/* Composer */}
      <form
        onSubmit={onSubmit}
        className="border-t border-[var(--border)] px-4 h-14 flex items-center gap-2 bg-[var(--bg)]"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={status !== "ready"}
          placeholder="Message Archer…"
          className="flex-1 bg-transparent text-[16px] leading-6 placeholder:text-[var(--text-secondary)] focus:outline-none text-[var(--text-primary)]"
        />
        <button
          type="submit"
          disabled={status !== "ready" || !input.trim()}
          aria-label="Send"
          className="h-8 w-8 grid place-items-center rounded-full transition disabled:opacity-40"
          style={{ background: "var(--brand-orange)", color: "#fff" }}
        >
          <ArrowUp className="h-4 w-4" strokeWidth={2.5} />
        </button>
      </form>
    </div>
  );
}
