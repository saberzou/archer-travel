"use client";

import { ArrowRight } from "lucide-react";
import { useMemo } from "react";

/* ------------------------------------------------------------------ */
/*  Tolerant parsing of TravelKit flight_search output                 */
/*                                                                     */
/*  Per tool description, `data.displayOptions` is the canonical       */
/*  stable summary. We defensively probe several common field names    */
/*  because the precise schema isn't published.                        */
/* ------------------------------------------------------------------ */

type Maybe<T> = T | null | undefined;

export type ParsedFlight = {
  id: string;
  airlineName: string;
  airlineCode: string;
  flightNumbers: string[]; // e.g. ["JL0020"] or ["H07293", "NH9757"]
  stops: number; // 0 = nonstop
  origin: string; // IATA
  destination: string; // IATA
  depDate: string; // YYYY-MM-DD (best effort)
  depTime: string; // HH:MM
  arrTime: string; // HH:MM
  arrDayOffset: number; // +N days
  durationMin: number;
  priceMinor: number; // smallest currency unit (cents/fen)
  currency: string; // "CNY", "USD", ...
  baggageNote?: string;
};

function get<T = unknown>(o: unknown, path: (string | number)[]): Maybe<T> {
  let cur: unknown = o;
  for (const k of path) {
    if (cur == null) return null;
    if (typeof cur !== "object") return null;
    cur = (cur as Record<string | number, unknown>)[k];
  }
  return (cur ?? null) as Maybe<T>;
}

function asString(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}
function asNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() && !Number.isNaN(Number(v))) {
    return Number(v);
  }
  return null;
}

/**
 * Try to peel a unified text payload off whatever shape MCP returned.
 * The TravelKit MCP wraps results as `{ content: [{ type:"text", text:"..." }] }`
 * with JSON inside. The AI SDK then surfaces this as `output` on the tool part.
 */
function unwrap(output: unknown): unknown {
  if (output == null) return null;
  // AI SDK shape: { content: [{ type:"text", text: "<json>" }] }
  const content = get<unknown[]>(output, ["content"]);
  if (Array.isArray(content)) {
    for (const c of content) {
      const text = get<string>(c, ["text"]);
      if (typeof text === "string") {
        try {
          return JSON.parse(text);
        } catch {
          // not JSON — return raw
          return text;
        }
      }
    }
  }
  // Already parsed shape: { data: {...} } or direct payload
  return output;
}

function parseDisplayOptions(payload: unknown): ParsedFlight[] {
  // canonical: payload.data.displayOptions = [{...}, ...]
  const options =
    get<unknown[]>(payload, ["data", "displayOptions"]) ??
    get<unknown[]>(payload, ["displayOptions"]) ??
    get<unknown[]>(payload, ["data", "options"]) ??
    get<unknown[]>(payload, ["options"]);
  if (!Array.isArray(options)) return [];

  const segmentsIndex: Record<string, unknown> = {};
  const segs =
    get<unknown[]>(payload, ["data", "segments"]) ??
    get<unknown[]>(payload, ["segments"]);
  if (Array.isArray(segs)) {
    for (const s of segs) {
      const id =
        asString(get(s, ["coreSegmentId"])) ??
        asString(get(s, ["id"])) ??
        asString(get(s, ["segmentId"]));
      if (id) segmentsIndex[id] = s;
    }
  }

  const out: ParsedFlight[] = [];
  for (let i = 0; i < options.length; i++) {
    const opt = options[i];
    const id =
      asString(get(opt, ["solutionId"])) ??
      asString(get(opt, ["id"])) ??
      `opt-${i}`;

    // segments may be embedded directly, or referenced by id
    let segments: unknown[] =
      get<unknown[]>(opt, ["segments"]) ??
      get<unknown[]>(opt, ["journey", "segments"]) ??
      [];
    if (!segments.length) {
      const refs =
        get<unknown[]>(opt, ["coreSegmentIds"]) ??
        get<unknown[]>(opt, ["segmentIds"]) ??
        [];
      segments = refs
        .map((r) => (typeof r === "string" ? segmentsIndex[r] : null))
        .filter((x): x is unknown => x != null);
    }
    if (!segments.length) continue;

    const first = segments[0];
    const last = segments[segments.length - 1];

    const origin =
      asString(get(first, ["depAirport", "code"])) ??
      asString(get(first, ["origin"])) ??
      asString(get(first, ["from"])) ??
      asString(get(first, ["depCode"])) ??
      "—";
    const destination =
      asString(get(last, ["arrAirport", "code"])) ??
      asString(get(last, ["destination"])) ??
      asString(get(last, ["to"])) ??
      asString(get(last, ["arrCode"])) ??
      "—";

    // departure datetime: "2026-05-24T08:25:00+08:00" or {date,time}
    const depRaw =
      asString(get(first, ["depTime"])) ??
      asString(get(first, ["departureTime"])) ??
      asString(get(first, ["departure"])) ??
      asString(get(first, ["depDateTime"])) ??
      "";
    const arrRaw =
      asString(get(last, ["arrTime"])) ??
      asString(get(last, ["arrivalTime"])) ??
      asString(get(last, ["arrival"])) ??
      asString(get(last, ["arrDateTime"])) ??
      "";

    const parseTime = (s: string): { date: string; time: string } => {
      if (!s) return { date: "", time: "" };
      // ISO "2026-05-24T08:25..."
      const m = s.match(/^(\d{4}-\d{2}-\d{2})[T\s](\d{2}:\d{2})/);
      if (m) return { date: m[1], time: m[2] };
      // bare "08:25"
      const t = s.match(/^(\d{2}:\d{2})/);
      if (t) return { date: "", time: t[1] };
      return { date: "", time: s };
    };
    const dep = parseTime(depRaw);
    const arr = parseTime(arrRaw);

    let arrDayOffset = 0;
    if (dep.date && arr.date) {
      const a = new Date(dep.date + "T00:00:00Z");
      const b = new Date(arr.date + "T00:00:00Z");
      arrDayOffset = Math.round(
        (b.getTime() - a.getTime()) / 86_400_000
      );
    }

    const airlineName =
      asString(get(opt, ["mainAirline", "name"])) ??
      asString(get(opt, ["airline", "name"])) ??
      asString(get(first, ["airline", "name"])) ??
      asString(get(first, ["marketingAirline", "name"])) ??
      asString(get(first, ["airlineName"])) ??
      "Airline";
    const airlineCode =
      asString(get(opt, ["mainAirline", "code"])) ??
      asString(get(opt, ["airline", "code"])) ??
      asString(get(first, ["airline", "code"])) ??
      asString(get(first, ["marketingAirline", "code"])) ??
      asString(get(first, ["airlineCode"])) ??
      "";

    const flightNumbers: string[] = [];
    for (const s of segments) {
      const fn =
        asString(get(s, ["flightNo"])) ??
        asString(get(s, ["flightNumber"])) ??
        asString(get(s, ["flight"])) ??
        "";
      if (fn) flightNumbers.push(fn);
    }

    const stops = Math.max(segments.length - 1, 0);

    const durationMin =
      asNumber(get(opt, ["totalDurationMinutes"])) ??
      asNumber(get(opt, ["duration"])) ??
      asNumber(get(opt, ["totalDuration"])) ??
      0;

    const priceMinor =
      asNumber(get(opt, ["price", "amount"])) ??
      asNumber(get(opt, ["totalPrice"])) ??
      asNumber(get(opt, ["price"])) ??
      0;
    const currency =
      asString(get(opt, ["price", "currency"])) ??
      asString(get(opt, ["currency"])) ??
      "CNY";

    const baggageNote =
      asString(get(opt, ["baggage", "summary"])) ??
      asString(get(opt, ["baggage"])) ??
      undefined;

    out.push({
      id,
      airlineName,
      airlineCode,
      flightNumbers,
      stops,
      origin,
      destination,
      depDate: dep.date,
      depTime: dep.time,
      arrTime: arr.time,
      arrDayOffset,
      durationMin,
      priceMinor,
      currency,
      baggageNote: baggageNote ?? undefined,
    });
  }
  return out;
}

export function parseFlightOutput(output: unknown): ParsedFlight[] {
  return parseDisplayOptions(unwrap(output));
}

/* ------------------------------------------------------------------ */
/*  Compact boarding-pass card                                         */
/* ------------------------------------------------------------------ */

function fmtDuration(mins: number): string {
  if (!mins) return "—";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}

function fmtPrice(minor: number, currency: string): string {
  // TravelKit prices are typically in major units already (e.g. 3205 = ¥3205).
  // But many payment APIs use minor. We assume major unless the value looks
  // suspiciously huge for the route (>1e6).
  const amount = minor > 1e6 ? minor / 100 : minor;
  const sym =
    currency === "CNY"
      ? "¥"
      : currency === "USD"
        ? "$"
        : currency === "EUR"
          ? "€"
          : currency === "GBP"
            ? "£"
            : currency === "JPY"
              ? "¥"
              : "";
  const body = Math.round(amount).toLocaleString("en-US");
  return sym ? `${sym}${body}` : `${body} ${currency}`;
}

function useBars(seed: string, width: number) {
  return useMemo(() => {
    let h = 0;
    for (let i = 0; i < seed.length; i++) {
      h = (h * 31 + seed.charCodeAt(i)) >>> 0;
    }
    const widths: number[] = [];
    const total = 36;
    for (let i = 0; i < total; i++) {
      h = (h * 1664525 + 1013904223) >>> 0;
      widths.push(1 + (h % 3));
    }
    const sumUnits = widths.reduce((a, b) => a + b, 0);
    const unit = width / sumUnits;
    let x = 0;
    return widths.map((w, i) => {
      const bar = { x, w: w * unit, fill: i % 2 === 0 };
      x += w * unit;
      return bar;
    });
  }, [seed, width]);
}

export function FlightResultCard({
  flight,
  onSelect,
}: {
  flight: ParsedFlight;
  onSelect?: (id: string) => void;
}) {
  const barW = 56;
  const bars = useBars(
    `${flight.airlineCode}${flight.origin}${flight.destination}${flight.flightNumbers.join("")}`,
    barW
  );
  const stopsLabel =
    flight.stops === 0 ? "nonstop" : `${flight.stops} stop${flight.stops > 1 ? "s" : ""}`;
  const offsetLabel =
    flight.arrDayOffset > 0
      ? ` +${flight.arrDayOffset}d`
      : flight.arrDayOffset < 0
        ? ` ${flight.arrDayOffset}d`
        : "";

  return (
    <article
      className="
        relative grid grid-cols-[72px_1fr_92px]
        w-full max-w-[560px]
        rounded-[12px] overflow-hidden
        bg-[var(--bg)] border border-[var(--border)]
        text-[var(--text-primary)]
      "
      style={{ boxShadow: "var(--shadow-pass, 0 4px 14px rgba(0,0,0,0.08))" }}
    >
      {/* 1 · Logo slab (orange now, matching brand) */}
      <div className="relative" style={{ background: "var(--brand-orange, #FF6A00)" }}>
        <div
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-white whitespace-nowrap"
          style={{
            transform: "translate(-50%, -50%) rotate(-90deg)",
            fontFamily: "var(--font-inter), system-ui, sans-serif",
            fontWeight: 700,
            fontSize: 12,
            letterSpacing: "0.14em",
          }}
        >
          ARCHER
        </div>
      </div>

      {/* 2 · Main */}
      <button
        type="button"
        onClick={() => onSelect?.(flight.id)}
        className="text-left px-4 py-3 flex flex-col gap-2 min-w-0 transition hover:bg-[var(--surface)]"
      >
        {/* IATA pair */}
        <div className="flex items-baseline gap-2">
          <span
            className="tabular-nums"
            style={{
              fontFamily: "var(--font-inter), system-ui, sans-serif",
              fontWeight: 700,
              fontSize: 32,
              lineHeight: "34px",
              letterSpacing: "-0.03em",
            }}
          >
            {flight.origin}
          </span>
          <ArrowRight
            className="text-[var(--text-secondary)] shrink-0 self-center"
            size={16}
            strokeWidth={2}
          />
          <span
            className="tabular-nums"
            style={{
              fontFamily: "var(--font-inter), system-ui, sans-serif",
              fontWeight: 700,
              fontSize: 32,
              lineHeight: "34px",
              letterSpacing: "-0.03em",
            }}
          >
            {flight.destination}
          </span>
          <span
            className="ml-auto tabular-nums"
            style={{
              fontFamily: "var(--font-plex-mono), monospace",
              fontSize: 11,
              letterSpacing: "0.04em",
              color: "var(--text-secondary)",
              textTransform: "uppercase",
            }}
          >
            {stopsLabel}
          </span>
        </div>

        {/* Times row */}
        <div className="flex items-baseline gap-3 flex-wrap">
          <span
            className="tabular-nums"
            style={{
              fontFamily: "var(--font-plex-mono), monospace",
              fontWeight: 600,
              fontSize: 14,
              color: "var(--text-primary)",
            }}
          >
            {flight.depTime || "—"}
          </span>
          <span
            style={{
              fontFamily: "var(--font-plex-mono), monospace",
              fontSize: 12,
              color: "var(--text-secondary)",
            }}
          >
            →
          </span>
          <span
            className="tabular-nums"
            style={{
              fontFamily: "var(--font-plex-mono), monospace",
              fontWeight: 600,
              fontSize: 14,
              color: "var(--text-primary)",
            }}
          >
            {flight.arrTime || "—"}
            {offsetLabel && (
              <span style={{ color: "var(--text-secondary)" }}>{offsetLabel}</span>
            )}
          </span>
          <span
            style={{
              fontFamily: "var(--font-plex-mono), monospace",
              fontSize: 11,
              color: "var(--text-secondary)",
              textTransform: "uppercase",
              letterSpacing: "0.04em",
            }}
          >
            · {fmtDuration(flight.durationMin)}
          </span>
        </div>

        {/* Airline + flight numbers */}
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          <span
            className="truncate"
            style={{
              fontFamily: "var(--font-inter), system-ui, sans-serif",
              fontSize: 13,
              fontWeight: 500,
              color: "var(--text-primary)",
            }}
          >
            {flight.airlineName}
          </span>
          {flight.flightNumbers.length > 0 && (
            <span
              className="tabular-nums"
              style={{
                fontFamily: "var(--font-plex-mono), monospace",
                fontSize: 11,
                color: "var(--text-secondary)",
              }}
            >
              {flight.flightNumbers.join(" · ")}
            </span>
          )}
        </div>

        {flight.baggageNote && (
          <div
            style={{
              fontFamily: "var(--font-plex-mono), monospace",
              fontSize: 10,
              color: "var(--text-secondary)",
              textTransform: "uppercase",
              letterSpacing: "0.04em",
            }}
          >
            {flight.baggageNote}
          </div>
        )}
      </button>

      {/* Perforation */}
      <div className="relative">
        <div
          aria-hidden
          className="absolute left-0 top-2 bottom-2 w-px"
          style={{
            backgroundImage:
              "repeating-linear-gradient(to bottom, var(--border) 0 3px, transparent 3px 6px)",
          }}
        />
        {/* 3 · Stub: price + barcode */}
        <div className="h-full pl-3 pr-3 py-3 flex flex-col justify-between items-center text-center">
          <div
            className="tabular-nums"
            style={{
              fontFamily: "var(--font-inter), system-ui, sans-serif",
              fontWeight: 700,
              fontSize: 18,
              lineHeight: "20px",
              letterSpacing: "-0.02em",
              color: "var(--brand-orange, #FF6A00)",
            }}
          >
            {fmtPrice(flight.priceMinor, flight.currency)}
          </div>
          <svg
            width={barW}
            height={36}
            viewBox={`0 0 ${barW} 36`}
            aria-hidden
          >
            {bars
              .filter((b) => b.fill)
              .map((b, i) => (
                <rect
                  key={i}
                  x={b.x}
                  y={0}
                  width={Math.max(b.w - 0.3, 0.5)}
                  height={36}
                  fill="var(--text-primary)"
                />
              ))}
          </svg>
        </div>
      </div>
    </article>
  );
}

export default FlightResultCard;
