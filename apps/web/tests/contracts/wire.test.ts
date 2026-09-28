import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { createApiClient } from "../../src/shared/api/client";
import { validateGoalResponse } from "../../src/shared/api/validate";
import { validateBuildResult, validateEvaluation, validateProposal } from "../../src/shared/api/validate";

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

test("canonical planning HTTP response preserves numbers, null, UTC timestamps and source versions", async () => {
  const wire = JSON.parse(readFileSync(new URL("../../../../.artifacts/wire-planning.json", import.meta.url), "utf8"));
  const api = createApiClient("http://example.test", async () => Response.json(wire.response));
  const result = await api.POST("/api/v1/proposals/build", { body: wire.request });
  const build = validateBuildResult(result.data);
  expect(build.status).toBe("ready");
  const proposal = validateProposal(build.proposal);
  const evaluation = validateEvaluation(proposal.evaluation);
  expect(evaluation.candidate.goal.confirmedAt).toBe("2026-10-01T00:00:00Z");
  expect(evaluation.days[0].day).toBe("2026-10-01");
  expect(typeof evaluation.days[0].nutrients.kcal.known).toBe("number");
  expect(evaluation.candidate.meals[0].recipeSnapshot?.storage).toBeNull();
  expect(evaluation.shopping.items.length).toBeGreaterThan(0);
  expect(typeof evaluation.shopping.items[0].toBuy).toBe("number");
  expect(evaluation.prep.destinations).toHaveLength(9);
  expect(evaluation.prep.destinations[0].storage).toBeNull();
  expect(proposal.shoppingDiff.length).toBeGreaterThan(0);
  expect(proposal.prepDiff.length).toBeGreaterThan(0);
  for (const mutate of [
    (value: typeof evaluation) => { delete value.days[0].nutrients.kcal; },
    (value: typeof evaluation) => { delete (value.candidate as Partial<typeof value.candidate>).schemaVersion; },
    (value: typeof evaluation) => { value.candidate.schemaVersion = 2 as 1; },
    (value: typeof evaluation) => { value.candidate.goal.confirmedAt = "not-a-date"; },
    (value: typeof evaluation) => { value.days[0].day = "2026-02-30"; },
    (value: typeof evaluation) => { value.days[0].nutrients.kcal.known = "2000" as unknown as number; },
    (value: typeof evaluation) => { delete (value as Partial<typeof value>).shopping; },
    (value: typeof evaluation) => { delete (value.prep as Partial<typeof value.prep>).sourceLabel; },
    (value: typeof evaluation) => { value.prep.destinations[0].day = "2026-02-30"; },
  ]) {
    const corrupted = structuredClone(evaluation);
    mutate(corrupted);
    expect(() => validateEvaluation(corrupted)).toThrow();
  }
});
