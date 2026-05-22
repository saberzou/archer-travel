"use client";

import { ArrowRight } from "lucide-react";
import { useMemo } from "react";
import type { ParsedFlight } from "@/lib/flight-parser";

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
        relative grid grid-cols-[56px_1fr_84px]
        w-full
        rounded-[12px] overflow-hidden
        bg-[var(--bg)] border border-[var(--border)]
        text-[var(--text-primary)]
      "
      style={{ boxShadow: "var(--shadow-pass, 0 4px 14px rgba(0,0,0,0.08))" }}
    >
      {/* 1 · Logo slab — airline IATA code */}
      <div className="relative" style={{ background: "var(--brand-orange, #FF6A00)" }}>
        <div
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-white whitespace-nowrap"
          style={{
            fontFamily: "var(--font-inter), system-ui, sans-serif",
            fontWeight: 800,
            fontSize: 22,
            letterSpacing: "0.02em",
          }}
        >
          {flight.airlineCode || "—"}
        </div>
      </div>

      {/* 2 · Main */}
      <button
        type="button"
        onClick={() => onSelect?.(flight.id)}
        className="text-left px-4 py-3 flex flex-col gap-2 min-w-0 transition hover:bg-[var(--surface)]"
      >
        {/* IATA pair */}
        <div className="flex items-center gap-2">
          <span
            className="tabular-nums"
            style={{
              fontFamily: "var(--font-inter), system-ui, sans-serif",
              fontWeight: 700,
              fontSize: 26,
              lineHeight: 1,
              letterSpacing: "-0.03em",
            }}
          >
            {flight.origin}
          </span>
          <ArrowRight
            className="text-[var(--text-secondary)] shrink-0"
            size={18}
            strokeWidth={2}
          />
          <span
            className="tabular-nums"
            style={{
              fontFamily: "var(--font-inter), system-ui, sans-serif",
              fontWeight: 700,
              fontSize: 26,
              lineHeight: 1,
              letterSpacing: "-0.03em",
            }}
          >
            {flight.destination}
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
          <span
            className="ml-auto tabular-nums"
            style={{
              fontFamily: "var(--font-plex-mono), monospace",
              fontSize: 11,
              color: "var(--text-secondary)",
              textTransform: "uppercase",
              letterSpacing: "0.04em",
            }}
          >
            {stopsLabel}
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
