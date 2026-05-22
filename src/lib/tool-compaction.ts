import { createHash } from "node:crypto";
import { parseFlightOutput } from "./flight-parser";

const FLIGHT_SEARCH_LIMIT = 8;
const MAX_COMPACT_FLIGHT_SEARCH_BYTES = 20_000;
const RAW_RESPONSE_TTL_MS = 15 * 60 * 1000;

type ToolLike = Record<string, unknown> & {
  execute?: (...args: unknown[]) => unknown | Promise<unknown>;
};

type RawCacheEntry = {
  expiresAt: number;
  value: unknown;
};

export const rawToolResponseCache = new Map<string, RawCacheEntry>();

function purgeExpired(now = Date.now()) {
  for (const [key, entry] of rawToolResponseCache) {
    if (entry.expiresAt <= now) rawToolResponseCache.delete(key);
  }
}

export function getCachedRawToolResponse(hash: string): unknown | undefined {
  purgeExpired();
  const entry = rawToolResponseCache.get(hash);
  if (!entry) return undefined;
  if (entry.expiresAt <= Date.now()) {
    rawToolResponseCache.delete(hash);
    return undefined;
  }
  return entry.value;
}

function safeStringify(value: unknown): string {
  const seen = new WeakSet<object>();
  return JSON.stringify(value, (_key, current) => {
    if (typeof current !== "object" || current === null) return current;
    if (seen.has(current)) return "[Circular]";
    seen.add(current);
    return current;
  }) ?? "undefined";
}

function cacheRawResponse(value: unknown): string {
  const raw = safeStringify(value);
  const hash = createHash("sha256").update(raw).digest("hex");
  purgeExpired();
  rawToolResponseCache.set(hash, {
    expiresAt: Date.now() + RAW_RESPONSE_TTL_MS,
    value,
  });
  return hash;
}

function shortText(value: string | undefined, maxLength: number) {
  if (!value) return undefined;
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  return normalized.slice(0, maxLength - 1).trimEnd() + "…";
}

function compactFlightSearchResult(result: unknown) {
  const rawResponseHash = cacheRawResponse(result);
  const displayOptions = parseFlightOutput(result)
    .slice(0, FLIGHT_SEARCH_LIMIT)
    .map((flight) => ({
      id: flight.id,
      solutionId: flight.solutionId ?? flight.id,
      solutionToken: flight.solutionToken,
      airline: {
        name: flight.airlineName,
        code: flight.airlineCode,
      },
      flightNumbers: flight.flightNumbers,
      origin: flight.origin,
      destination: flight.destination,
      departure: {
        date: flight.depDate,
        time: flight.depTime,
      },
      arrival: {
        time: flight.arrTime,
        dayOffset: flight.arrDayOffset,
      },
      durationMinutes: flight.durationMin,
      stops: flight.stops,
      price: {
        minor: flight.priceMinor,
        currency: flight.currency,
      },
      baggageNote: shortText(flight.baggageNote, 120),
    }));

  const compacted = {
    compacted: true,
    rawResponseHash,
    data: { displayOptions },
  };

  if (safeStringify(compacted).length <= MAX_COMPACT_FLIGHT_SEARCH_BYTES) {
    return compacted;
  }

  const tighter = {
    ...compacted,
    data: {
      displayOptions: displayOptions.map((flight) => ({
        ...flight,
        baggageNote: shortText(flight.baggageNote, 40),
      })),
    },
  };

  if (safeStringify(tighter).length <= MAX_COMPACT_FLIGHT_SEARCH_BYTES) {
    return tighter;
  }

  return {
    ...compacted,
    data: {
      displayOptions: displayOptions.map(
        ({ baggageNote: _baggageNote, ...flight }) => flight
      ),
    },
  };
}

function shortErrorMessage(error: unknown): string {
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "Tool failed";
  const firstLine = raw.replace(/\s+/g, " ").trim().split(":")[0]?.trim();
  return shortText(firstLine || "Tool failed", 120) ?? "Tool failed";
}

function isFlightSearchTool(name: string) {
  return name === "flight_search" || name.endsWith("_flight_search");
}

export function wrapTools<T extends Record<string, unknown>>(tools: T): T {
  return Object.fromEntries(
    Object.entries(tools).map(([name, rawTool]) => {
      const tool = rawTool as ToolLike;
      if (typeof tool.execute !== "function") return [name, rawTool];

      const originalExecute = tool.execute.bind(tool) as (
        ...args: unknown[]
      ) => unknown | Promise<unknown>;

      const wrapped = {
        ...tool,
        execute: async (...args: unknown[]) => {
          try {
            const result = await originalExecute(...args);
            return isFlightSearchTool(name)
              ? compactFlightSearchResult(result)
              : result;
          } catch (error) {
            return { error: shortErrorMessage(error) };
          }
        },
      };

      return [name, wrapped as unknown as T[string]];
    })
  ) as T;
}
