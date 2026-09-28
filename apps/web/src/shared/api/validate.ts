import goalResponse from "./goal-validator.js";
import evaluationResponse from "./Evaluation-validator.js";
import proposalResponse from "./CanonicalProposal-validator.js";
import buildResponse from "./BuildProposalResult-validator.js";
import type { components, paths } from "./schema";

export function validateGoalResponse(value: unknown): components["schemas"]["GoalResult"] {
  if (!goalResponse(value)) {
    throw new Error("API response does not match the goal contract");
  }
  return value as components["schemas"]["GoalResult"];
}

export function validateEvaluation(value: unknown): paths["/api/v1/plans/evaluate"]["post"]["responses"][200]["content"]["application/json"] {
  if (!evaluationResponse(value)) throw new Error("Invalid evaluation contract");
  return value as paths["/api/v1/plans/evaluate"]["post"]["responses"][200]["content"]["application/json"];
}

export function validateProposal(value: unknown): paths["/api/v1/proposals/validate"]["post"]["responses"][200]["content"]["application/json"] {
  if (!proposalResponse(value)) throw new Error("Invalid proposal contract");
  return value as paths["/api/v1/proposals/validate"]["post"]["responses"][200]["content"]["application/json"];
}

export function validateBuildResult(value: unknown): paths["/api/v1/proposals/build"]["post"]["responses"][200]["content"]["application/json"] {
  if (!buildResponse(value)) throw new Error("Invalid build contract");
  return value as paths["/api/v1/proposals/build"]["post"]["responses"][200]["content"]["application/json"];
}
