import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import synthetic from "../../../tests/fixtures/synthetic-evaluation.json";
import { validateEvaluation, validateProposal } from "../../shared/api/validate";
import { ProposalComparison } from "./ProposalComparison";

test("comparison shows before and after nutrition shopping and prep timing", () => {
  const base = validateEvaluation(synthetic);
  const next = structuredClone(base);
  next.days[0].nutrients.kcal.known = 1900;
  next.shopping.items[0].toBuy = 1000;
  next.prep.steps[0].startMinute = 5; next.prep.steps[0].endMinute = 10;
  const proposal = validateProposal({planId:crypto.randomUUID(),sessionGeneration:crypto.randomUUID(),baseRevision:1,runId:crypto.randomUUID(),scope:[{day:"2026-10-01",slot:"breakfast"}],evaluation:next,diff:[],
    shoppingDiff:[{id:base.shopping.items[0].id,before:base.shopping.items[0],after:next.shopping.items[0]}],
    prepDiff:[{id:base.prep.steps[0].id,before:base.prep.steps[0],after:next.prep.steps[0]}],violations:[]});
  const html = renderToStaticMarkup(<ProposalComparison proposal={proposal} base={base} />);
  expect(html).toContain("2012.5 → 1900 kcal");
  expect(html).toContain("需買 750 → 1000 g");
  expect(html).toContain("0–5 → 5–10 分鐘");
});
