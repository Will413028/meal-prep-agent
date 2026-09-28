import { expect, test } from "vitest";
import { validateGoalResponse } from "./validate";

const valid = {
  schemaVersion: 1, policyVersion: "nutrition-v1",
  requested: { kcal: 2000, protein: 100, carbs: null, fat: null },
  ranges: { kcal: { min: 1900, max: 2100 }, protein: { min: 100, max: 110 }, carbs: null, fat: null },
};

test("API numeric ranges and nulls survive validation", () => {
  expect(validateGoalResponse(valid)).toEqual(valid);
});

test.each([
  { ...valid, schemaVersion: 2 },
  { ...valid, ranges: { ...valid.ranges, kcal: { min: "1900", max: 2100 } } },
  { ...valid, ranges: { protein: valid.ranges.protein, carbs: null, fat: null } },
])("rejects incompatible API response %#", (value) => {
  expect(() => validateGoalResponse(value)).toThrow();
});

test.each(["schemaVersion", "policyVersion"] as const)("rejects a missing %s", (key) => {
  const value: Record<string, unknown> = { ...valid };
  delete value[key];
  expect(() => validateGoalResponse(value)).toThrow();
});
