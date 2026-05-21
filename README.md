# Archer · Travel

A conversational AI flight-booking web app. Talk to Archer (a snow leopard with taste); Archer talks to the TravelKit MCP server; you walk away with a real ticket and a boarding pass that looks good enough to frame.

## Stack

- **Next.js 15** (app router) + **React 19** + **TypeScript**
- **Tailwind v4** (CSS-first)
- **AI SDK v6** (`ai`, `@ai-sdk/google`, `@ai-sdk/react`, `@ai-sdk/mcp`) — **Gemini 2.5 Flash** as default model
- **TravelKit MCP** via `StreamableHTTPClientTransport` from `@modelcontextprotocol/sdk`
- **react-globe.gl** (Three.js) — full-bleed night-earth background, dynamic-imported (client only)
- **Framer Motion** — chat transitions
- **Vercel** — deploy target

## Env Vars

Copy `.env.example` to `.env.local` and fill in:

```
TRAVELKIT_API_KEY=...           # https://travelkit.ai dashboard
GOOGLE_GENERATIVE_AI_API_KEY=...# https://aistudio.google.com/apikey
```

The same vars must be set in **Vercel → Project Settings → Environment Variables** for production/preview/development.

## Develop

```bash
npm install
npm run dev
# → http://localhost:3000
```

## Build & deploy

```bash
npm run build
vercel --prod
```

## V1 Scope

- Conversational search → verify → collect passenger info → create order → pay → itinerary
- Chinese + English (model picks based on user input)
- Real money. Real PNRs. No mocks.
- Boarding-pass / itinerary visual (post-V1)

## MCP Tools

See `docs/mcp-tools.json` for the full schema of all 20 TravelKit tools exposed to the model.
