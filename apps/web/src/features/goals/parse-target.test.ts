import { expect, test } from "vitest";
import { parseTarget } from "./parse-target";

test("single values, explicit ranges and optional zero retain their meanings", () => {
  expect(parseTarget("2000")).toBe(2000);
  expect(parseTarget("1900..2100")).toEqual({ min: 1900, max: 2100 });
  expect(parseTarget("0")).toBe(0);
  expect(parseTarget("  ")).toBeNull();
});

test.each(["5000.00000000000001", "1e-999", "NaN", "Infinity", "2100..1900", "1..2..3", "abc"])("rejects %s before binary number conversion", (value) => {
  expect(() => parseTarget(value)).toThrow();
});
