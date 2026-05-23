"use client";

import { useEffect, useRef, useState } from "react";
import { Brain, Trash2, X } from "lucide-react";
import {
  clearProfile,
  getProfile,
  isProfileEmpty,
  type Profile,
} from "@/lib/profile";

export default function MemoryButton() {
  const [open, setOpen] = useState(false);
  const [profile, setProfile] = useState<Profile>({});
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const sync = () => setProfile(getProfile());
    sync();
    window.addEventListener("archer:profile-changed", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("archer:profile-changed", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!panelRef.current) return;
      if (!panelRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const empty = isProfileEmpty(profile);
  const onForget = () => {
    if (
      window.confirm(
        "Forget everything Archer knows about you? This wipes the profile from this device."
      )
    ) {
      clearProfile();
    }
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Memory"
        aria-expanded={open}
        className="h-9 w-9 grid place-items-center rounded-full border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface)] transition"
      >
        <Brain className="h-4 w-4" />
      </button>

      {open && (
        <div
          ref={panelRef}
          role="dialog"
          aria-label="What Archer remembers"
          className="absolute right-0 mt-2 w-[min(360px,calc(100vw-2rem))] rounded-2xl border border-[var(--border)] bg-[var(--bg)] shadow-xl z-50"
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
            <div
              className="font-semibold tracking-tight text-[var(--text-primary)]"
              style={{ fontSize: 14 }}
            >
              What Archer remembers
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="h-7 w-7 grid place-items-center rounded-full text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface)]"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="px-4 py-3 max-h-[50vh] overflow-y-auto">
            {empty ? (
              <p className="text-[13px] leading-relaxed text-[var(--text-secondary)]">
                Nothing yet. As you chat, Archer will quietly note things
                like your home airport, passport, and seat preference so
                you don&apos;t have to repeat yourself.
              </p>
            ) : (
              <pre
                className="text-[12px] leading-[18px] text-[var(--text-primary)] whitespace-pre-wrap break-words"
                style={{
                  fontFamily:
                    "var(--font-plex-mono), ui-monospace, monospace",
                }}
              >
                {JSON.stringify(profile, null, 2)}
              </pre>
            )}
          </div>

          <div className="px-4 py-3 border-t border-[var(--border)] flex items-center justify-between gap-3">
            <p className="text-[11px] leading-tight text-[var(--text-secondary)]">
              Stored on this device only.
            </p>
            <button
              type="button"
              onClick={onForget}
              disabled={empty}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-[12px] font-medium border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--error)] hover:border-[var(--error)] transition disabled:opacity-40 disabled:hover:text-[var(--text-secondary)] disabled:hover:border-[var(--border)]"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Forget everything
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
