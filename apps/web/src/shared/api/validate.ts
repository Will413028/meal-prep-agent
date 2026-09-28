import goalResponse from "./goal-validator.js";
import evaluationResponse from "./Evaluation-validator.js";
import proposalResponse from "./CanonicalProposal-validator.js";
import buildResponse from "./BuildProposalResult-validator.js";
import type { components } from "./schema";

export function validateGoalResponse(value: unknown): components["schemas"]["GoalResult"] {
  if (!goalResponse(value)) {
    throw new Error("API response does not match the goal contract");
  }
  return value as components["schemas"]["GoalResult"];
}

export function validateEvaluation(value: unknown): components["schemas"]["Evaluation"] {
  if (!evaluationResponse(value)) throw new Error("Invalid evaluation contract");
  return value as components["schemas"]["Evaluation"];
}

export function validateProposal(value: unknown): components["schemas"]["CanonicalProposal"] {
  if (!proposalResponse(value)) throw new Error("Invalid proposal contract");
  return value as components["schemas"]["CanonicalProposal"];
}

export function validateBuildResult(value: unknown): components["schemas"]["BuildProposalResult"] {
  if (!buildResponse(value)) throw new Error("Invalid build contract");
  return value as components["schemas"]["BuildProposalResult"];
}
