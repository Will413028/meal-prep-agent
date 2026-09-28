"use client";

import type { components } from "../../shared/api/schema";
import type { PlanActionRequest } from "../../shared/api/persistence";
import { planningWarning } from "./messages";

export type Evaluation = components["schemas"]["Evaluation-Output"];
export type Meal = Evaluation["candidate"]["meals"][number];
export type Recipe = NonNullable<Meal["recipeSnapshot"]>;
export const slotLabels = {breakfast:"早餐",lunch:"午餐",dinner:"晚餐",snack:"點心"};
export const nutrientLabels = {kcal:"熱量",protein:"蛋白質",carbs:"碳水",fat:"脂肪"};

export function PlanView({evaluation,recipes,disabled=false,onReplace,onAction,onPortion}: {
  evaluation: Evaluation; recipes: Recipe[]; disabled?: boolean;
  onReplace?: (meal: Meal, recipeId: string) => void;
  onAction?: (action: PlanActionRequest["action"]) => void;
  onPortion?: (meal: Meal, value: string) => void;
}) {
  return <>
    <div className="days-grid">
    {evaluation.days.map(day => <section key={day.day} aria-label={`${day.day} 營養與餐點`}>
      <h3>{day.day}</h3>
      <p>{day.fullDay ? "三餐已安排" : "部分餐次，不能判定全天達標"}；{day.withinTargets === null ? "整日達標狀態未知" : day.withinTargets ? "符合本次目標範圍" : "尚未符合目標範圍"}</p>
      <ul>{Object.entries(day.nutrients).map(([name,value]) => <li key={name}>
        {nutrientLabels[name as keyof typeof nutrientLabels]}：已知小計 {value.known} {name === "kcal" ? "kcal" : "g"}
        {!value.complete && "；資料不完整"}；{value.withinTarget === null ? "不判定達標" : value.withinTarget ? "範圍內" : "範圍外"}
        {value.targetDifference != null && `；${value.targetDifference > 0 ? "還差" : value.targetDifference < 0 ? "超出" : "範圍差距"} ${Math.abs(value.targetDifference)} ${name === "kcal" ? "kcal" : "g"}`}
      </li>)}</ul>
      {evaluation.candidate.meals.filter(meal => meal.day === day.day).map(meal => {
        const alternatives = recipes.filter(recipe => recipe.id !== meal.recipeId && recipe.mealSlots.includes(meal.slot));
        const nutrition = evaluation.mealNutrition.find(item => item.day === meal.day && item.slot === meal.slot);
        return <article key={meal.slot} aria-label={`${meal.day} ${slotLabels[meal.slot]}`}>
          <h4>{slotLabels[meal.slot]} · <span data-testid="meal-name">{meal.recipeSnapshot?.name ?? meal.external?.name}</span></h4>
          <p>份量 {meal.quantity}；{meal.locked ? "已鎖定" : "可調整"}</p>
          <p>{meal.recipeSnapshot?.sourceLabel ?? "外食依提供資料計算；食材未知，不納入自煮採買及步驟"}</p>
          {nutrition ? <ul aria-label="本餐營養">{Object.entries(nutrition.nutrients).map(([name,value]) => <li key={name}>
            {`本餐${nutrientLabels[name as keyof typeof nutrientLabels]}：${value.amount === null ? "未知" : `${value.amount} ${name === "kcal" ? "kcal" : "g"}`}（${value.source === "synthetic" ? "合成展示" : "使用者提供"}）`}
          </li>)}</ul> : <p>本餐營養資料缺漏。</p>}
          {meal.recipeSnapshot && <p>食譜標示基準：每 {meal.recipeSnapshot.basisQuantity} {meal.recipeSnapshot.basisUnit}；料理步驟共 {meal.recipeSnapshot.steps.reduce((total,step) => total+step.minutes,0)} 分鐘</p>}
          {onAction && <button disabled={disabled} onClick={() => onAction({type:"locks",day:meal.day,slot:meal.slot,locked:!meal.locked})}>{meal.locked ? "解鎖" : "鎖定"}</button>}
          {onReplace && <form onSubmit={event => {event.preventDefault(); const data = new FormData(event.currentTarget); onReplace(meal,String(data.get("recipe")));}}>
            <label>替換{slotLabels[meal.slot]}<select name="recipe" disabled={disabled || meal.locked} defaultValue={alternatives[0]?.id}>{alternatives.map(recipe => <option key={recipe.id} value={recipe.id}>{recipe.name}</option>)}</select></label>
            <button disabled={disabled || meal.locked || !alternatives.length}>換菜</button>
          </form>}
          {onPortion && <form onSubmit={event => {event.preventDefault(); onPortion(meal,String(new FormData(event.currentTarget).get("quantity")));}}>
            <label>{meal.day} {slotLabels[meal.slot]}份量<input key={meal.quantity} name="quantity" defaultValue={meal.quantity} disabled={disabled || meal.locked} /></label>
            <button disabled={disabled || meal.locked}>更新份量</button>
          </form>}
        </article>;
      })}
    </section>)}</div>
    {evaluation.warnings.length > 0 && <p>待確認：{Array.from(new Set(evaluation.warnings.map(planningWarning))).join("；")}</p>}
    <section aria-label="採買清單"><h3>採買清單</h3>
      {evaluation.shopping.items.map(item => <label key={item.id} style={{display:"block"}}>
        <input type="checkbox" checked={item.checked} disabled={disabled || !onAction} onChange={event => onAction?.({type:"checks",collection:"shopping",id:item.id,checked:event.target.checked})} />
        {item.name}：需求 {item.required}、庫存扣抵 {item.pantryUsed}、需買 {item.toBuy} {item.unit}（{item.state}／{item.specification}）{item.requiresReconfirmation && "；數量增加，請重新確認"}
      </label>)}
      {evaluation.shopping.warnings.map((warning,index) => <p key={index}>{warning}</p>)}
    </section>
    <section aria-label="料理與分裝"><h3>料理與分裝</h3><p>{evaluation.prep.sourceLabel}；排程 {evaluation.prep.totalMinutes} 分鐘</p>
      <ol>{evaluation.prep.steps.map(step => <li key={step.id}><label>
        <input type="checkbox" checked={step.checked} disabled={disabled || !onAction} onChange={event => onAction?.({type:"checks",collection:"prep",id:step.id,checked:event.target.checked})} />
        {step.startMinute}–{step.endMinute} 分鐘：{step.description}（{step.equipment ?? "手動"}）
        {evaluation.prep.destinations.filter(destination => destination.id === step.destinationId).map(destination => <span key={destination.id}> — {destination.day} {slotLabels[destination.slot]}</span>)}
      </label></li>)}</ol>
      {evaluation.prep.destinations.map(destination => <p key={destination.id}>{destination.day} {slotLabels[destination.slot]}：{destination.quantity} {destination.unit}；保存：{destination.storage ?? "未知"}；復熱：{destination.reheating ?? "未知"}</p>)}
    </section>
  </>;
}
