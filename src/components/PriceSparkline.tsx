"use client";

import { useMemo, useState } from "react";

export type PricePoint = { date: string; price: number };

export type PriceSparklineProps = {
  /** Up to 30 chronological points. */
  data: PricePoint[];
  /** Index in `data` to mark as "today" (vertical hairline). */
  todayIndex?: number;
  width?: number;
  height?: number;
};

/**
 * 30 dot timeline. Dotted connector (NOT a smooth curve).
 * Cheapest dot painted brand-orange + labelled in Plex Mono caption.
 * Today marker: dashed blue hairline.
 */
export default function PriceSparkline({
  data,
  todayIndex,
  width = 480,
  height = 64,
}: PriceSparklineProps) {
  const [hover, setHover] = useState<number | null>(null);

  const { points, cheapestIdx } = useMemo(() => {
    if (!data.length) {
      return { points: [] as Array<PricePoint & { x: number; y: number }>, cheapestIdx: -1 };
    }
    const padTop = 16; // label headroom
    const padBottom = 8;
    const innerH = height - padTop - padBottom;
    const prices = data.map((d) => d.price);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const range = Math.max(max - min, 1);
    const scaleY = (p: number) =>
      padTop + innerH - ((p - min) / range) * innerH;

    const stepX = data.length > 1 ? width / (data.length - 1) : width / 2;
    const points = data.map((d, i) => ({
      x: data.length > 1 ? i * stepX : width / 2,
      y: scaleY(d.price),
      ...d,
    }));
    const cheapestIdx = prices.indexOf(min);
    return { points, cheapestIdx };
  }, [data, height, width]);

  if (!data.length) return null;

  const cheapest = points[cheapestIdx];
  const todayX =
    typeof todayIndex === "number" && points[todayIndex]
      ? points[todayIndex].x
      : null;

  // Build polyline path for dotted connector.
  const pathD = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
    .join(" ");

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="30-day price trend"
      onMouseLeave={() => setHover(null)}
    >
      {/* Connector */}
      <path
        d={pathD}
        fill="none"
        stroke="var(--spark-connector)"
        strokeWidth={1}
        strokeDasharray="1 4"
        strokeLinecap="round"
      />

      {/* Today hairline */}
      {todayX !== null && (
        <line
          x1={todayX}
          y1={4}
          x2={todayX}
          y2={height - 4}
          stroke="var(--accent-blue)"
          strokeWidth={1}
          strokeDasharray="2 3"
        />
      )}

      {/* Dots */}
      {points.map((p, i) => {
        const isCheap = i === cheapestIdx;
        const isHover = hover === i;
        const r = isCheap ? 4 : isHover ? 3 : 2;
        return (
          <g key={i}>
            {isCheap && (
              <circle
                cx={p.x}
                cy={p.y}
                r={5}
                fill="var(--spark-ring)"
              />
            )}
            <circle
              cx={p.x}
              cy={p.y}
              r={r}
              fill={isCheap ? "var(--brand-orange)" : "var(--spark-dot)"}
              onMouseEnter={() => setHover(i)}
              style={{ cursor: "pointer" }}
            />
          </g>
        );
      })}

      {/* Cheapest label */}
      {cheapest && (
        <text
          x={Math.max(8, Math.min(width - 8, cheapest.x))}
          y={Math.max(12, cheapest.y - 8)}
          textAnchor="middle"
          fill="var(--brand-orange)"
          style={{
            fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
            fontSize: 12,
            fontWeight: 500,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
          }}
        >
          ${cheapest.price} · {cheapest.date}
        </text>
      )}

      {/* Hover tooltip */}
      {hover !== null && points[hover] && hover !== cheapestIdx && (
        <g pointerEvents="none">
          <rect
            x={Math.min(width - 80, Math.max(0, points[hover].x - 36))}
            y={Math.max(2, points[hover].y - 24)}
            width={72}
            height={18}
            rx={4}
            fill="var(--surface)"
            stroke="var(--border)"
          />
          <text
            x={Math.min(width - 44, Math.max(36, points[hover].x))}
            y={Math.max(15, points[hover].y - 11)}
            textAnchor="middle"
            fill="var(--text-primary)"
            style={{
              fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
              fontSize: 12,
            }}
          >
            ${points[hover].price} · {points[hover].date}
          </text>
        </g>
      )}
    </svg>
  );
}
