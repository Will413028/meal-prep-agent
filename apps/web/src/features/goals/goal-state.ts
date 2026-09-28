import type { components } from "../../shared/api/schema";
import type { EstimateInput, EstimateResult } from "./estimate";

export type GoalResult = components["schemas"]["GoalResult"];
export type EstimateDraft = { input: EstimateInput; result: Extract<EstimateResult, { status: "ready" }> };
export type GoalDraft = { validated: GoalResult; intent: EstimateInput["intent"]; estimate: EstimateDraft | null };
export type ConfirmedGoal = components["schemas"]["ConfirmedGoal-Output"];

export const energyReference = "https://www.canada.ca/en/health-canada/services/food-nutrition/healthy-eating/dietary-reference-intakes/tables/equations-estimate-energy-requirement.html";
export const proteinReferences = {
  general: "https://www.canada.ca/en/health-canada/services/food-nutrition/healthy-eating/dietary-reference-intakes/tables/reference-values-macronutrients.html",
  training: "https://ods.od.nih.gov/factsheets/ExerciseAndAthleticPerformance-HealthProfessional/",
};

export function confirmGoal(draft: GoalDraft, now: Date): ConfirmedGoal {
  const { estimate, validated } = draft;
  const unchanged = estimate && validated.requested.kcal === estimate.result.kcal &&
    validated.requested.protein === estimate.result.protein && validated.requested.carbs == null &&
    validated.requested.fat == null && draft.intent === estimate.input.intent;
  return {
    schemaVersion: validated.schemaVersion, policyVersion: validated.policyVersion,
    requested: structuredClone(validated.requested), ranges: structuredClone(validated.ranges),
    intent: draft.intent, source: estimate ? (unchanged ? "estimated" : "user_adjusted") : "manual",
    references: estimate ? [energyReference, proteinReferences[estimate.input.training ? "training" : "general"]] : [],
    confirmedAt: now.toISOString(),
  };
}
