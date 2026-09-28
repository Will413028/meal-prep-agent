import { expect, test } from "vitest";
import { estimateGoal, type EstimateInput } from "./estimate";

const base: EstimateInput = { age: 30, heightCm: 170, weightKg: 70, classification: "male", activity: "inactive", intent: "maintain", training: false, pregnantOrLactating: false, needsProfessional: false };
const golden = [
  ["male", "inactive", 2520.17, 2520, 2270, 2650],
  ["male", "low_active", 2713.37, 2710, 2440, 2850],
  ["male", "active", 2902.02, 2900, 2610, 3050],
  ["male", "very_active", 3148.62, 3150, 2830, 3310],
  ["female", "inactive", 2166.70, 2170, 1950, 2280],
  ["female", "low_active", 2337.27, 2340, 2100, 2450],
  ["female", "active", 2475.55, 2480, 2230, 2600],
  ["female", "very_active", 2722.63, 2720, 2450, 2860],
] as const;

for (const [classification, activity, eer, maintain, lose, gain] of golden) {
  test(`${classification}/${activity}: independent nutrition-policy golden`, () => {
    for (const [intent, kcal] of [["maintain", maintain], ["lose", lose], ["gain", gain]] as const) {
      expect(estimateGoal({ ...base, classification, activity, intent })).toEqual({ status: "ready", eer, kcal, protein: 56, policyVersion: "nutrition-v1" });
    }
  });
}

test("training is explicit rather than inferred from gain intent", () => {
  expect(estimateGoal({ ...base, training: true })).toMatchObject({ status: "ready", protein: 112 });
  expect(estimateGoal({ ...base, intent: "gain" })).toMatchObject({ status: "ready", protein: 56 });
});

test.each([
  { age: 18 }, { age: 101 }, { age: 30.5 }, { age: NaN },
  { heightCm: 119.9 }, { heightCm: 220.1 }, { heightCm: 170.01 },
  { weightKg: 34.9 }, { weightKg: 200.1 }, { weightKg: Infinity },
  { pregnantOrLactating: true }, { needsProfessional: true },
  { classification: "unknown" }, { activity: "unknown" }, { intent: "unknown" },
  { heightCm: 200, weightKg: 60, intent: "lose" },
  { age: 100, heightCm: 120, weightKg: 35, classification: "female", intent: "lose" },
  { training: true, weightKg: 200 },
])("unsupported input never produces a numerical target %#", (patch) => {
  const result = estimateGoal({ ...base, ...patch } as EstimateInput);
  expect(result.status).toBe("unsupported");
  expect(result).not.toHaveProperty("kcal");
});

test.each(["age", "activity", "training", "pregnantOrLactating", "needsProfessional"] as const)("missing %s is requested rather than guessed", (field) => {
  const input: Partial<EstimateInput> = { ...base };
  delete input[field];
  expect(estimateGoal(input).status).toBe("needs_input");
});

test.each([
  { age: 19 }, { age: 100 }, { heightCm: 120 }, { heightCm: 220 },
  { weightKg: 35, training: true }, { weightKg: 200 },
])("supported boundary input is accepted %#", (patch) => {
  expect(estimateGoal({ ...base, ...patch }).status).toBe("ready");
});
