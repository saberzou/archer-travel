import { createMCPClient } from "@ai-sdk/mcp";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

export async function getTravelKitMcp() {
  const url = new URL("https://mcp.travelkit.ai/mcp");
  const transport = new StreamableHTTPClientTransport(url, {
    requestInit: {
      headers: { Authorization: `Bearer ${process.env.TRAVELKIT_API_KEY}` },
    },
  });
  return createMCPClient({ transport });
}
