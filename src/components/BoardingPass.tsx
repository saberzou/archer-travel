"use client";

import { ArrowRight } from "lucide-react";
import { useMemo } from "react";

export type BoardingPassProps = {
  origin: string;
  destination: string;
  flight: string;
  date: string;
  depart: string;
  gate: string;
  seat: string;
  boards: string;
  passenger: string;
};

/**
 * Hand-rolled Code128-ish bar pattern. Not a strict Code128 encoding
 * (we don't need scannability), but visually authentic — variable-width
 * bars + quiet zones + start/stop guards.
 */
function useBars(payload: string, width: number) {
  return useMemo(() => {
    // Seed deterministic bar widths from the payload.
    let h = 0;
    for (let i = 0; i < payload.length; i++) {
      h = (h * 31 + payload.charCodeAt(i)) >>> 0;
    }
    const widths: number[] = [];
    const total = 60;
    for (let i = 0; i < total; i++) {
      h = (h * 1664525 + 1013904223) >>> 0;
      widths.push(1 + (h % 3)); // 1..3 module units
    }
    const sumUnits = widths.reduce((a, b) => a + b, 0);
    const unit = width / sumUnits;
    let x = 0;
    return widths.map((w, i) => {
      const bar = { x, w: w * unit, fill: i % 2 === 0 };
      x += w * unit;
      return bar;
    });
  }, [payload, width]);
}

export default function BoardingPass(props: BoardingPassProps) {
  const {
    origin,
    destination,
    flight,
    date,
    depart,
    gate,
    seat,
    boards,
    passenger,
  } = props;

  const barcodeWidth = 96;
  const bars = useBars(`${flight}${origin}${destination}${seat}`, barcodeWidth);

  return (
    <article
      className="
        relative grid grid-cols-[96px_1fr_144px]
        w-full max-w-[720px] h-[320px]
        rounded-[12px] overflow-hidden
        bg-[var(--bg)] border border-[var(--border)]
        text-[var(--text-primary)]
      "
      style={{ boxShadow: "var(--shadow-pass)" }}
    >
      {/* 1 · Logo slab */}
      <div className="relative bg-[var(--accent-blue)]">
        <div
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-white whitespace-nowrap"
          style={{
            transform: "translate(-50%, -50%) rotate(-90deg)",
            fontFamily: "var(--font-inter), system-ui, sans-serif",
            fontWeight: 700,
            fontSize: 18,
            letterSpacing: "0.12em",
          }}
        >
          ARCHER
        </div>
      </div>

      {/* 2 · Main */}
      <div className="px-8 py-7 flex flex-col justify-between min-w-0">
        <div className="flex items-center gap-4">
          <span
            className="tabular-nums"
            style={{
              fontWeight: 700,
              fontSize: 88,
              lineHeight: "88px",
              letterSpacing: "-0.04em",
            }}
          >
            {origin}
          </span>
          <ArrowRight
            className="text-[var(--text-secondary)] shrink-0"
            size={32}
            strokeWidth={2}
          />
          <span
            className="tabular-nums"
            style={{
              fontWeight: 700,
              fontSize: 88,
              lineHeight: "88px",
              letterSpacing: "-0.04em",
            }}
          >
            {destination}
          </span>
        </div>

        <div className="grid grid-cols-3 gap-x-6 gap-y-3">
          <Meta label="Flight" value={flight} />
          <Meta label="Date" value={date} />
          <Meta label="Depart" value={depart} />
          <Meta label="Gate" value={gate} />
          <Meta label="Seat" value={seat} />
          <Meta label="Boards" value={boards} />
        </div>
      </div>

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
        {/* 3 · Stub */}
        <div className="h-full pl-5 pr-4 py-5 flex flex-col justify-between items-center text-center">
          <div
            className="tabular-nums"
            style={{
              fontWeight: 700,
              fontSize: 32,
              lineHeight: "32px",
              letterSpacing: "-0.03em",
            }}
          >
            {origin}→{destination}
          </div>
          <div
            className="text-[var(--text-secondary)]"
            style={{ fontFamily: "var(--font-inter)", fontWeight: 600, fontSize: 14 }}
          >
            {passenger}
          </div>
          <svg
            width={barcodeWidth}
            height={96}
            viewBox={`0 0 ${barcodeWidth} 96`}
            aria-label="boarding pass barcode"
          >
            {bars
              .filter((b) => b.fill)
              .map((b, i) => (
                <rect
                  key={i}
                  x={b.x}
                  y={0}
                  width={Math.max(b.w - 0.4, 0.6)}
                  height={96}
                  fill="var(--text-primary)"
                />
              ))}
          </svg>
        </div>
      </div>
    </article>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div
        className="text-[var(--text-secondary)]"
        style={{
          fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
          fontSize: 12,
          lineHeight: "16px",
          fontWeight: 500,
          letterSpacing: "0.04em",
          textTransform: "uppercase",
        }}
      >
        {label}
      </div>
      <div
        className="tabular-nums"
        style={{
          fontFamily: "var(--font-inter), system-ui, sans-serif",
          fontWeight: 600,
          fontSize: 18,
          lineHeight: "24px",
        }}
      >
        {value}
      </div>
    </div>
  );
}
