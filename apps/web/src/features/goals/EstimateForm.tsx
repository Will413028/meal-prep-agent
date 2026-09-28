"use client";

import { useState, type FormEvent } from "react";
import { estimateGoal, type EstimateInput } from "./estimate";
import { energyReference, proteinReferences, type EstimateDraft } from "./goal-state";

export function EstimateForm({ onEstimate, onInvalidate }: { onEstimate: (draft: EstimateDraft) => void; onInvalidate: () => void }) {
  const [message, setMessage] = useState("");
  const [training, setTraining] = useState(false);
  const [comparison, setComparison] = useState<{ label: string; text: string }[]>([]);
  function estimate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const input: EstimateInput = {
      age: Number(form.get("age")), heightCm: Number(form.get("heightCm")), weightKg: Number(form.get("weightKg")),
      classification: form.get("classification") as EstimateInput["classification"],
      activity: form.get("activity") as EstimateInput["activity"],
      intent: form.get("intent") as EstimateInput["intent"],
      training: form.get("training") === "true", pregnantOrLactating: form.get("pregnantOrLactating") === "true", needsProfessional: form.get("needsProfessional") === "true",
    };
    if (form.get("activity") === "unsure") {
      onInvalidate();
      setComparison(([["inactive", "不活躍"], ["low_active", "低活動"], ["active", "活躍"], ["very_active", "非常活躍"]] as const).map(([activity, label]) => {
        const candidate = estimateGoal({ ...input, activity });
        return { label, text: candidate.status === "ready" ? `${candidate.kcal} kcal／日` : candidate.reason };
      }));
      setMessage("請比較相鄰級後明確選定活動分級，再估算；尚未建立可確認目標。");
      return;
    }
    setComparison([]);
    const result = estimateGoal(input);
    if (result.status !== "ready") { setMessage(result.reason); return; }
    setTraining(input.training);
    setMessage(`DRI 2023 維持估算：${result.eer} kcal／日。目標可修改，確認後才生效。${input.intent === "gain" && !input.training ? "未規律訓練：此估算不能承諾增肌，蛋白質仍採一般成人參考。" : ""}`);
    onEstimate({ input, result });
  }
  return <form onSubmit={estimate} onChange={() => { setMessage(""); setComparison([]); onInvalidate(); }}>
    <h3>幫我設定目標</h3>
    <p>身體問卷只在本次分頁計算，不傳送或保存。此為一般成人起始估算，不是醫療處方。</p>
    <label>年齡（歲）<input name="age" type="number" step="1" required /></label>
    <label>身高（cm）<input name="heightCm" type="number" step="0.1" required /></label>
    <label>體重（kg）<input name="weightKg" type="number" step="0.1" required /></label>
    <label>公式分類<select name="classification" defaultValue="" required><option value="">請選擇</option><option value="male">male</option><option value="female">female</option><option value="unknown">不確定／不提供</option></select></label>
    <label>活動分級<select name="activity" defaultValue="" required><option value="">請選擇</option><option value="unsure">不確定，先比較</option><option value="inactive">不活躍</option><option value="low_active">低活動</option><option value="active">活躍</option><option value="very_active">非常活躍</option></select></label>
    <p>活動分級涵蓋工作、通勤、家務與運動；不活躍仍包含日常活動。不確定時先保留草稿，不能只用每週健身次數判定。</p>
    <label>飲食目標<select name="intent" defaultValue="" required><option value="">請選擇</option><option value="maintain">維持</option><option value="lose">減脂</option><option value="gain">增肌</option></select></label>
    {([["training", "規律訓練"], ["pregnantOrLactating", "孕期或哺乳期"], ["needsProfessional", "需要專業調整飲食"]] as const).map(([name, label]) => <label key={name}>{label}<select name={name} defaultValue="" required><option value="">請選擇</option><option value="false">否</option><option value="true">是</option></select></label>)}
    <p>規律訓練指持續且有訓練目的的阻力或耐力活動；不會由增肌選項推定。</p>
    <button type="submit">在本機估算</button>
    {comparison.length > 0 && <section aria-label="活動分級比較"><h4>比較相鄰活動分級</h4>{comparison.map(({ label, text }) => <p key={label}>{label}：{text}</p>)}</section>}
    {message && <p role="status">{message}</p>}
    <a href={energyReference}>DRI 2023 熱量公式來源</a>
    {message && comparison.length === 0 && <p><a href={proteinReferences[training ? "training" : "general"]}>{training ? "蛋白質：NIH ODS 運動營養；1.6 g/kg 為產品預設" : "蛋白質：Health Canada 一般成人 RDA 參考"}</a></p>}
  </form>;
}
