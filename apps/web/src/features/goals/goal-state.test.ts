import { expect, test } from "vitest";
import { confirmGoal, type GoalDraft } from "./goal-state";

const draft: GoalDraft = {
  intent: "maintain",
  validated: { schemaVersion: 1, policyVersion: "nutrition-v1", requested: { kcal: 2520, protein: 56, carbs: null, fat: null }, ranges: { kcal: { min: 2394, max: 2646 }, protein: { min: 56, max: 61.6 }, carbs: null, fat: null } },
  estimate: { input: { age: 30, heightCm: 170, weightKg: 70, classification: "male", activity: "inactive", training: false, pregnantOrLactating: false, needsProfessional: false, intent: "maintain" }, result: { status: "ready", eer: 2520.17, adjustedKcal: 2520.17, kcal: 2520, protein: 56, policyVersion: "nutrition-v1" } },
};
const now = new Date("2026-09-28T08:00:00.000Z");

test("confirmation keeps provenance and UTC time but excludes questionnaire and estimate inputs", () => {
  const confirmed = confirmGoal(draft, now);
  expect(confirmed.source).toBe("estimated");
  expect(confirmed.confirmedAt).toBe("2026-09-28T08:00:00.000Z");
  expect(confirmed.references).toHaveLength(2);
  expect(Object.keys(confirmed).sort()).toEqual(["schemaVersion", "policyVersion", "requested", "ranges", "intent", "source", "references", "confirmedAt"].sort());
  for (const key of ["age", "heightCm", "weightKg", "classification", "training", "eer", "adjustedKcal"]) expect(JSON.stringify(confirmed)).not.toContain(`"${key}"`);
});

test("editing estimate records user adjustment without mutating original estimate", () => {
  const edited = structuredClone(draft);
  edited.validated.requested.kcal = 2500;
  expect(confirmGoal(edited, now).source).toBe("user_adjusted");
  expect(edited.estimate?.result.kcal).toBe(2520);
  expect(confirmGoal({ ...draft, estimate: null }, now).source).toBe("manual");
  expect(confirmGoal({ ...draft, intent: "lose" }, now).source).toBe("user_adjusted");
});

test("confirmed snapshot is detached from future draft edits", () => {
  const editable = structuredClone(draft);
  const confirmed = confirmGoal(editable, now);
  editable.validated.requested.kcal = 3000;
  editable.validated.ranges.kcal.max = 3150;
  expect(confirmed.requested.kcal).toBe(2520);
  expect(confirmed.ranges.kcal.max).toBe(2646);
});
