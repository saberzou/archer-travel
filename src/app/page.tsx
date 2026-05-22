import Globe from "@/components/Globe";
import Chat from "@/components/Chat";
import ThemeToggle from "@/components/ThemeToggle";
import Archer from "@/components/Archer";
import DotField from "@/components/DotField";

export default function Page() {
  return (
    <main
      className="overflow-hidden flex flex-col bg-[var(--bg)] text-[var(--text-primary)]"
      style={{ height: "100dvh" }}
    >
      {/* Top bar — pads safe area on iOS so the status bar doesn't overlap */}
      <header
        className="h-14 px-4 md:px-6 flex items-center justify-between border-b border-[var(--border)] shrink-0"
        style={{ paddingTop: "env(safe-area-inset-top)", height: "calc(3.5rem + env(safe-area-inset-top))" }}
      >
        <div className="flex items-center gap-3">
          <Archer size={32} state="neutral" />
          <div
            className="font-semibold tracking-tight"
            style={{ fontSize: 16, letterSpacing: "-0.01em" }}
          >
            Archer
          </div>
          <span
            className="hidden sm:inline text-[var(--text-secondary)]"
            style={{
              fontFamily: "var(--font-plex-mono), monospace",
              fontSize: 12,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
            }}
          >
            travel that flies
          </span>
        </div>
        <ThemeToggle />
      </header>

      {/* Body:
          desktop = 68/32 side-by-side
          mobile  = globe fills the area, chat floats as a bottom sheet
                    over the lower half of the globe */}
      <div className="flex-1 min-h-0 relative md:flex md:flex-row">
        {/* Globe layer — full bleed on mobile, left column on desktop */}
        <section className="absolute inset-0 md:static md:basis-[68%] md:flex-[0_0_68%] overflow-hidden md:border-r border-[var(--border)]">
          <DotField dotRadius={2.5} dotColor="rgba(255, 106, 0, 0.35)" />
          <Globe />
        </section>
        {/* Chat layer — overlay sheet on mobile (covers bottom ~55%),
            normal column on desktop */}
        <section
          className="absolute left-0 right-0 bottom-0 h-[55%] md:static md:h-auto md:basis-[32%] md:flex-[0_0_32%] flex flex-col bg-[var(--bg)] border-t md:border-t-0 border-[var(--border)] rounded-t-2xl md:rounded-none shadow-[0_-8px_24px_rgba(0,0,0,0.08)] md:shadow-none"
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        >
          <Chat />
        </section>
      </div>
    </main>
  );
}
