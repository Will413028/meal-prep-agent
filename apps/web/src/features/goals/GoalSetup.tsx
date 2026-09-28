"use client";

import { useRef, useState, type FormEvent } from "react";
import { createApiClient } from "../../shared/api/client";
import { validateGoalResponse } from "../../shared/api/validate";
import type { components } from "../../shared/api/schema";

import { EstimateForm } from "./EstimateForm";

type GoalResult = components["schemas"]["GoalResult"];

export function GoalSetup() {
  const [draft, setDraft] = useState<GoalResult | null>(null);
  const [confirmed, setConfirmed] = useState<GoalResult | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const generation = useRef(0);
  const [showEstimate, setShowEstimate] = useState(false);
  const [kcal, setKcal] = useState("");
  const [protein, setProtein] = useState("");

  function invalidateDraft() {
    generation.current += 1;
    setDraft(null);
    setError("");
    setBusy(false);
  }

  async function validate(kcal: number, protein: number) {
    const id = ++generation.current;
    setDraft(null);
    setError("");
    setBusy(true);
    try {
      const api = createApiClient(window.location.origin);
      const { data, error: failure } = await api.POST("/api/v1/goals/validate", {
        body: { schemaVersion: 1, kcal, protein },
      });
      if (failure) throw new Error("請檢查目標數值及範圍。");
      const result = validateGoalResponse(data);
      if (id === generation.current) setDraft(result);
    } catch {
      if (id === generation.current) setError("目標尚未通過檢查，請確認數值或稍後重試。");
    } finally {
      if (id === generation.current) setBusy(false);
    }
  }

  function check(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void validate(Number(kcal), Number(protein));
  }

  return <section aria-labelledby="goal-title">
    <h2 id="goal-title">目標設定</h2>
    <button type="button" onClick={() => { invalidateDraft(); setShowEstimate(!showEstimate); }}>幫我設定目標</button>
    {showEstimate && <EstimateForm onEstimate={(energy, grams) => {
      setKcal(String(energy)); setProtein(String(grams)); void validate(energy, grams);
    }} />}
    <h3>我已有目標／修改估算值</h3>
    <form onSubmit={check} onChange={invalidateDraft}>
      <label>每日熱量（kcal）<input name="kcal" value={kcal} onChange={(event) => setKcal(event.target.value)} type="number" step="0.1" required /></label>
      <label>每日蛋白質（g）<input name="protein" value={protein} onChange={(event) => setProtein(event.target.value)} type="number" step="0.1" required /></label>
      <button type="submit" disabled={busy}>{busy ? "檢查中…" : "檢查目標"}</button>
    </form>
    {error && <p role="alert">{error}</p>}
    {draft && <section aria-label="目標預覽">
      <h3>確認前不會變更目前目標</h3>
      <p>熱量 {draft.ranges.kcal.min}–{draft.ranges.kcal.max} kcal／日</p>
      <p>蛋白質 {draft.ranges.protein.min}–{draft.ranges.protein.max} g／日</p>
      <p>政策：{draft.policyVersion}；此範圍為產品配餐條件。</p>
      <button type="button" onClick={() => { setConfirmed(draft); setDraft(null); }}>確認使用此目標</button>
    </section>}
    {confirmed && <section data-testid="confirmed-goal" aria-label="已確認目標">
      <h3>本次目標已確認</h3>
      <p>{typeof confirmed.requested.kcal === "number" ? confirmed.requested.kcal : `${confirmed.requested.kcal.min}–${confirmed.requested.kcal.max}`} kcal／日</p>
      <p>餐單尚未建立；本次確認不代表已保存至雲端。</p>
    </section>}
  </section>;
}
