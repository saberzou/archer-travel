"use client";

import {
  motion,
  useMotionValue,
  animate,
  useDragControls,
  type PanInfo,
} from "framer-motion";
import { useEffect, useState, type ReactNode } from "react";

/**
 * Chat container that renders differently on mobile vs desktop:
 *   - desktop (md+): static right column matching the old page.tsx layout
 *     (basis-32%, full-height, border-l, bg-[var(--bg)]). No drag, no handle.
 *   - mobile: an absolute-positioned bottom sheet that can be dragged to one
 *     of three snap points (expanded / default / collapsed). The handle bar
 *     at the top is the drag affordance; tap cycles toward expanded.
 *
 * Snap points are fractions of the body area (viewport minus header):
 *   0.1  = expanded (chat covers most of globe)
 *   0.45 = default (~55% sheet, matches prior behavior)
 *   0.7  = collapsed (just shows the handle + a sliver)
 */
const SNAPS = [0.1, 0.45, 0.7];
const DEFAULT_INDEX = 1;

export default function ChatSheet({ children }: { children: ReactNode }) {
  const [isMobile, setIsMobile] = useState<boolean | null>(null);
  const [containerH, setContainerH] = useState(0);
  const y = useMotionValue(0);
  const dragControls = useDragControls();

  useEffect(() => {
    const update = () => {
      const mobile = window.matchMedia("(max-width: 767px)").matches;
      setIsMobile(mobile);
      const header = document.querySelector("header");
      const h = window.innerHeight - (header?.getBoundingClientRect().height ?? 56);
      setContainerH(h);
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
    };
  }, []);

  useEffect(() => {
    if (!isMobile || containerH === 0) return;
    y.set(SNAPS[DEFAULT_INDEX] * containerH);
  }, [isMobile, containerH, y]);

  // Desktop: static right column. Use CSS-only fallback before hydration
  // (isMobile === null) so SSR doesn't flash.
  if (isMobile === false) {
    return (
      <section
        className="basis-[32%] flex-[0_0_32%] flex flex-col bg-[var(--bg)] border-l border-[var(--border)]"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {children}
      </section>
    );
  }

  if (isMobile === null) {
    // SSR / pre-hydration: render both layouts via CSS to avoid flash.
    // Mobile shape is the visible one until JS resolves.
    return (
      <section
        className="absolute left-0 right-0 bottom-0 h-[55%] md:static md:h-auto md:basis-[32%] md:flex-[0_0_32%] flex flex-col bg-[var(--bg)] border-t md:border-t-0 md:border-l border-[var(--border)] rounded-t-2xl md:rounded-none shadow-[0_-8px_24px_rgba(0,0,0,0.08)] md:shadow-none z-10"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {children}
      </section>
    );
  }

  // Mobile draggable sheet.
  const minY = SNAPS[0] * containerH;
  const maxY = SNAPS[SNAPS.length - 1] * containerH;

  const snapTo = (px: number) =>
    animate(y, px, { type: "spring", stiffness: 380, damping: 38, mass: 0.8 });

  const onDragEnd = (_: unknown, info: PanInfo) => {
    const projected = y.get() + info.velocity.y * 0.15;
    let nearest = SNAPS[0] * containerH;
    let bestDist = Infinity;
    for (const s of SNAPS) {
      const px = s * containerH;
      const d = Math.abs(px - projected);
      if (d < bestDist) {
        bestDist = d;
        nearest = px;
      }
    }
    snapTo(nearest);
  };

  const onHandleTap = () => {
    const current = y.get();
    let idx = 0;
    let bestDist = Infinity;
    SNAPS.forEach((s, i) => {
      const d = Math.abs(s * containerH - current);
      if (d < bestDist) {
        bestDist = d;
        idx = i;
      }
    });
    // Cycle toward expanded; wrap to collapsed after fully open.
    const nextIdx = (idx + SNAPS.length - 1) % SNAPS.length;
    snapTo(SNAPS[nextIdx] * containerH);
  };

  return (
    <motion.section
      drag="y"
      dragListener={false}
      dragControls={dragControls}
      dragConstraints={{ top: minY, bottom: maxY }}
      dragElastic={0.05}
      dragMomentum={false}
      onDragEnd={onDragEnd}
      style={{
        y,
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
      className="absolute left-0 right-0 top-0 bottom-0 flex flex-col bg-[var(--bg)] border-t border-[var(--border)] rounded-t-2xl shadow-[0_-8px_24px_rgba(0,0,0,0.08)] z-10"
    >
      <div
        onPointerDown={(e) => dragControls.start(e)}
        onClick={onHandleTap}
        role="button"
        tabIndex={0}
        aria-label="Resize chat panel"
        className="w-full pt-2 pb-1 flex items-center justify-center shrink-0 cursor-grab active:cursor-grabbing select-none"
        style={{ touchAction: "none" }}
      >
        <span className="block h-1 w-10 rounded-full bg-[var(--text-secondary)] opacity-50" />
      </div>
      <div className="flex-1 min-h-0 flex flex-col">{children}</div>
    </motion.section>
  );
}
