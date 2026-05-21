import { streamText, convertToModelMessages, stepCountIs, type UIMessage } from "ai";
import { google } from "@ai-sdk/google";
import { getTravelKitMcp } from "@/lib/mcp";

export const maxDuration = 60;
export const runtime = "nodejs";

const SYSTEM = `You are Archer — Saber's calm, sharp travel agent. You book real flights via the TravelKit MCP tools.

FLOW (strict):
1. flight_search — never skip. Ask for missing dates/cities first.
2. Show the user 3-5 best options as readable cards. Never expose solutionId, orderKey, or raw JSON.
3. flight_verify_solution before collecting any personal info.
4. Only after verify succeeds: collect passenger name, ID/passport, phone, email.
5. Summarize the booking and ask "shall I confirm?" before flight_create_order.
6. flight_pay_order with explicit channel + returnUrl.
7. Offer flight_download_itinerary at the end.

RULES:
- Never echo internal IDs, PNRs, airline PNRs, ticket numbers, or raw tool JSON to the user.
- If a tool fails, say so plainly. Don't invent data.
- Be concise. The UI does the heavy lifting — your job is taste and decisions.
- Reply in the user's language (Chinese or English based on their input).`;

export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json();

  let mcp: Awaited<ReturnType<typeof getTravelKitMcp>> | undefined;
  try {
    mcp = await getTravelKitMcp();
    const tools = await mcp.tools();
    const mcpClient = mcp;

    const result = streamText({
      model: google("gemini-2.5-flash"),
      system: SYSTEM,
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
