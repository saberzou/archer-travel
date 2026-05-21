"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { HOT_DESTINATIONS, POPULAR_ROUTES } from "@/lib/hot-destinations";
import { AIRPORT_COORDS } from "@/lib/airports";

const ReactGlobe = dynamic(() => import("react-globe.gl"), { ssr: false });

export type Airport = {
  iata: string;
  lat: number;
  lng: number;
  label?: string;
};

export type Route = {
  from: Airport;
  to: Airport;
};

type ThemeMode = "light" | "dark";

const NATURAL_EARTH_HI =
  "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_0_countries.geojson";
const NATURAL_EARTH_LO =
  "https://unpkg.com/three-globe/example/country-polygons/ne_110m_admin_0_countries.geojson";

type GJ = {
  geometry?: {
    type: string;
    coordinates: number[][][] | number[][][][];
  };
};

type LandDot = { lat: number; lng: number };

type HotPoint = {
  lat: number;
  lng: number;
  iata: string;
  city: string;
  kind: "hot";
};

type LandPoint = LandDot & { kind: "land" };

type ArcDatum = {
  startLat: number;
  startLng: number;
  endLat: number;
  endLng: number;
  active: boolean;
};

export default function Globe({ routes = [] }: { routes?: Route[] }) {
  const globeRef = useRef<unknown>(null);
  const [features, setFeatures] = useState<GJ[]>([]);
  const [theme, setTheme] = useState<ThemeMode>("light");
  const [size, setSize] = useState({ w: 800, h: 800 });
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [activeRoute, setActiveRoute] = useState<Route | null>(null);

  // Track theme switches.
  useEffect(() => {
    const read = () =>
      setTheme(
        (document.documentElement.getAttribute("data-theme") as ThemeMode) ??
          "light"
      );
    read();
    const obs = new MutationObserver(read);
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => obs.disconnect();
  }, []);

  // Container size.
  useEffect(() => {
    if (!wrapRef.current) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize({ w: Math.max(320, width), h: Math.max(320, height) });
    });
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);

  // Fetch Natural Earth.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      for (const url of [NATURAL_EARTH_HI, NATURAL_EARTH_LO]) {
        try {
          const r = await fetch(url);
          if (!r.ok) continue;
          const gj: { features?: GJ[] } = await r.json();
          if (!cancelled && gj.features?.length) {
            setFeatures(gj.features);
            return;
          }
        } catch {
          /* try next */
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Rasterize landmasses to canvas, then sample on a grid to produce land dots.
  // Single pass, runs once when features arrive.
  const landDots: LandDot[] = useMemo(() => {
    if (!features.length || typeof document === "undefined") return [];
    const W = 1440;
    const H = 720;
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");
    if (!ctx) return [];
    ctx.fillStyle = "#ffffff";

    const project = (lng: number, lat: number): [number, number] => [
      ((lng + 180) / 360) * W,
      ((90 - lat) / 180) * H,
    ];

    const drawRing = (ring: number[][]) => {
      if (!ring.length) return;
      const [x0, y0] = project(ring[0][0], ring[0][1]);
      ctx.moveTo(x0, y0);
      for (let i = 1; i < ring.length; i++) {
        const [x, y] = project(ring[i][0], ring[i][1]);
        ctx.lineTo(x, y);
      }
      ctx.closePath();
    };

    for (const f of features) {
      const g = f.geometry;
      if (!g) continue;
      const polys: number[][][][] =
        g.type === "Polygon"
          ? [g.coordinates as number[][][]]
          : (g.coordinates as number[][][][]);
      ctx.beginPath();
      for (const poly of polys) {
        for (const ring of poly) drawRing(ring);
      }
      ctx.fill("evenodd");
    }

    const img = ctx.getImageData(0, 0, W, H);
    const dots: LandDot[] = [];
    const STEP = 1.5; // degrees — controls density
    for (let lat = -58; lat <= 78; lat += STEP) {
      for (let lng = -180; lng < 180; lng += STEP) {
        const x = Math.floor(((lng + 180) / 360) * W);
        const y = Math.floor(((90 - lat) / 180) * H);
        const idx = (y * W + x) * 4;
        if (img.data[idx + 3] > 0) dots.push({ lat, lng });
      }
    }
    return dots;
  }, [features]);

  // Listen for active-route focus event.
  useEffect(() => {
    const onFocus = (e: Event) => {
      const detail = (e as CustomEvent<{ from?: Airport; to?: Airport }>)
        .detail;
      if (detail?.from && detail?.to) {
        setActiveRoute({ from: detail.from, to: detail.to });
      }
    };
    window.addEventListener("archer:focus", onFocus as EventListener);
    return () =>
      window.removeEventListener("archer:focus", onFocus as EventListener);
  }, []);

  // Auto-rotate + pan-on-focus.
  useEffect(() => {
    const g = globeRef.current as
      | {
          controls?: () => {
            autoRotate: boolean;
            autoRotateSpeed: number;
            enableZoom: boolean;
          };
          pointOfView?: (
            pov: { lat: number; lng: number; altitude: number },
            ms?: number
          ) => void;
        }
      | null;
    if (!g) return;
    const controls = g.controls?.();
    if (controls) {
      controls.autoRotate = true;
      controls.autoRotateSpeed = 0.3;
      controls.enableZoom = false;
    }
    g.pointOfView?.({ lat: 20, lng: 0, altitude: 1.9 });

    if (!activeRoute) return;
    const c = g.controls?.();
    if (c) c.autoRotate = false;
    const { from, to } = activeRoute;
    const lat = (from.lat + to.lat) / 2;
    let dLng = to.lng - from.lng;
    if (dLng > 180) dLng -= 360;
    if (dLng < -180) dLng += 360;
    const lng = from.lng + dLng / 2;
    g.pointOfView?.({ lat, lng, altitude: 1.6 }, 1400);
  }, [activeRoute, landDots]);

  const dark = theme === "dark";
  const sphere = dark ? "#0F1015" : "#FFFFFF";
  const landColor = dark ? "#3D4049" : "#C7C9CF";
  const hotColor = "#4A9EFF";
  const activeColor = "#FF6A00";
  const popularArc = dark ? "rgba(180,200,230,0.35)" : "rgba(74,158,255,0.45)";
  const atmosphere = "#4A9EFF";

  // Combined point cloud: land dots (tiny, dim) + hot destinations (bright halo).
  const allPoints: (LandPoint | HotPoint)[] = useMemo(
    () => [
      ...landDots.map((d) => ({ ...d, kind: "land" as const })),
      ...HOT_DESTINATIONS.map((h) => ({
        lat: h.lat,
        lng: h.lng,
        iata: h.iata,
        city: h.city,
        kind: "hot" as const,
      })),
    ],
    [landDots]
  );

  // Arcs: popular routes (faint, ambient) + active route (bright, animated).
  const allArcs: ArcDatum[] = useMemo(() => {
    const pop: ArcDatum[] = POPULAR_ROUTES.flatMap((r) => {
      const a = AIRPORT_COORDS[r.from];
      const b = AIRPORT_COORDS[r.to];
      if (!a || !b) return [];
      return [
        {
          startLat: a.lat,
          startLng: a.lng,
          endLat: b.lat,
          endLng: b.lng,
          active: false,
        },
      ];
    });
    const active: ArcDatum[] = activeRoute
      ? [
          {
            startLat: activeRoute.from.lat,
            startLng: activeRoute.from.lng,
            endLat: activeRoute.to.lat,
            endLng: activeRoute.to.lng,
            active: true,
          },
        ]
      : [];
    // External routes (passed via props) also treated as active.
    const ext: ArcDatum[] = routes.map((r) => ({
      startLat: r.from.lat,
      startLng: r.from.lng,
      endLat: r.to.lat,
      endLng: r.to.lng,
      active: true,
    }));
    return [...pop, ...ext, ...active];
  }, [activeRoute, routes]);

  // Labels: hot destinations always; active endpoints emphasized.
  const labelsData = useMemo(
    () =>
      HOT_DESTINATIONS.map((h) => ({
        lat: h.lat,
        lng: h.lng,
        iata: h.iata,
      })),
    []
  );

  return (
    <div ref={wrapRef} className="absolute inset-0">
      <ReactGlobe
        ref={globeRef as never}
        width={size.w}
        height={size.h}
        backgroundColor="rgba(0,0,0,0)"
        showAtmosphere
        atmosphereColor={atmosphere}
        atmosphereAltitude={0.14}
        globeImageUrl={null}
        showGlobe
        // No polygons — continents are drawn as dot matrix below.
        pointsData={allPoints}
        pointLat={(d: object) => (d as { lat: number }).lat}
        pointLng={(d: object) => (d as { lng: number }).lng}
        pointAltitude={(d: object) =>
          (d as { kind: string }).kind === "hot" ? 0.015 : 0.003
        }
        pointRadius={(d: object) =>
          (d as { kind: string }).kind === "hot" ? 0.42 : 0.16
        }
        pointColor={(d: object) =>
          (d as { kind: string }).kind === "hot" ? hotColor : landColor
        }
        pointResolution={6}
        arcsData={allArcs}
        arcColor={(d: object) =>
          (d as ArcDatum).active ? activeColor : popularArc
        }
        arcStroke={(d: object) => ((d as ArcDatum).active ? 1.0 : 0.45)}
        arcAltitude={(d: object) => ((d as ArcDatum).active ? 0.34 : 0.2)}
        // Popular routes: gentle marching pulse (long dash + tiny gap so they
        // still read as continuous, but feel alive). Active: classic chase.
        arcDashLength={(d: object) => ((d as ArcDatum).active ? 0.35 : 0.9)}
        arcDashGap={(d: object) => ((d as ArcDatum).active ? 0.65 : 0.1)}
        arcDashAnimateTime={(d: object) =>
          (d as ArcDatum).active ? 2200 : 6000
        }
        arcDashInitialGap={(d: object) =>
          (d as ArcDatum).active ? 0 : Math.random()
        }
        arcsTransitionDuration={0}
        pointsMerge={false}
        onPointHover={(p: object | null) => {
          document.body.style.cursor =
            p && (p as { kind?: string }).kind === "hot" ? "pointer" : "auto";
        }}
        pointLabel={(d: object) => {
          const p = d as { kind?: string; iata?: string; city?: string };
          if (p.kind !== "hot") return "";
          return `<div style="
              font-family: var(--font-plex-mono), ui-monospace, monospace;
              background:${dark ? "#16171B" : "#FFFFFF"};
              color:${dark ? "#F5F5F7" : "#0A0A0A"};
              border:1px solid ${dark ? "#26272C" : "#E5E5EA"};
              padding:6px 10px; border-radius:8px;
              box-shadow:0 4px 14px rgba(0,0,0,${dark ? "0.45" : "0.12"});
              white-space:nowrap;
              transform: translateY(-6px);
            ">
              <div style="font-size:13px; letter-spacing:0.06em; font-weight:600;">
                ${p.iata ?? ""}
              </div>
              <div style="
                font-family: var(--font-inter), system-ui, sans-serif;
                font-size:11px; opacity:0.7; margin-top:2px; letter-spacing:0.01em;">
                ${p.city ?? ""}
              </div>
            </div>`;
        }}
        labelsData={labelsData}
        labelLat={(d: object) => (d as { lat: number }).lat}
        labelLng={(d: object) => (d as { lng: number }).lng}
        labelText={(d: object) => (d as { iata: string }).iata}
        labelSize={0.42}
        labelDotRadius={0}
        labelAltitude={0.025}
        labelColor={() => (dark ? "rgba(245,245,247,0.85)" : "rgba(10,10,10,0.7)")}
        labelResolution={2}
        labelIncludeDot={false}
        onGlobeReady={() => {
          const g = globeRef.current as {
            scene?: () => { traverse: (cb: (o: unknown) => void) => void };
          } | null;
          if (!g?.scene) return;
          g.scene().traverse((obj: unknown) => {
            const o = obj as {
              isMesh?: boolean;
              geometry?: { type?: string };
              material?: { color?: { set: (c: string) => void } };
            };
            if (
              o.isMesh &&
              o.geometry?.type === "SphereGeometry" &&
              o.material?.color
            ) {
              o.material.color.set(sphere);
            }
          });
        }}
      />
      <style jsx>{`
        :global(.scene-tooltip) {
          pointer-events: none;
        }
      `}</style>
    </div>
  );
}
