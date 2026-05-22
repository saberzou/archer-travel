import assert from "node:assert/strict";
import { wrapTools } from "./tool-compaction";

const rawFlightSearch = {
  content: [
    {
      type: "text",
      text: JSON.stringify({
        data: {
          displayOptions: Array.from({ length: 12 }, (_, i) => ({
            solutionId: `solution-${i}`,
            solutionToken: `token-${i}`,
            mainAirline: { name: "Japan Airlines", code: "JL" },
            segments: [
              {
                depAirport: { code: "PVG", city: "Shanghai" },
                arrAirport: { code: "HND", city: "Tokyo" },
                depTime: "2026-06-01T09:00:00+08:00",
                arrTime: "2026-06-01T13:00:00+09:00",
                flightNo: `JL${20 + i}`,
                marketingCopy: "drop me",
                deepMetadata: { nested: Array(50).fill("drop me") },
              },
            ],
            totalDurationMinutes: 180,
            price: { amount: 250000, currency: "CNY" },
            baggage: { summary: "1 checked bag" },
            fareRules: Array(50).fill("drop me"),
            alternateFareClasses: Array(50).fill("drop me"),
            mileage: { earn: 1234 },
          })),
        },
      }),
    },
  ],
};

async function run() {
  const wrapped = wrapTools({
    flight_search: {
      execute: async (..._args: unknown[]) => rawFlightSearch,
    },
    flight_verify_solution: {
      execute: async (..._args: unknown[]) => {
        throw new Error("input token count exceeds 1048576: verbose internals");
      },
    },
  });

  const searchResult = (await wrapped.flight_search.execute({})) as unknown as {
    data: { displayOptions: Array<{ id: string; solutionToken?: string }> };
  };
  const encoded = JSON.stringify(searchResult);

  assert.equal(searchResult.data.displayOptions.length, 8);
  assert.equal(searchResult.data.displayOptions[0].id, "solution-0");
  assert.equal(searchResult.data.displayOptions[0].solutionToken, "token-0");
  assert.ok(encoded.length < 20_000);
  assert.equal(encoded.includes("fareRules"), false);
  assert.equal(encoded.includes("alternateFareClasses"), false);
  assert.equal(encoded.includes("marketingCopy"), false);

  const verifyResult = await wrapped.flight_verify_solution.execute({}) as unknown;
  assert.deepEqual(verifyResult, {
    error: "input token count exceeds 1048576",
  });
}

void run();
