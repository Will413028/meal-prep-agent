import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import synthetic from "../../../tests/fixtures/synthetic-evaluation.json";
import { validateEvaluation } from "../../shared/api/validate";
import { PlanView } from "./PlanView";

test("meal cards show server-calculated portion nutrition and explicit unknowns", () => {
  const meal = synthetic.candidate.meals[0];
  const evaluation = validateEvaluation({...synthetic,mealNutrition:[{day:meal.day,slot:meal.slot,nutrients:{
    kcal:{amount:562.5,source:"synthetic",version:"recipes-v1"},
    protein:{amount:27.5,source:"synthetic",version:"recipes-v1"},
    carbs:{amount:null,source:"synthetic",version:"recipes-v1"},
    fat:{amount:18.75,source:"synthetic",version:"recipes-v1"},
  }}]});
  const html = renderToStaticMarkup(<PlanView evaluation={evaluation} recipes={[]} />);
  expect(html).toContain("本餐熱量：562.5 kcal");
  expect(html).toContain("本餐碳水：未知");
});

test("old snapshots missing the new nutrition contract are rejected", () => {
  const {mealNutrition: _removed,...old} = {...synthetic,mealNutrition:[]};
  expect(() => validateEvaluation(old)).toThrow();
});
