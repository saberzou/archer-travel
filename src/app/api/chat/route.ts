import { streamText, convertToModelMessages, stepCountIs, type UIMessage } from "ai";
import { google } from "@ai-sdk/google";
import { getTravelKitMcp } from "@/lib/mcp";
import { wrapTools } from "@/lib/tool-compaction";

export const maxDuration = 60;
export const runtime = "nodejs";

const SYSTEM_BASE = `You are Archer — Saber's calm, sharp travel agent. You book real flights via the TravelKit MCP tools.

CONTEXT:
- Today is {TODAY} ({DOW}). User timezone: Asia/Shanghai (UTC+8).
- When the user says "next Tuesday" / "this Friday" / "tomorrow", compute the exact date yourself — never ask them to restate.
- City → IATA: resolve common city names to airport codes silently (Shanghai → PVG, Beijing → PEK, Bangkok → BKK, Tokyo → HND, NYC → JFK, etc.). If a city has multiple airports and the user didn't specify, pick the primary international hub and mention it once ("I'll search PVG — let me know if you'd rather fly from SHA").

DEFAULTS (apply silently — do NOT ask):
- Passengers: 1 adult unless the user mentions others.
- Cabin: economy.
- Trip type: one-way unless the user mentions a return.

FLOW (strict):
1. flight_search — call it as soon as you have origin, destination, and date. Do NOT ask clarifying questions you can default or compute.
2. The UI renders flight_search results as boarding-pass cards automatically. DO NOT enumerate the flights in text — no numbered lists of airlines, times, prices. Instead, after the tool returns, send ONE short message (≤2 sentences): a quick read of the options ("Five options, JL nonstop in the morning is the sweet spot — Spring is cheapest but a long layover.") and a prompt to pick. Never echo flight numbers, prices, or schedules the user can already see on the cards.
3. flight_verify_solution before collecting any personal info.
4. Only after verify succeeds: collect passenger name, ID/passport, phone, email.
5. Summarize the booking and ask "shall I confirm?" before flight_create_order.
6. flight_pay_order with explicit channel + returnUrl.
7. Offer flight_download_itinerary at the end.

RULES:
- Never echo internal IDs, PNRs, airline PNRs, ticket numbers, or raw tool JSON.
- If a tool fails, say so plainly. Don't invent data.
- Be concise. Two sentences beats five. The UI does the heavy lifting.
- Reply in the user's language (Chinese or English based on their input).
- Never re-ask information the user already provided.`;

function buildSystem(): string {
  const now = new Date();
  const tz = "Asia/Shanghai";
  const iso = now.toLocaleDateString("en-CA", { timeZone: tz });
  const dow = now.toLocaleDateString("en-US", {
    timeZone: tz,
    weekday: "long",
  });
  return SYSTEM_BASE.replace("{TODAY}", iso).replace("{DOW}", dow);
}

export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json();

  let mcp: Awaited<ReturnType<typeof getTravelKitMcp>> | undefined;
  try {
    mcp = await getTravelKitMcp();
    const tools = wrapTools(await mcp.tools());
    const mcpClient = mcp;

    const result = streamText({
      model: google("gemini-2.5-flash"),
      system: buildSystem(),
      messages: await convertToModelMessages(messages),
      tools,
      stopWhen: stepCountIs(8),
      onFinish: async () => {
        try {
          await mcpClient.close();
        } catch {
          /* ignore */
        }
      },
    });

    return result.toUIMessageStreamResponse();
  } catch (err) {
    if (mcp) {
      try {
        await mcp.close();
      } catch {
        /* ignore */
      }
    }
    const msg = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
