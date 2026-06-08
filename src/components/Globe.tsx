"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { HOT_DESTINATIONS, POPULAR_ROUTES } from "@/lib/hot-destinations";
import { AIRPORT_COORDS } from "@/lib/airports";

// Great-circle slerp between two lat/lng points.
function greatCircle(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
  t: number
): { lat: number; lng: number } {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;
  const f1 = toRad(lat1),
    l1 = toRad(lng1),
    f2 = toRad(lat2),
    l2 = toRad(lng2);
  const x1 = Math.cos(f1) * Math.cos(l1);
  const y1 = Math.cos(f1) * Math.sin(l1);
  const z1 = Math.sin(f1);
  const x2 = Math.cos(f2) * Math.cos(l2);
  const y2 = Math.cos(f2) * Math.sin(l2);
  const z2 = Math.sin(f2);
  const dot = Math.max(-1, Math.min(1, x1 * x2 + y1 * y2 + z1 * z2));
  const w = Math.acos(dot);
  if (w < 1e-6) return { lat: lat1, lng: lng1 };
  const sw = Math.sin(w);
  const a = Math.sin((1 - t) * w) / sw;
  const b = Math.sin(t * w) / sw;
  const x = a * x1 + b * x2;
  const y = a * y1 + b * y2;
  const z = a * z1 + b * z2;
  return {
    lat: toDeg(Math.asin(z)),
    lng: toDeg(Math.atan2(y, x)),
  };
}

// Initial bearing from p1 to p2, in radians (0=N, π/2=E).
function bearingRad(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const f1 = toRad(lat1),
    f2 = toRad(lat2);
  const dl = toRad(lng2 - lng1);
  const y = Math.sin(dl) * Math.cos(f2);
  const x =
    Math.cos(f1) * Math.sin(f2) -
    Math.sin(f1) * Math.cos(f2) * Math.cos(dl);
  return Math.atan2(y, x);
}

// Paper-plane silhouette laid flat in local XY plane (tangent to globe surface).
// Nose points along +Y (will be rotated around Z by bearing), wings span X.
// three-globe sets local +Z = normal to surface, so the plane "sits" on its belly.
function makePaperPlane(color: string, opacity = 1): THREE.Group {
  const group = new THREE.Group();
  const geom = new THREE.BufferGeometry();
  const verts = new Float32Array([
    0, 2.8, 0, // 0: nose (forward)
    -1.7, -1.6, 0, // 1: left wing tip
    1.7, -1.6, 0, // 2: right wing tip
    0, -1.0, 0.35, // 3: tail crease (raised slightly off surface)
    0, -0.6, 0, // 4: belly center
  ]);
  const indices = new Uint16Array([
    0, 1, 4, // left belly
    0, 4, 2, // right belly
    1, 3, 4, // left crease top
    4, 3, 2, // right crease top
  ]);
  geom.setAttribute("position", new THREE.BufferAttribute(verts, 3));
  geom.setIndex(new THREE.BufferAttribute(indices, 1));
  geom.computeVertexNormals();
  const mat = new THREE.MeshBasicMaterial({
    color,
    side: THREE.DoubleSide,
    transparent: opacity < 1,
    opacity,
  });
  group.add(new THREE.Mesh(geom, mat));
  return group;
}

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
  const [size, setSize] = useState({ w: 0, h: 0 });
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
      setSize({
        w: Math.max(0, Math.floor(width)),
        h: Math.max(0, Math.floor(height)),
      });
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

  // Auto-rotate + initial pose. Runs once on globe ready.
  const initialPoseSet = useRef(false);
  const setupGlobe = () => {
    const g = globeRef.current as
      | {
          controls?: () => {
            autoRotate: boolean;
            autoRotateSpeed: number;
            enableZoom: boolean;
            minDistance?: number;
            maxDistance?: number;
            zoomSpeed?: number;
          };
          pointOfView?: (
            pov: { lat?: number; lng?: number; altitude?: number },
            ms?: number
          ) => void;
        }
      | null;
    if (!g || initialPoseSet.current) return;
    initialPoseSet.current = true;
    const controls = g.controls?.();
    if (controls) {
      controls.autoRotate = true;
      controls.autoRotateSpeed = 0.3;
      controls.enableZoom = true;
      controls.zoomSpeed = 0.6;
      const b = distanceBoundsForViewport(size.h);
      controls.minDistance = b.min;
      controls.maxDistance = b.max;
    }
    g.pointOfView?.(
      { lat: 20, lng: 0, altitude: altitudeForTargetVh(size.h, 0.82) },
      1200
    );
  };

  // react-globe.gl: GLOBE_RADIUS=100, FOV=50°.
  // Sphere angular size = 2 * asin(100 / camera_distance).
  // Pixel diameter ≈ (angular / FOV_rad) * canvas_height.
  // Solve for camera DISTANCE given a target pixel diameter.
  const FOV_RAD = (50 * Math.PI) / 180;
  function distanceForTargetPx(targetPx: number, canvasH: number): number {
    const angular = (targetPx / canvasH) * FOV_RAD;
    return 100 / Math.sin(angular / 2);
  }
  function altitudeForTargetVh(canvasH: number, vhFrac: number): number {
    if (!canvasH) return 1.9;
    const vh = typeof window !== "undefined" ? window.innerHeight : canvasH;
    const dist = distanceForTargetPx(vh * vhFrac, canvasH);
    return Math.max(0.05, Math.min(8, dist / 100 - 1));
  }
  // Zoom-in CEILING = 90vh diameter → SMALLEST camera distance.
  // Zoom-out FLOOR  = 70vh diameter → LARGEST camera distance.
  function distanceBoundsForViewport(canvasH: number): { min: number; max: number } {
    const vh = typeof window !== "undefined" ? window.innerHeight : canvasH;
    return {
      min: distanceForTargetPx(vh * 0.90, canvasH),
      max: distanceForTargetPx(vh * 0.70, canvasH),
    };
  }

  // Re-fit altitude whenever container size OR viewport height changes.
  const [vh, setVh] = useState(
    typeof window !== "undefined" ? window.innerHeight : 0
  );
  useEffect(() => {
    const onResize = () => setVh(window.innerHeight);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  useEffect(() => {
    if (!initialPoseSet.current || activeRoute) return;
    const g = globeRef.current as
      | {
          controls?: () => {
            minDistance?: number;
            maxDistance?: number;
          };
          pointOfView?: (
            pov: { altitude?: number },
            ms?: number
          ) => void;
        }
      | null;
    const controls = g?.controls?.();
    if (controls) {
      const b = distanceBoundsForViewport(size.h);
      controls.minDistance = b.min;
      controls.maxDistance = b.max;
    }
    g?.pointOfView?.({ altitude: altitudeForTargetVh(size.h, 0.82) }, 400);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size.w, size.h, vh]);

  // Pan-on-focus when an active route arrives.
  useEffect(() => {
    if (!activeRoute) return;
    const g = globeRef.current as
      | {
          controls?: () => { autoRotate: boolean };
          pointOfView?: (
            pov: { lat: number; lng: number; altitude: number },
            ms?: number
          ) => void;
        }
      | null;
    if (!g) return;
    const c = g.controls?.();
    if (c) c.autoRotate = false;
    const { from, to } = activeRoute;
    const lat = (from.lat + to.lat) / 2;
    let dLng = to.lng - from.lng;
    if (dLng > 180) dLng -= 360;
    if (dLng < -180) dLng += 360;
    const lng = from.lng + dLng / 2;
    // Great-circle distance (degrees) → altitude.
    // Short hop (HKG→TPE ~6°): tight zoom 0.7. Long-haul (LAX→NRT ~80°): wide 1.8.
    const dLat = to.lat - from.lat;
    const dist = Math.sqrt(dLat * dLat + dLng * dLng);
    const altitude = Math.max(0.7, Math.min(1.9, 0.4 + dist / 50));
    g.pointOfView?.({ lat, lng, altitude }, 1400);
  }, [activeRoute]);

  const dark = theme === "dark";
  const sphere = dark ? "#0F1015" : "#FFFFFF";
  const landColor = dark ? "#3D4049" : "#C7C9CF";
  const hotColor = "#FF6A00";
  const activeColor = "#FF6A00";
  const popularArc = dark ? "rgba(255,170,90,0.40)" : "rgba(255,106,0,0.45)";

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

  // Animated plane(s) — one per active arc, loops along great circle in sync
  // with the 2200ms arcDashAnimateTime. Popular arcs keep the ambient dash flow.
  const planeRoutes = useMemo(() => {
    const r: { startLat: number; startLng: number; endLat: number; endLng: number }[] = [];
    if (activeRoute) {
      r.push({
        startLat: activeRoute.from.lat,
        startLng: activeRoute.from.lng,
        endLat: activeRoute.to.lat,
        endLng: activeRoute.to.lng,
      });
    }
    for (const ext of routes) {
      r.push({
        startLat: ext.from.lat,
        startLng: ext.from.lng,
        endLat: ext.to.lat,
        endLng: ext.to.lng,
      });
    }
    return r;
  }, [activeRoute, routes]);

  const [planeTick, setPlaneTick] = useState(0);
  const rafRef = useRef<number | null>(null);
  const startTsRef = useRef<number>(0);
  useEffect(() => {
    if (planeRoutes.length === 0) return;
    startTsRef.current = performance.now();
    const loop = (now: number) => {
      setPlaneTick(((now - startTsRef.current) % 2200) / 2200);
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [planeRoutes.length]);

  // Ambient popular-route planes — one per POPULAR_ROUTES arc, looping on the
  // same 6000ms cadence as the popular arc dash march. Each plane gets a
  // deterministic per-route phase offset so they don't fly in lockstep.
  const popularPlaneRoutes = useMemo(() => {
    const out: {
      startLat: number;
      startLng: number;
      endLat: number;
      endLng: number;
      offset: number;
      key: string;
    }[] = [];
    for (const r of POPULAR_ROUTES) {
      const a = AIRPORT_COORDS[r.from];
      const b = AIRPORT_COORDS[r.to];
      if (!a || !b) continue;
      // Deterministic hash from IATA pair → stable phase in [0,1).
      const seed = `${r.from}->${r.to}`;
      let h = 0;
      for (let i = 0; i < seed.length; i++) {
        h = (h * 31 + seed.charCodeAt(i)) | 0;
      }
      const offset = ((h >>> 0) % 1000) / 1000;
      out.push({
        startLat: a.lat,
        startLng: a.lng,
        endLat: b.lat,
        endLng: b.lng,
        offset,
        key: seed,
      });
    }
    return out;
  }, []);

  const [popularPlaneTick, setPopularPlaneTick] = useState(0);
  const popularRafRef = useRef<number | null>(null);
  const popularStartTsRef = useRef<number>(0);
  useEffect(() => {
    if (popularPlaneRoutes.length === 0) return;
    popularStartTsRef.current = performance.now();
    const loop = (now: number) => {
      // Normalized time in [0,1) for a 6000ms loop — matches popular arc dash.
      setPopularPlaneTick(((now - popularStartTsRef.current) % 6000) / 6000);
      popularRafRef.current = requestAnimationFrame(loop);
    };
    popularRafRef.current = requestAnimationFrame(loop);
    return () => {
      if (popularRafRef.current != null) cancelAnimationFrame(popularRafRef.current);
    };
  }, [popularPlaneRoutes.length]);

  type PlaneDatum = {
    lat: number;
    lng: number;
    alt: number;
    heading: number;
    key: string;
    kind: "active" | "ambient";
  };
  const activePlanesData: PlaneDatum[] = useMemo(() => {
    return planeRoutes.map((r, i) => {
      const t = planeTick;
      const p = greatCircle(r.startLat, r.startLng, r.endLat, r.endLng, t);
      // Look-ahead point for heading (matches arc tangent direction).
      const tNext = Math.min(0.999, t + 0.01);
      const pNext = greatCircle(
        r.startLat,
        r.startLng,
        r.endLat,
        r.endLng,
        tNext
      );
      const heading = bearingRad(p.lat, p.lng, pNext.lat, pNext.lng);
      // Match arcAltitude=0.34 with a sine bump.
      const alt = Math.sin(Math.PI * t) * 0.34;
      return {
        lat: p.lat,
        lng: p.lng,
        alt,
        heading,
        key: `${r.startLat},${r.startLng}->${r.endLat},${r.endLng}#${i}`,
        kind: "active" as const,
      };
    });
  }, [planeRoutes, planeTick]);

  const ambientPlanesData: PlaneDatum[] = useMemo(() => {
    return popularPlaneRoutes.map((r) => {
      // Per-route staggered phase: base tick + deterministic offset, mod 1.
      const t = (popularPlaneTick + r.offset) % 1;
      const p = greatCircle(r.startLat, r.startLng, r.endLat, r.endLng, t);
      const tNext = Math.min(0.999, t + 0.01);
      const pNext = greatCircle(
        r.startLat,
        r.startLng,
        r.endLat,
        r.endLng,
        tNext
      );
      const heading = bearingRad(p.lat, p.lng, pNext.lat, pNext.lng);
      // Match popular arcAltitude=0.2 so planes hug their own arcs.
      const alt = Math.sin(Math.PI * t) * 0.2;
      return {
        lat: p.lat,
        lng: p.lng,
        alt,
        heading,
        key: `popular:${r.key}`,
        kind: "ambient" as const,
      };
    });
  }, [popularPlaneRoutes, popularPlaneTick]);

  const planesData: PlaneDatum[] = useMemo(
    () => [...ambientPlanesData, ...activePlanesData],
    [ambientPlanesData, activePlanesData]
  );

  // Cache mesh per active color so we don't rebuild geometry every frame.
  const planeMeshRef = useRef<THREE.Group | null>(null);
  const planeMeshColorRef = useRef<string>("");
  // Separate cache for ambient (popular) planes — distinct color + scale.
  const popularPlaneMeshRef = useRef<THREE.Group | null>(null);
  const popularPlaneMeshColorRef = useRef<string>("");

  return (
    <div ref={wrapRef} className="absolute inset-0 overflow-hidden -translate-y-[8%] md:translate-y-0">
      {size.w > 0 && size.h > 0 && (
        <ReactGlobe
          ref={globeRef as never}
          width={size.w}
          height={size.h}
        backgroundColor="rgba(0,0,0,0)"
        showAtmosphere={false}
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
        objectsData={planesData}
        objectLat={(d: object) => (d as PlaneDatum).lat}
        objectLng={(d: object) => (d as PlaneDatum).lng}
        objectAltitude={(d: object) => (d as PlaneDatum).alt}
        objectThreeObject={(d: object): THREE.Object3D => {
          const datum = d as PlaneDatum;
          if (datum.kind === "ambient") {
            if (
              !popularPlaneMeshRef.current ||
              popularPlaneMeshColorRef.current !== popularArc
            ) {
              popularPlaneMeshRef.current = makePaperPlane(popularArc, 0.85);
              popularPlaneMeshColorRef.current = popularArc;
            }
            const inst = popularPlaneMeshRef.current.clone();
            // ~55% scale — clearly subordinate to the bright active plane.
            inst.scale.setScalar(0.55);
            return inst;
          }
          if (
            !planeMeshRef.current ||
            planeMeshColorRef.current !== activeColor
          ) {
            planeMeshRef.current = makePaperPlane(activeColor);
            planeMeshColorRef.current = activeColor;
          }
          // Clone so each instance has its own transform; share geometry/material via mesh ref.
          return planeMeshRef.current.clone();
        }}
        objectRotation={(d: object) => {
          // three-globe applies rotation in local frame: x=pitch, y=yaw, z=roll.
          // Our plane lies in local XY, nose along +Y. Heading 0 = north = +Y already.
          // Rotate around local Z (surface normal) by -heading (screen-space cw vs math ccw).
          const h = (d as PlaneDatum).heading;
          return { x: 0, y: 0, z: -h };
        }}
          onGlobeReady={() => {
            setupGlobe();
            const g = globeRef.current as {
              scene?: () => { traverse: (cb: (o: unknown) => void) => void };
            } | null;
            if (!g?.scene) return;
            g.scene().traverse((obj: unknown) => {
              const o = obj as {
                isMesh?: boolean;
                geometry?: { type?: string };
                material?: {
                  color?: { set: (c: string) => void };
                  transparent?: boolean;
                  opacity?: number;
                  needsUpdate?: boolean;
                };
              };
              if (
                o.isMesh &&
                o.geometry?.type === "SphereGeometry" &&
                o.material
              ) {
                o.material.color?.set(sphere);
                o.material.transparent = true;
                o.material.opacity = dark ? 0.35 : 0.55;
                o.material.needsUpdate = true;
              }
            });
          }}
        />
      )}
      <style jsx>{`
        :global(.scene-tooltip) {
          pointer-events: none;
        }
      `}</style>
    </div>
  );
}
