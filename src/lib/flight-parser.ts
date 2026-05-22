type Maybe<T> = T | null | undefined;

export type ParsedFlight = {
  id: string;
  solutionId?: string;
  solutionToken?: string;
  airlineName: string;
  airlineCode: string;
  flightNumbers: string[];
  stops: number;
  origin: string;
  destination: string;
  depDate: string;
  depTime: string;
  arrTime: string;
  arrDayOffset: number;
  durationMin: number;
  priceMinor: number;
  currency: string;
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

function unwrap(output: unknown): unknown {
  if (output == null) return null;
  const content = get<unknown[]>(output, ["content"]);
  if (Array.isArray(content)) {
    for (const c of content) {
      const text = get<string>(c, ["text"]);
      if (typeof text === "string") {
        try {
          return JSON.parse(text);
        } catch {
          return text;
        }
      }
    }
  }
  return output;
}

function parseCompactOptions(payload: unknown): ParsedFlight[] {
  const options =
    get<unknown[]>(payload, ["data", "displayOptions"]) ??
    get<unknown[]>(payload, ["displayOptions"]);
  if (!Array.isArray(options)) return [];

  return options.flatMap((opt, i) => {
    const origin = asString(get(opt, ["origin"]));
    const destination = asString(get(opt, ["destination"]));
    const id =
      asString(get(opt, ["id"])) ??
      asString(get(opt, ["solutionId"])) ??
      `opt-${i}`;
    if (!origin || !destination) return [];

    return [
      {
        id,
        solutionId: asString(get(opt, ["solutionId"])) ?? id,
        solutionToken: asString(get(opt, ["solutionToken"])) ?? undefined,
        airlineName: asString(get(opt, ["airline", "name"])) ?? "Airline",
        airlineCode: asString(get(opt, ["airline", "code"])) ?? "",
        flightNumbers: Array.isArray(get(opt, ["flightNumbers"]))
          ? (get<unknown[]>(opt, ["flightNumbers"]) ?? []).filter(
              (x): x is string => typeof x === "string"
            )
          : [],
        stops: asNumber(get(opt, ["stops"])) ?? 0,
        origin,
        destination,
        depDate: asString(get(opt, ["departure", "date"])) ?? "",
        depTime: asString(get(opt, ["departure", "time"])) ?? "",
        arrTime: asString(get(opt, ["arrival", "time"])) ?? "",
        arrDayOffset: asNumber(get(opt, ["arrival", "dayOffset"])) ?? 0,
        durationMin: asNumber(get(opt, ["durationMinutes"])) ?? 0,
        priceMinor: asNumber(get(opt, ["price", "minor"])) ?? 0,
        currency: asString(get(opt, ["price", "currency"])) ?? "CNY",
        baggageNote: asString(get(opt, ["baggageNote"])) ?? undefined,
      },
    ];
  });
}

function parseDisplayOptions(payload: unknown): ParsedFlight[] {
  const compact = parseCompactOptions(payload);
  if (compact.length > 0) return compact;

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
    const solutionId =
      asString(get(opt, ["solutionId"])) ?? asString(get(opt, ["id"]));
    const id = solutionId ?? `opt-${i}`;

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
      const m = s.match(/^(\d{4}-\d{2}-\d{2})[T\s](\d{2}:\d{2})/);
      if (m) return { date: m[1], time: m[2] };
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
      arrDayOffset = Math.round((b.getTime() - a.getTime()) / 86_400_000);
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

    const baggageNote =
      asString(get(opt, ["baggage", "summary"])) ??
      asString(get(opt, ["baggage"])) ??
      undefined;

    out.push({
      id,
      solutionId: solutionId ?? id,
      solutionToken: asString(get(opt, ["solutionToken"])) ?? undefined,
      airlineName,
      airlineCode,
      flightNumbers,
      stops: Math.max(segments.length - 1, 0),
      origin,
      destination,
      depDate: dep.date,
      depTime: dep.time,
      arrTime: arr.time,
      arrDayOffset,
      durationMin:
        asNumber(get(opt, ["totalDurationMinutes"])) ??
        asNumber(get(opt, ["duration"])) ??
        asNumber(get(opt, ["totalDuration"])) ??
        0,
      priceMinor:
        asNumber(get(opt, ["price", "amount"])) ??
        asNumber(get(opt, ["totalPrice"])) ??
        asNumber(get(opt, ["price"])) ??
        0,
      currency:
        asString(get(opt, ["price", "currency"])) ??
        asString(get(opt, ["currency"])) ??
        "CNY",
      baggageNote: baggageNote ?? undefined,
    });
  }
  return out;
}

export function parseFlightOutput(output: unknown): ParsedFlight[] {
  return parseDisplayOptions(unwrap(output));
}
