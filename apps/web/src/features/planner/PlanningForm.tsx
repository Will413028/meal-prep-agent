"use client";

import { useEffect, useState, type FormEvent } from "react";
import Decimal from "decimal.js";
import type { PreviewRequest } from "../../shared/api/persistence";
import { slotLabels, type Evaluation, type Meal, type Recipe } from "./PlanView";

export type Preferences = Omit<PreviewRequest,"schemaVersion" | "context" | "goal">;
type Slot = Preferences["constraints"]["slots"][number];
type Pantry = NonNullable<Preferences["pantry"]>[number];

export function planDates(start: string): string[] {
  return Array.from({length:3},(_,index) => {
    const day = new Date(`${start}T00:00:00Z`);
    day.setUTCDate(day.getUTCDate()+index);
    const result = day.toISOString().slice(0,10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(result)) throw new Error("請選擇有效的三天日期。");
    return result;
  });
}

function amount(value: FormDataEntryValue | null, nullable = false): number | null {
  const text = String(value ?? "").trim();
  if (text === "" && nullable) return null;
  if (!/^\d+(?:\.\d+)?$/.test(text) || !Number.isFinite(Number(text)) || !new Decimal(text).equals(Number(text).toString())) throw new Error("請輸入有效數量，數值不可損失精度。");
  return Number(text);
}

export function PlanningForm({initial,recipes,disabled,onBuild,onInvalidate}: {
  initial: Evaluation["candidate"] | null; recipes: Recipe[]; disabled: boolean;
  onBuild: (preferences: Preferences) => void; onInvalidate: () => void;
}) {
  const [date,setDate] = useState(initial?.constraints.startDate ?? "");
  const [slots,setSlots] = useState<Slot[]>(initial?.constraints.slots ?? ["breakfast","lunch","dinner"]);
  const [equipment,setEquipment] = useState<string[]>(initial?.constraints.equipment ?? ["rice_cooker"]);
  const [fixed,setFixed] = useState<Meal[]>([]);
  const [pantry,setPantry] = useState<Pantry[]>(initial?.pantry ?? []);
  const [error,setError] = useState("");
  useEffect(() => {if (!initial) setDate(new Date().toLocaleDateString("en-CA"));},[initial]);
  const foods = Array.from(new Map(recipes.flatMap(recipe => recipe.ingredients).map(food => [`${food.foodId}:${food.specification}:${food.state}:${food.unit}`,food])).entries());
  const names = (value: FormDataEntryValue | null) => String(value ?? "").split(/[，,]/).map(value => value.trim()).filter(Boolean);

  function foodIds(value: FormDataEntryValue | null): string[] {
    return Array.from(new Set(names(value).map(name => {
      const matches = new Set(foods.filter(([,food]) => food.foodId === name || food.name === name).map(([,food]) => food.foodId));
      if (matches.size !== 1) throw new Error(`無法確認食材「${name}」，請使用下方清單中的名稱。`);
      return [...matches][0];
    })));
  }
  const foodNames = (ids: string[] | undefined) => ids?.map(id => foods.find(([,food]) => food.foodId === id)?.[1].name ?? id).join("，");

  function build(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();setError("");
    try {
      const data = new FormData(event.currentTarget);
      const dates = planDates(date);
      const breakfast = String(data.get("breakfast") ?? "");
      const fixedMeals = [...fixed];
      if (breakfast) {
        const quantity = amount(data.get("breakfastQuantity"))!;
        if (quantity <= 0 || !/^\d+(?:\.\d{1,3})?$/.test(String(data.get("breakfastQuantity")))) throw new Error("早餐份量須大於零，最多三位小數。");
        for (const day of dates) fixedMeals.push({day,slot:"breakfast",kind:"recipe",recipeId:breakfast,recipeSnapshot:null,external:null,quantity,locked:true});
      }
      onBuild({constraints:{startDate:date,slots,equipment,excludedFoods:foodIds(data.get("exclude")),preferredFoods:foodIds(data.get("prefer")),dietaryTags:names(data.get("diet")),timeLimitMinutes:amount(data.get("minutes"),true),timeIsHard:data.get("hardTime") === "on"},fixedMeals,pantry,replacements:{},searchBudget:20000});
    } catch (failure) {setError(failure instanceof Error ? failure.message : "請檢查條件。");}
  }

  function addExternal(form: HTMLFormElement) {
    setError("");
    try {
      const data = new FormData(form);
      const day = planDates(date)[Number(data.get("externalDay"))];
      const slot = String(data.get("externalSlot")) as Slot;
      const name = String(data.get("externalName")).trim();
      if (!name) throw new Error("請填寫外食名稱。");
      const quantity = amount(data.get("externalQuantity"))!;
      if (quantity <= 0 || !/^\d+(?:\.\d{1,3})?$/.test(String(data.get("externalQuantity")))) throw new Error("外食份量須大於零，最多三位小數。");
      const record = (key: string) => ({amount:amount(data.get(key),true),source:"user" as const,version:"user-v1"});
      const meal: Meal = {
        day,slot,kind:"external",quantity,locked:true,recipeId:null,recipeSnapshot:null,
        external:{name,basisQuantity:1,basisUnit:"serving",ingredientsKnown:false,
          nutrients:{kcal:record("externalKcal"),protein:record("externalProtein"),carbs:record("externalCarbs"),fat:record("externalFat")}},
      };
      setFixed(value => [...value.filter(item => item.day !== day || item.slot !== slot),meal]);onInvalidate();
    } catch (failure) {setError(failure instanceof Error ? failure.message : "請檢查外食資料。");}
  }

  function addPantry(form: HTMLFormElement) {
    setError("");
    try {
      const data = new FormData(form);
      const identity = foods.find(([key]) => key === data.get("pantryFood"))?.[1];
      if (!identity) throw new Error("請選擇庫存食材。");
      const chosen = String(data.get("pantryUnit"));
      const unit = chosen === "base" ? identity.unit : chosen;
      if (unit !== identity.unit && !(unit === "kg" && identity.unit === "g") && !(unit === "l" && identity.unit === "ml")) throw new Error("請選擇與食材相容的單位；重量和體積不能直接互換。");
      const item: Pantry = {foodId:identity.foodId,name:identity.name,specification:identity.specification,state:identity.state,unit:unit as Pantry["unit"],quantity:amount(data.get("pantryAmount"),true),confirmed:data.get("pantryConfirmed") === "on"};
      const dimension = (unit: string) => unit === "kg" ? "g" : unit === "l" ? "ml" : unit;
      setPantry(value => [...value.filter(old => !(old.foodId === item.foodId && old.specification === item.specification && old.state === item.state && dimension(old.unit) === dimension(item.unit))),item]);onInvalidate();
    } catch (failure) {setError(failure instanceof Error ? failure.message : "請檢查庫存。");}
  }

  return <section aria-label="安排三天餐單"><h2>安排三天餐單</h2>
    <details open={!initial}><summary>生活條件、固定餐點與庫存</summary>
    <form onSubmit={build} onChange={onInvalidate}><fieldset disabled={disabled}>
      <label>開始日期<input type="date" required value={date} disabled={Boolean(initial) || fixed.length > 0} onChange={event => setDate(event.target.value)} /></label>
      {initial && <p>更換三天日期請清除本次規劃後重新開始。</p>}
      <fieldset><legend>安排餐次</legend>{Object.entries(slotLabels).map(([slot,label]) => <label key={slot}><input type="checkbox" checked={slots.includes(slot as Slot)} onChange={event => setSlots(value => event.target.checked ? [...value,slot as Slot] : value.filter(item => item !== slot))} />{label}</label>)}</fieldset>
      <fieldset><legend>可用設備</legend>{Array.from(new Set(recipes.flatMap(recipe => recipe.equipment))).map(item => <label key={item}><input type="checkbox" checked={equipment.includes(item)} onChange={event => setEquipment(value => event.target.checked ? [...value,item] : value.filter(value => value !== item))} />{{rice_cooker:"電鍋",pan:"平底鍋",pot:"鍋具"}[item] ?? item}</label>)}</fieldset>
      <label>排除食材（逗號分隔）<input name="exclude" defaultValue={foodNames(initial?.constraints.excludedFoods)} /></label>
      <label>偏好食材（逗號分隔）<input name="prefer" defaultValue={foodNames(initial?.constraints.preferredFoods)} /></label>
      <p>可用食材名稱：{Array.from(new Set(foods.map(([,food]) => food.name))).join("、")}</p>
      <label>飲食限制標籤（逗號分隔）<input name="diet" defaultValue={initial?.constraints.dietaryTags.join("，")} placeholder="例如 vegetarian" /></label>
      <label>料理時間上限（分鐘）<input name="minutes" defaultValue={initial?.constraints.timeLimitMinutes ?? ""} /></label>
      <label><input type="checkbox" name="hardTime" defaultChecked={initial?.constraints.timeIsHard} />時間為必須遵守的限制</label>
      <fieldset><legend>固定早餐</legend>
        <label>固定三天早餐<select name="breakfast" defaultValue=""><option value="">不另外固定</option>{recipes.filter(recipe => recipe.mealSlots.includes("breakfast")).map(recipe => <option key={recipe.id} value={recipe.id}>{recipe.name}</option>)}</select></label>
        <label>固定早餐份量<input name="breakfastQuantity" defaultValue="1" /></label>
      </fieldset>
      <fieldset><legend>固定外食</legend><p>營養皆以每一份為基準；空白是未知，不當成零。外食不拆入自煮清單。</p>
        <label>外食名稱<input name="externalName" maxLength={120} /></label>
        <label>外食日期<select name="externalDay">{[0,1,2].map(day => <option key={day} value={day}>第 {day+1} 天</option>)}</select></label>
        <label>外食餐次<select name="externalSlot" defaultValue="lunch">{Object.entries(slotLabels).map(([slot,label]) => <option key={slot} value={slot}>{label}</option>)}</select></label>
        <label>外食份量<input name="externalQuantity" defaultValue="1" /></label>
        <label>每份外食熱量（kcal）<input name="externalKcal" /></label><label>每份外食蛋白質（g）<input name="externalProtein" /></label>
        <label>每份外食碳水（g）<input name="externalCarbs" /></label><label>每份外食脂肪（g）<input name="externalFat" /></label>
        <button type="button" onClick={event => addExternal(event.currentTarget.form!)}>加入固定外食</button>
        {fixed.map(meal => <p key={`${meal.day}:${meal.slot}`}>{meal.day} {slotLabels[meal.slot]}：{meal.external?.name}（預設鎖定）<button type="button" onClick={() => {setFixed(value => value.filter(item => item !== meal));onInvalidate();}}>移除本次新增外食</button></p>)}
      </fieldset>
      <fieldset><legend>現有庫存</legend><p>只有已確認且數量已知的庫存會扣抵；不同生熟狀態不合併。</p>
        <label>庫存食材<select name="pantryFood">{foods.map(([key,food]) => <option key={key} value={key}>{food.name}（{food.state}／{food.unit}／{food.specification}）</option>)}</select></label>
        <label>庫存數量<input name="pantryAmount" /></label><label><input name="pantryConfirmed" type="checkbox" />已確認庫存數量</label>
        <label>庫存單位<select name="pantryUnit" defaultValue="base"><option value="base">食材標示單位</option><option value="kg">kg（適用重量）</option><option value="l">l（適用體積）</option></select></label>
        <button type="button" onClick={event => addPantry(event.currentTarget.form!)}>加入庫存</button>
        {pantry.map((item,index) => <p key={index}>{item.name}：{item.quantity ?? "未知"} {item.unit}／{item.confirmed ? "已確認" : "待確認"}<button type="button" onClick={() => {setPantry(value => value.filter((_,itemIndex) => itemIndex !== index));onInvalidate();}}>移除庫存</button></p>)}
      </fieldset>
      {error && <p role="alert">{error}</p>}
      <button disabled={!slots.length || !recipes.length}>產生三天提案</button>
    </fieldset></form></details>
  </section>;
}
