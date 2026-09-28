import type { components } from "../../shared/api/schema";
import { nutrientLabels, slotLabels, type Evaluation } from "./PlanView";

export function ProposalComparison({proposal,base}: {proposal: components["schemas"]["CanonicalProposal"]; base: Evaluation | null}) {
  return <section aria-label="變更比較"><h3>變更比較</h3>
    <p>本次範圍：{proposal.scope.map(key => `${key.day} ${slotLabels[key.slot]}`).join("、")}</p>
    <ul>{proposal.diff.map(diff => <li key={`${diff.key.day}:${diff.key.slot}`}>
      {diff.key.day} {slotLabels[diff.key.slot]}：
      {diff.before ? `${diff.before.recipeSnapshot?.name ?? diff.before.external?.name}（${diff.before.quantity}）` : "未安排"}
      {" → "}{diff.after ? `${diff.after.recipeSnapshot?.name ?? diff.after.external?.name}（${diff.after.quantity}）` : "移除"}
    </li>)}</ul>
    <details open><summary>每日營養比較</summary>
      {proposal.evaluation.days.map(day => {
        const previous = base?.days.find(item => item.day === day.day);
        return <section key={day.day}><h4>{day.day}</h4><ul>
          {Object.entries(day.nutrients).map(([key,value]) => {
            const before = previous?.nutrients[key];
            return <li key={key}>{`${nutrientLabels[key as keyof typeof nutrientLabels]}：${before ? before.known : "未安排"} → ${value.known} ${key === "kcal" ? "kcal" : "g"}`}
              {(!value.complete || (before && !before.complete)) && "；含資料缺口，以上僅為已知小計"}
            </li>;
          })}
        </ul></section>;
      })}
    </details>
    <details><summary>採買變更（{proposal.shoppingDiff.length} 項）</summary>
      <ul>{proposal.shoppingDiff.map(diff => <li key={diff.id}>
        {diff.after?.name ?? diff.before?.name}：{`需買 ${diff.before?.toBuy ?? 0} → ${diff.after?.toBuy ?? 0} ${diff.after?.unit ?? diff.before?.unit}`}
        {`；庫存扣抵 ${diff.before?.pantryUsed ?? 0} → ${diff.after?.pantryUsed ?? 0}`}
        {diff.after?.requiresReconfirmation && "；增加需求，將取消原勾選，請重新確認"}
        {!diff.after && "；移除"}
      </li>)}</ul>
    </details>
    <details><summary>料理步驟變更（{proposal.prepDiff.length} 項）</summary>
      <ul>{proposal.prepDiff.map(diff => <li key={diff.id}>
        {diff.after?.description ?? diff.before?.description}：
        {`${diff.before ? `${diff.before.startMinute}–${diff.before.endMinute}` : "未安排"} → ${diff.after ? `${diff.after.startMinute}–${diff.after.endMinute}` : "移除"} 分鐘`}
        {diff.before?.checked && !diff.after?.checked && "；原完成狀態不再沿用"}
      </li>)}</ul>
    </details>
  </section>;
}
