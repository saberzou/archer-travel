import { createMCPClient } from "@ai-sdk/mcp";

export async function getTravelKitMcp() {
  return createMCPClient({
    transport: {
      type: "http",
      url: "https://mcp.travelkit.ai/mcp",
      headers: {
        Authorization: `Bearer ${process.env.TRAVELKIT_API_KEY}`,
      },
    },
  });
}
