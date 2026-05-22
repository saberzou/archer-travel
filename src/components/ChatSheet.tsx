"use client";

import { motion, useMotionValue, animate } from "framer-motion";
import { useEffect, useState, type ReactNode, type PointerEvent as ReactPointerEvent } from "react";

/**
 * Chat container — desktop static column / mobile draggable bottom sheet.
 *
 * Mobile implementation: the sheet is anchored to `bottom: 0` and its HEIGHT
 * changes as you drag the handle. That way the input field (at the bottom of
 * the chat) is always pinned to the viewport bottom; only the top edge moves.
 *
 * Snap points are fractions of the body area (viewport minus header):
 *   0.9  = expanded (chat covers ~90%)
 *   0.55 = default (matches prior 55% sheet)
 *   0.3  = collapsed (small sliver)
 */
const SNAPS = [0.9, 0.55, 0.3]; // heights as fraction of body
const DEFAULT_INDEX = 1;

export default function ChatSheet({ children }: { children: ReactNode }) {
  const [isMobile, setIsMobile] = useState<boolean | null>(null);
  const [containerH, setContainerH] = useState(0);
  const sheetH = useMotionValue(0);

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
    sheetH.set(SNAPS[DEFAULT_INDEX] * containerH);
  }, [isMobile, containerH, sheetH]);

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
    // SSR / pre-hydration fallback — fixed default height, no drag.
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
  const minH = SNAPS[SNAPS.length - 1] * containerH;
  const maxH = SNAPS[0] * containerH;
  const clamp = (n: number) => Math.max(minH, Math.min(maxH, n));

  const snapTo = (px: number) =>
    animate(sheetH, px, { type: "spring", stiffness: 380, damping: 38, mass: 0.8 });

  // Manual pointer-based drag on the handle — dragging UP increases height.
  let startY = 0;
  let startH = 0;
  let lastY = 0;
  let lastT = 0;
  let velocity = 0;

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    startY = e.clientY;
    startH = sheetH.get();
    lastY = e.clientY;
    lastT = performance.now();
    velocity = 0;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!(e.target as HTMLElement).hasPointerCapture(e.pointerId)) return;
    const dy = e.clientY - startY;
    sheetH.set(clamp(startH - dy));
    const now = performance.now();
    const dt = now - lastT;
    if (dt > 0) velocity = (e.clientY - lastY) / dt; // px/ms, positive = downward
    lastY = e.clientY;
    lastT = now;
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const el = e.target as HTMLElement;
    if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);

    const dragged = Math.abs(e.clientY - startY) > 5;
    if (!dragged) {
      // Treat as tap — cycle toward expanded.
      const current = sheetH.get();
      let idx = 0;
      let bestDist = Infinity;
      SNAPS.forEach((s, i) => {
        const d = Math.abs(s * containerH - current);
        if (d < bestDist) {
          bestDist = d;
          idx = i;
        }
      });
      // SNAPS[0] is largest; cycle 1->0->2->1 (default -> expanded -> collapsed -> default)
      const nextIdx = idx === 0 ? SNAPS.length - 1 : idx - 1;
      snapTo(SNAPS[nextIdx] * containerH);
      return;
    }

    // Snap to nearest, velocity-biased. Velocity > 0 = pulling down = shrinking,
    // so subtract velocity contribution from height.
    const projected = sheetH.get() - velocity * 150;
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

  return (
    <motion.section
      style={{
        height: sheetH,
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
      className="absolute left-0 right-0 bottom-0 flex flex-col bg-[var(--bg)] border-t border-[var(--border)] rounded-t-2xl shadow-[0_-8px_24px_rgba(0,0,0,0.08)] z-10"
    >
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
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
