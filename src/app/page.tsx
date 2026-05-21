import Globe from "@/components/Globe";
import Chat from "@/components/Chat";
import ThemeToggle from "@/components/ThemeToggle";
import Archer from "@/components/Archer";

export default function Page() {
  return (
    <main className="h-screen overflow-hidden flex flex-col bg-[var(--bg)] text-[var(--text-primary)]">
      {/* Top bar */}
      <header className="h-14 px-4 md:px-6 flex items-center justify-between border-b border-[var(--border)] shrink-0">
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

      {/* Body: desktop = 60/40 split, mobile = stacked */}
      <div className="flex-1 min-h-0 flex flex-col md:flex-row">
        <section className="relative md:basis-[60%] md:flex-[0_0_60%] h-[55vh] md:h-auto border-b md:border-b-0 md:border-r border-[var(--border)]">
          <Globe />
        </section>
        <section className="md:basis-[40%] md:flex-[0_0_40%] flex-1 min-h-0 flex flex-col">
          <Chat />
        </section>
      </div>
    </main>
  );
}
