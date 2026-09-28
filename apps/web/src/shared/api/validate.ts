import goalResponse from "./goal-validator.js";
import type { components } from "./schema";

export function validateGoalResponse(value: unknown): components["schemas"]["GoalResult"] {
  if (!goalResponse(value)) {
    throw new Error("API response does not match the goal contract");
  }
  return value as components["schemas"]["GoalResult"];
}
