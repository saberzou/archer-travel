"use client";

import { useMemo } from "react";

export type ArcherState =
  | "idle"
  | "neutral"
  | "happy"
  | "thinking"
  | "error"
  | "sleep";

export type ArcherSize = 32 | 48 | 96 | 192;

/**
 * Pixel-art mascot. Renders either the looping idle sprite-sheet
 * (8 frames, 200ms each) or a single expression frame from
 * archer-expressions(-large).png (5 frames, indexed 0..4).
 *
 * Always `image-rendering: pixelated`. Switches to `-large` variants
 * for sizes ≥ 96 to avoid scaling artifacts on hi-dpi.
 */
export default function Archer({
  size = 48,
  state = "neutral",
  float = false,
  className = "",
}: {
  size?: ArcherSize;
  state?: ArcherState;
  float?: boolean;
  className?: string;
}) {
  const large = size >= 96;

  const expressionIndex: number = useMemo(() => {
    switch (state) {
      case "neutral":
        return 0;
      case "happy":
        return 1;
      case "thinking":
        return 2;
      case "error":
        return 3;
      case "sleep":
        return 4;
      default:
        return 0;
    }
  }, [state]);

  // Idle: looping 8-frame strip.
  if (state === "idle") {
    const sheet = large
      ? "/archer/archer-idle-sprite-sheet-large.png"
      : "/archer/archer-idle-sprite-sheet.png";
    return (
      <div
        className={`pixelated archer-sprite-idle ${
          float ? "archer-float" : ""
        } ${className}`}
        role="img"
        aria-label="Archer"
        style={{
          width: size,
          height: size,
          backgroundImage: `url(${sheet})`,
          backgroundRepeat: "no-repeat",
          // Frames are laid out horizontally; total strip = 8× width.
          backgroundSize: `${size * 8}px ${size}px`,
        }}
      />
    );
  }

  // Expression sheet: 5 frames horizontal at 48×48 each (large variant = 192×192).
  const sheet = large
    ? "/archer/archer-expressions-large.png"
    : "/archer/archer-expressions.png";
  return (
    <div
      className={`pixelated ${float ? "archer-float" : ""} ${className}`}
      role="img"
      aria-label={`Archer (${state})`}
      style={{
        width: size,
        height: size,
        backgroundImage: `url(${sheet})`,
        backgroundRepeat: "no-repeat",
        backgroundSize: `${size * 5}px ${size}px`,
        backgroundPosition: `-${expressionIndex * size}px 0`,
      }}
    />
  );
}
