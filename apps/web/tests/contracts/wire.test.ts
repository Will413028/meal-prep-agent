import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { createApiClient } from "../../src/shared/api/client";
import { validateGoalResponse } from "../../src/shared/api/validate";

const responses: unknown[] = JSON.parse(readFileSync(new URL("../../../../.artifacts/wire-goals.json", import.meta.url), "utf8"));

test("FastAPI HTTP responses survive the generated client's wire boundary", async () => {
  expect(responses).toHaveLength(2);
  for (const body of responses) {
    const fetcher: typeof fetch = async () => new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } });
    const api = createApiClient("http://example.test", fetcher);
    const result = await api.POST("/api/v1/goals/validate", { body: { schemaVersion: 1, kcal: 2000, protein: 100 } });
    expect(result.error).toBeUndefined();
    expect(validateGoalResponse(result.data)).toEqual(body);
  }
});
