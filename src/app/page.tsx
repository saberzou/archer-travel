import Globe from "@/components/Globe";
import Chat from "@/components/Chat";
import ChatSheet from "@/components/ChatSheet";
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
        <section className="absolute inset-0 md:static md:basis-[68%] md:flex-[0_0_68%] overflow-hidden md:border-r border-[var(--border)] md:flex md:items-center md:justify-center">
          <DotField dotRadius={2.5} dotColor="rgba(255, 106, 0, 0.35)" />
          <div className="globe-bounds">
            <Globe />
          </div>
          <style>{`
            .globe-bounds { position: absolute; inset: 0; }
            @media (min-width: 768px) {
              .globe-bounds {
                position: relative;
                inset: auto;
                width: 100%;
                height: 100%;
                max-width: 720px;
                max-height: 720px;
                min-width: 360px;
                min-height: 360px;
              }
            }
          `}</style>
        </section>
        {/* Chat layer — ChatSheet handles both layouts:
              - desktop (md+): static right column
              - mobile: draggable bottom sheet with snap points
            Single mount so useChat state stays unified. */}
        <ChatSheet>
          <Chat />
        </ChatSheet>
      </div>
    </main>
  );
}
