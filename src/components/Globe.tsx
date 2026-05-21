"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";

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

const NATURAL_EARTH_50M =
  "https://unpkg.com/three-globe/example/country-polygons/ne_110m_admin_0_countries.geojson";
const NATURAL_EARTH_50M_HI =
  "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_0_countries.geojson";

export default function Globe({
  routes = [],
  airports = [],
}: {
  routes?: Route[];
  airports?: Airport[];
}) {
  const globeRef = useRef<unknown>(null);
  const [features, setFeatures] = useState<object[]>([]);
  const [theme, setTheme] = useState<ThemeMode>("light");
  const [size, setSize] = useState({ w: 800, h: 800 });
  const wrapRef = useRef<HTMLDivElement | null>(null);

  // Track theme switches (so colors update live).
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

  // Container size (react-globe.gl wants explicit width/height).
  useEffect(() => {
    if (!wrapRef.current) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize({ w: Math.max(320, width), h: Math.max(320, height) });
    });
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);

  // Fetch Natural Earth — try 50m hi-res first, fall back to 110m.
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      for (const url of [NATURAL_EARTH_50M_HI, NATURAL_EARTH_50M]) {
        try {
          const r = await fetch(url);
          if (!r.ok) continue;
          const gj: { features?: object[] } = await r.json();
          if (!cancelled && gj.features?.length) {
            setFeatures(gj.features);
            return;
          }
        } catch {
          /* try next */
        }
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  // Auto-rotate + initial POV.
  useEffect(() => {
    const g = globeRef.current as
      | {
          controls?: () => {
            autoRotate: boolean;
            autoRotateSpeed: number;
            enableZoom: boolean;
          };
          pointOfView?: (pov: {
            lat: number;
            lng: number;
            altitude: number;
          }) => void;
        }
      | null;
    if (!g) return;
    const controls = g.controls?.();
    if (controls) {
      controls.autoRotate = true;
      // ~0.3 rad/s mapped to react-globe.gl's auto-rotate scalar.
      controls.autoRotateSpeed = 0.35;
      controls.enableZoom = false;
    }
    g.pointOfView?.({ lat: 20, lng: 0, altitude: 2.4 });
  }, [features]);

  const dark = theme === "dark";
  const sphere = dark ? "#0F1015" : "#FFFFFF";
  const land = dark ? "#2A2C34" : "#E4E6EB";
  const landStroke = dark ? "#3D4049" : "#C7C9CF";
  const graticule = dark ? "#1C1D22" : "#EEEFF2";
  const atmosphere = "#4A9EFF";
  const pinRing = dark ? "#000000" : "#FFFFFF";

  // Lat/lng graticule (every 15°) for subtle "futuristic globe" detail.
  type PathPt = [number, number];
  const graticulePaths: PathPt[][] = (() => {
    const paths: PathPt[][] = [];
    // Parallels (lat lines).
    for (let lat = -75; lat <= 75; lat += 15) {
      const ring: PathPt[] = [];
      for (let lng = -180; lng <= 180; lng += 5) ring.push([lat, lng]);
      paths.push(ring);
    }
    // Meridians (lng lines).
    for (let lng = -180; lng < 180; lng += 15) {
      const line: PathPt[] = [];
      for (let lat = -85; lat <= 85; lat += 5) line.push([lat, lng]);
      paths.push(line);
    }
    return paths;
  })();

  type ArcD = {
    startLat: number;
    startLng: number;
    endLat: number;
    endLng: number;
  };
  const arcsData: ArcD[] = routes.map((r) => ({
    startLat: r.from.lat,
    startLng: r.from.lng,
    endLat: r.to.lat,
    endLng: r.to.lng,
  }));

  const pointsData = airports.map((a) => ({
    lat: a.lat,
    lng: a.lng,
    iata: a.iata,
  }));

  return (
    <div ref={wrapRef} className="absolute inset-0">
      <ReactGlobe
        ref={globeRef as never}
        width={size.w}
        height={size.h}
        backgroundColor="rgba(0,0,0,0)"
        showAtmosphere
        atmosphereColor={atmosphere}
        atmosphereAltitude={0.12}
        globeImageUrl={null}
        showGlobe
        polygonsData={features}
        polygonAltitude={0.006}
        polygonCapColor={() => land}
        polygonSideColor={() => "rgba(0,0,0,0)"}
        polygonStrokeColor={() => landStroke}
        pathsData={graticulePaths}
        pathPoints={(d: object) => d as PathPt[]}
        pathPointLat={(p: object) => (p as PathPt)[0]}
        pathPointLng={(p: object) => (p as PathPt)[1]}
        pathColor={() => graticule}
        pathStroke={0.4}
        pathDashLength={0}
        pathDashGap={0}
        pathTransitionDuration={0}
        arcsData={arcsData}
        arcColor={() => atmosphere}
        arcStroke={0.25}
        arcAltitude={0.25}
        arcDashLength={0.18}
        arcDashGap={0.12}
        arcDashAnimateTime={1200}
        pointsData={pointsData}
        pointLat={(d: object) => (d as { lat: number }).lat}
        pointLng={(d: object) => (d as { lng: number }).lng}
        pointAltitude={0.005}
        pointRadius={0.35}
        pointColor={() => atmosphere}
        pointLabel={(d: object) =>
          `<div style="
            font-family: var(--font-plex-mono), ui-monospace, monospace;
            font-size:12px; letter-spacing:0.04em; text-transform:uppercase;
            color:${dark ? "#F5F5F7" : "#0A0A0A"};
            background:${dark ? "#16171B" : "#FFFFFF"};
            border:1px solid ${dark ? "#26272C" : "#E5E5EA"};
            padding:4px 8px; border-radius:6px;">
            ${(d as { iata: string }).iata}
          </div>`
        }
        onGlobeReady={() => {
          // Apply solid sphere color post-mount by tweaking the globe material.
          // react-globe.gl exposes the underlying THREE objects via .scene().
          const g = globeRef.current as {
            scene?: () => {
              traverse: (cb: (o: unknown) => void) => void;
            };
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
      {/* Pin inner-ring fake (CSS dots can't sit on globe; the ring is faked
          via react-globe.gl's points + a thin atmosphere already provides
          enough separation against the pale continents). */}
      <style jsx>{`
        :global(.scene-tooltip) {
          pointer-events: none;
        }
      `}</style>
      <span className="sr-only">{pinRing}</span>
    </div>
  );
}
