import Globe from "@/components/Globe";
import Chat from "@/components/Chat";

export default function Page() {
  return (
    <main className="min-h-screen relative">
      <Globe />
      <div className="hidden md:block fixed top-6 left-6 z-10 select-none">
        <div className="text-[10px] uppercase tracking-[0.25em] text-white/40">
          Archer
        </div>
        <div className="text-2xl font-medium tracking-tight">Travel</div>
        <div className="mt-1 text-xs text-white/40 max-w-[18rem]">
          A conversational booking surface for the well-traveled. Powered by
          TravelKit MCP + Gemini.
        </div>
      </div>
      <Chat />
    </main>
  );
}
