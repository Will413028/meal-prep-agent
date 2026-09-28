import Decimal from "decimal.js";
import policy from "../../../../../data/nutrition-v1.json";

const D = Decimal.clone({ precision: 32, rounding: Decimal.ROUND_HALF_UP });

export type EstimateInput = {
  age: number; heightCm: number; weightKg: number;
  classification: "male" | "female";
  activity: "inactive" | "low_active" | "active" | "very_active";
  intent: "maintain" | "lose" | "gain";
  training: boolean; pregnantOrLactating: boolean; needsProfessional: boolean;
};
export type EstimateResult = { status: "ready"; eer: number; kcal: number; protein: number; policyVersion: "nutrition-v1" } | { status: "needs_input" | "unsupported"; reason: string };
export function estimateGoal(partial: Partial<EstimateInput>): EstimateResult {
  const required: (keyof EstimateInput)[] = ["age", "heightCm", "weightKg", "classification", "activity", "intent", "training", "pregnantOrLactating", "needsProfessional"];
  if (required.some((key) => partial[key] === undefined || partial[key] === null)) {
    return { status: "needs_input", reason: "請補齊必要欄位，不會猜測未提供的資料。" };
  }
  const input = partial as EstimateInput;
  const validNumber = (value: number, minimum: number, maximum: number, decimalPlaces: number) =>
    typeof value === "number" && Number.isFinite(value) && value >= minimum && value <= maximum && new D(value).decimalPlaces() <= decimalPlaces;
  if (!validNumber(input.age, 19, 100, 0) || !validNumber(input.heightCm, 120, 220, 1) || !validNumber(input.weightKg, 35, 200, 1) ||
      !["male", "female"].includes(input.classification) || !["inactive", "low_active", "active", "very_active"].includes(input.activity) ||
      !["maintain", "lose", "gain"].includes(input.intent) ||
      [input.training, input.pregnantOrLactating, input.needsProfessional].some((value) => typeof value !== "boolean")) {
    return { status: "unsupported", reason: "輸入不在本版支援範圍，請檢查欄位或使用已有目標。" };
  }
  if (input.pregnantOrLactating || input.needsProfessional ||
      (input.intent === "lose" && new D(input.weightKg).div(new D(input.heightCm).div(100).pow(2)).lt("18.5"))) {
    return { status: "unsupported", reason: "此情況不提供自動估算，請使用專業人員已提供的目標。" };
  }
  const [c, a, h, w] = policy.coefficients[input.classification][input.activity];
  const eer = new D(c).plus(new D(a).times(input.age)).plus(new D(h).times(input.heightCm)).plus(new D(w).times(input.weightKg));
  const kcal = eer.times(policy.intentFactors[input.intent]).div(10).toDecimalPlaces(0).times(10);
  const protein = new D(input.weightKg).times(input.training ? policy.proteinFactors.training : policy.proteinFactors.general).ceil();
  if (kcal.lt(1200) || kcal.gt(5000) || protein.lt(30) || protein.gt(250)) {
    return { status: "unsupported", reason: "估算目標超出本版支援範圍，不會自動調整到上下限。" };
  }
  return { status: "ready", eer: eer.toNumber(), kcal: kcal.toNumber(), protein: protein.toNumber(), policyVersion: "nutrition-v1" };
}
