"use client";

import { useRef, useState, type FormEvent } from "react";
import { createApiClient } from "../../shared/api/client";
import { validateGoalResponse } from "../../shared/api/validate";
import type { components } from "../../shared/api/schema";

import { EstimateForm } from "./EstimateForm";
import { parseTarget } from "./parse-target";

import { confirmGoal, type GoalDraft, type ConfirmedGoal, type EstimateDraft } from "./goal-state";
import type { EstimateInput } from "./estimate";

const sourceLabels = { manual: "手動", estimated: "本機估算", user_adjusted: "使用者調整估算" };

export function GoalSetup({onConfirm}: {onConfirm?: (goal: ConfirmedGoal) => void} = {}) {
  const [draft, setDraft] = useState<GoalDraft | null>(null);
  const [confirmed, setConfirmed] = useState<ConfirmedGoal | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const generation = useRef(0);
  const [showEstimate, setShowEstimate] = useState(false);
  const [kcal, setKcal] = useState("");
  const [protein, setProtein] = useState("");
  const [carbs, setCarbs] = useState("");
  const [fat, setFat] = useState("");
  const [intent, setIntent] = useState<EstimateInput["intent"]>("maintain");
  const [estimate, setEstimate] = useState<EstimateDraft | null>(null);

  function invalidateDraft() {
    generation.current += 1;
    setDraft(null);
    setError("");
    setBusy(false);
  }

  async function validate(kcal: components["schemas"]["GoalValues"]["kcal"], protein: components["schemas"]["GoalValues"]["protein"], optional: { carbs?: components["schemas"]["GoalValues"]["carbs"]; fat?: components["schemas"]["GoalValues"]["fat"] } = {}, metadata = { intent, estimate }) {
    const id = ++generation.current;
    setDraft(null);
    setError("");
    setBusy(true);
    try {
      const api = createApiClient(window.location.origin);
      const { data, error: failure } = await api.POST("/api/v1/goals/validate", {
        body: { schemaVersion: 1, kcal, protein, ...optional },
      });
      if (failure) throw new Error("請檢查目標數值及範圍。");
      const result = validateGoalResponse(data);
      if (id === generation.current) setDraft({ validated: result, ...metadata });
    } catch {
      if (id === generation.current) setError("目標尚未通過檢查，請確認數值或稍後重試。");
    } finally {
      if (id === generation.current) setBusy(false);
    }
  }

  function check(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const energy = parseTarget(kcal), grams = parseTarget(protein);
      if (energy === null || grams === null) throw new Error("請填寫必要數值");
      void validate(energy, grams, { carbs: parseTarget(carbs), fat: parseTarget(fat) });
    } catch {
      invalidateDraft();
      setError("請檢查數值：最多一位小數；區間格式為下限..上限，且下限不得大於上限。");
    }
  }

  return <section aria-labelledby="goal-title">
    <h2 id="goal-title">目標設定</h2>
    <button type="button" disabled={busy} onClick={() => {
      setEstimate(null);setShowEstimate(false);setIntent("maintain");setKcal("2000");setProtein("100");setCarbs("");setFat("");
      void validate(2000,100,{}, {intent:"maintain",estimate:null});
    }}>載入合成目標</button>
    <button type="button" onClick={() => { invalidateDraft(); setShowEstimate(!showEstimate); }}>幫我設定目標</button>
    {showEstimate && <EstimateForm onInvalidate={invalidateDraft} onEstimate={(local) => {
      const { kcal: energy, protein: grams } = local.result;
      setEstimate(local); setIntent(local.input.intent);
      setKcal(String(energy)); setProtein(String(grams)); setCarbs(""); setFat("");
      void validate(energy, grams, {}, { intent: local.input.intent, estimate: local });
    }} />}
    <h3>我已有目標／修改估算值</h3>
    <form onSubmit={check} onChange={invalidateDraft}>
      <label>目標意圖<select value={intent} onChange={(event) => setIntent(event.target.value as EstimateInput["intent"])}><option value="maintain">維持</option><option value="lose">減脂</option><option value="gain">增肌</option></select></label>
      <p>輸入單值或區間，例如 2000 或 1900..2100；最多一位小數。選填空白表示未設定，0 表示明確零值。</p>
      <label>每日熱量（kcal）<input name="kcal" value={kcal} onChange={(event) => setKcal(event.target.value)} type="text" required /></label>
      <label>每日蛋白質（g）<input name="protein" value={protein} onChange={(event) => setProtein(event.target.value)} type="text" required /></label>
      <label>每日碳水（g，選填）<input name="carbs" value={carbs} onChange={(event) => setCarbs(event.target.value)} type="text" /></label>
      <label>每日脂肪（g，選填）<input name="fat" value={fat} onChange={(event) => setFat(event.target.value)} type="text" /></label>
      <button type="submit" disabled={busy}>{busy ? "檢查中…" : "檢查目標"}</button>
    </form>
    {error && <p role="alert">{error}</p>}
    {draft && <section aria-label="目標預覽">
      <h3>確認前不會變更目前目標</h3>
      {draft.estimate && <p>原始估算：{draft.estimate.result.kcal} kcal／{draft.estimate.result.protein} g 蛋白質；維持估算 {draft.estimate.result.eer} kcal，意圖調整後未取整 {draft.estimate.result.adjustedKcal} kcal；活動假設 {draft.estimate.input.activity}。修改值不會抹除本次原始估算。</p>}
      <p>熱量 {draft.validated.ranges.kcal.min}–{draft.validated.ranges.kcal.max} kcal／日</p>
      <p>蛋白質 {draft.validated.ranges.protein.min}–{draft.validated.ranges.protein.max} g／日</p>
      <p>碳水 {draft.validated.ranges.carbs ? `${draft.validated.ranges.carbs.min}–${draft.validated.ranges.carbs.max} g／日` : "未設定"}</p>
      <p>脂肪 {draft.validated.ranges.fat ? `${draft.validated.ranges.fat.min}–${draft.validated.ranges.fat.max} g／日` : "未設定"}</p>
      <p>政策：{draft.validated.policyVersion}；此範圍為產品配餐條件。</p>
      <button type="button" onClick={() => { const goal = confirmGoal(draft, new Date()); setConfirmed(goal); onConfirm?.(goal); setDraft(null); }}>確認使用此目標</button>
    </section>}
    {confirmed && <section data-testid="confirmed-goal" aria-label="已確認目標">
      <h3>本次目標已確認</h3>
      <p>來源：{sourceLabels[confirmed.source]}；確認時間：{confirmed.confirmedAt}</p>
      {confirmed.references.map((url, index) => <a key={url} href={url}>{index === 0 ? "熱量參考來源" : "蛋白質參考來源"}</a>)}
      <p>{typeof confirmed.requested.kcal === "number" ? confirmed.requested.kcal : `${confirmed.requested.kcal.min}–${confirmed.requested.kcal.max}`} kcal／日</p>
      <p>餐單尚未建立；本次確認不代表已保存至雲端。</p>
    </section>}
  </section>;
}
