import type { ConfirmedGoal } from "../goals/goal-state";
import { nutrientLabels } from "./PlanView";

export function GoalSummary({goal,label}: {goal: ConfirmedGoal;label: string}) {
  const intent = {maintain:"維持",lose:"減脂",gain:"增肌"};
  const source = {manual:"手動輸入",estimated:"本機估算",user_adjusted:"使用者調整估算"};
  return <section aria-label={label}><h3>{label}</h3>
    <p>{intent[goal.intent]} · {source[goal.source]} · 確認時間 {goal.confirmedAt}</p>
    <ul>{Object.entries(nutrientLabels).map(([key,label]) => {
      const nutrient = key as keyof typeof nutrientLabels;
      const requested = goal.requested[nutrient];
      const range = goal.ranges[nutrient];
      return <li key={key}>{label}：{requested == null ? "未設定" : typeof requested === "number" ? requested : `${requested.min}–${requested.max}`} {key === "kcal" ? "kcal" : "g"}
        {range && `；本次配餐範圍 ${range.min}–${range.max}`}
      </li>;
    })}</ul>
    {goal.references.filter(url => url.startsWith("https://")).map((url,index) => <a key={url} href={url} rel="noreferrer" target="_blank">{index === 0 ? "熱量參考來源" : "蛋白質參考來源"} </a>)}
  </section>;
}
