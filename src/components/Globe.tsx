"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef } from "react";

const ReactGlobe = dynamic(() => import("react-globe.gl"), { ssr: false });

export type Arc = {
  startLat: number;
  startLng: number;
  endLat: number;
  endLng: number;
  color: string;
};

export default function Globe({ arcs = [] }: { arcs?: Arc[] }) {
  // ref typed loosely — react-globe.gl exposes a heavily-typed imperative API
  // that's not worth wrestling with here.
  const globeRef = useRef<unknown>(null);

  useEffect(() => {
    const g = globeRef.current as
      | {
          controls?: () => {
            autoRotate: boolean;
            autoRotateSpeed: number;
            enableZoom: boolean;
          };
          pointOfView?: (pov: { lat: number; lng: number; altitude: number }) => void;
        }
      | null;
    if (!g) return;
    const controls = g.controls?.();
    if (controls) {
      controls.autoRotate = true;
      controls.autoRotateSpeed = 0.35;
      controls.enableZoom = false;
    }
    g.pointOfView?.({ lat: 20, lng: 30, altitude: 2.2 });
  }, []);

  return (
    <div className="fixed inset-0 -z-10 bg-black">
      <ReactGlobe
        ref={globeRef as never}
        globeImageUrl="https://unpkg.com/three-globe/example/img/earth-night.jpg"
        bumpImageUrl="https://unpkg.com/three-globe/example/img/earth-topology.png"
        backgroundColor="rgba(0,0,0,0)"
        atmosphereColor="#7dd3fc"
        atmosphereAltitude={0.18}
        arcsData={arcs}
        arcColor={(d: object) => (d as Arc).color}
        arcStroke={0.5}
        arcDashLength={0.4}
        arcDashGap={0.2}
        arcDashAnimateTime={2000}
      />
    </div>
  );
}
