"use client";

import { motion } from "framer-motion";
import { Plane, Luggage } from "lucide-react";

export type RouteSeg = {
  departure: string;
  departureDate?: string;
  departureTime: string;
  departureTerminal?: string;
  arrival: string;
  arrivalDate?: string;
  arrivalTime: string;
  arrivalTerminal?: string;
};

export type FlightOption = {
  label?: string;
  solutionId?: string;
  priceTotal: number | string;
  currency?: string;
  duration?: string;
  transferNum?: number;
  flights?: Array<{ airlineCode?: string; flightNo?: string }>;
  route?: RouteSeg[];
  baggageSummary?: string;
  cabinClass?: string;
  cabinCode?: string;
  missingSegment?: boolean;
};

export default function FlightCard({
  option,
  index,
  onPick,
}: {
  option: FlightOption;
  index: number;
  onPick?: (i: number) => void;
}) {
  const first = option.route?.[0];
  const last = option.route?.[option.route.length - 1];
  const airlines = Array.from(
    new Set((option.flights ?? []).map((f) => f.airlineCode).filter(Boolean))
  ) as string[];
  const stops =
    option.transferNum === 0
      ? "Nonstop"
      : `${option.transferNum ?? (option.route?.length ?? 1) - 1} stop${
          (option.transferNum ?? 0) > 1 ? "s" : ""
        }`;

  return (
    <motion.button
      type="button"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04 }}
      onClick={() => onPick?.(index)}
      className="group w-full text-left rounded-2xl border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] hover:border-white/20 transition p-4 backdrop-blur"
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex gap-1">
          {airlines.map((a) => (
            <span
              key={a}
              className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-white/10 text-white/80"
            >
              {a}
            </span>
          ))}
          {option.cabinClass && (
            <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-sky-400/10 text-sky-300">
              {option.cabinClass}
            </span>
          )}
        </div>
        <div className="text-right">
          <div className="text-xl font-semibold tabular-nums">
            {option.currency ?? ""} {option.priceTotal}
          </div>
        </div>
      </div>

      <div className="flex items-end gap-3">
        <div>
          <div className="text-2xl font-medium tabular-nums">
            {first?.departureTime ?? "--:--"}
          </div>
          <div className="text-xs text-white/60">{first?.departure}</div>
        </div>

        <div className="flex-1 flex flex-col items-center text-xs text-white/50">
          <div>{option.duration ?? ""}</div>
          <div className="relative w-full h-px bg-white/15 my-1">
            <Plane className="absolute -top-2 right-0 h-3 w-3 text-white/60" />
          </div>
          <div>{stops}</div>
        </div>

        <div className="text-right">
          <div className="text-2xl font-medium tabular-nums">
            {last?.arrivalTime ?? "--:--"}
          </div>
          <div className="text-xs text-white/60">{last?.arrival}</div>
        </div>
      </div>

      {option.baggageSummary && (
        <div className="mt-3 flex items-center gap-1.5 text-xs text-white/60">
          <Luggage className="h-3 w-3" />
          <span>{option.baggageSummary}</span>
        </div>
      )}

      <div className="mt-2 text-[11px] text-white/40 opacity-0 group-hover:opacity-100 transition">
        Click to book option {index + 1}
      </div>
    </motion.button>
  );
}
