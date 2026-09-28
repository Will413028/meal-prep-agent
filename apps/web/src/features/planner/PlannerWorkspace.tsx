"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { GoalSetup } from "../goals/GoalSetup";
import type { ConfirmedGoal } from "../goals/goal-state";
import { PlanRepository, PlanRepositoryError } from "../../shared/api/plan-repository";
import type { PlanActionRequest, PreviewRequest, SessionState } from "../../shared/api/persistence";
import { validateRecipes } from "../../shared/api/validate";
import type { components } from "../../shared/api/schema";
import { PlanView, type Meal, type Recipe } from "./PlanView";
import { PlanningForm, planDates, type Preferences } from "./PlanningForm";
import { planningFailure } from "./messages";
import { ProposalComparison } from "./ProposalComparison";
import { GoalSummary } from "./GoalSummary";

type Proposal = components["schemas"]["CanonicalProposal"];
type Constraints = PreviewRequest["constraints"];

function scopeFor(constraints: Constraints) {
  return planDates(constraints.startDate).flatMap(day => constraints.slots.map(slot => ({day,slot})));
}

export function PlannerWorkspace() {
  const repository = useMemo(() => new PlanRepository(),[]);
  const generation = useRef(0);
  const [session,setSession] = useState<SessionState | null>(null);
  const [goal,setGoal] = useState<ConfirmedGoal | null>(null);
  const [recipes,setRecipes] = useState<Recipe[]>([]);
  const [proposal,setProposal] = useState<Proposal | null>(null);
  const [ready,setReady] = useState(false);
  const [progress,setProgress] = useState<string | null>(null);
  const busy = progress !== null;
  const [readOnly,setReadOnly] = useState(false);
  const [error,setError] = useState("");
  const [unsupported,setUnsupported] = useState(false);
  const [editingGoal,setEditingGoal] = useState(true);
  const [formKey,setFormKey] = useState(0);

  function restore(state: SessionState | null) {
    generation.current++;
    setSession(state);setGoal(state?.current?.candidate.goal ?? null);
    setEditingGoal(!state?.current);setFormKey(value => value+1);
    setProposal(null);setReadOnly(false);setUnsupported(false);
  }

  function readFailure(cause: unknown) {
    const incompatible = cause instanceof PlanRepositoryError && cause.code === "unsupported_state";
    setReadOnly(true);setUnsupported(incompatible);
    setError(incompatible ? "舊餐單格式已不相容。原資料保留至到期，請開始新規劃。" : "雲端暫時不可用；目前快照僅供唯讀，請重試。");
  }

  useEffect(() => {
    let active = true;
    void repository.read().then(state => {
      if (!active) return;
      restore(state);
    }).catch(cause => {if (active) readFailure(cause);}).finally(() => {if (active) setReady(true);});
    void fetch("/api/v1/recipes").then(async response => {
      if (!response.ok) throw new Error("catalog unavailable");
      const catalog = validateRecipes(await response.json());
      if (active) setRecipes(catalog);
    }).catch(() => {if (active) setError("食譜暫時無法載入；已保存餐單仍可查看。");});
    return () => {active = false; generation.current++;};
  },[repository]);

  async function reload() {
    try {restore(await repository.read());setError("");}
    catch (cause) {readFailure(cause);}
  }

  async function preview(preferences: Preferences, replacement?: {meal: Meal; recipeId: string}) {
    if (!goal) return;
    const constraints = preferences.constraints;
    const id = ++generation.current;
    setProgress(replacement ? "正在尋找替換餐點…" : "正在產生三天提案…");setError("");setProposal(null);
    try {
      const state = session ?? await repository.initialize();
      if (id !== generation.current) return;
      setSession(state);
      const scope = replacement ? [{day:replacement.meal.day,slot:replacement.meal.slot}] : Array.from(new Map([...scopeFor(constraints),...(state.current ? scopeFor(state.current.candidate.constraints) : []),...(state.current?.candidate.meals ?? []),...preferences.fixedMeals].map(({day,slot}) => [`${day}:${slot}`,{day,slot}])).values());
      const result = await repository.preview({schemaVersion:1,
        context:{planId:state.planId,sessionGeneration:state.sessionGeneration,baseRevision:state.revision,runId:crypto.randomUUID(),scope},
        goal:replacement && state.current ? state.current.candidate.goal : goal,...preferences,
        replacements:replacement ? {[`${replacement.meal.day}:${replacement.meal.slot}`]:replacement.recipeId} : {},
      },state.csrfToken);
      if (id !== generation.current) return;
      if (result.status === "ready" && result.proposal) setProposal(result.proposal);
      else setError(`${planningFailure(result.reason)} 目前計畫未變更。`);
    } catch {if (id === generation.current) setError("提案未完成，請確認服務可用或重新讀取目前版本後重試；原計畫未變更。");}
    finally {if (id === generation.current) setProgress(null);}
  }

  async function save(action: PlanActionRequest["action"]) {
    if (!session) return;
    setProgress("正在保存變更…");setError("");
    try {
      const saved = await repository.apply({schemaVersion:1,planId:session.planId,sessionGeneration:session.sessionGeneration,baseRevision:session.revision,operationId:crypto.randomUUID(),action},session.csrfToken);
      if (action.type === "adopt" || action.type === "undo") restore(saved);
      else {setSession(saved);setProposal(null);setReadOnly(false);}
    } catch {
      setProposal(null);
      try {restore(await repository.read());setError("操作未確認成功，已重新讀取目前版本。請檢查餐單後再操作。");}
      catch (cause) {readFailure(cause);}
    } finally {setProgress(null);}
  }

  async function clear() {
    if (!session) return;
    generation.current++;setProposal(null);setProgress("正在清除規劃…");setError("");
    try {
      await repository.clear(session.csrfToken);
      setSession(null);setGoal(null);setEditingGoal(true);setFormKey(value => value+1);setReadOnly(false);
    } catch {setReadOnly(true);setError("清除尚未確認完成，請重試；不會將失敗顯示為已清除。");}
    finally {setProgress(null);}
  }

  async function startNew() {
    setProgress("正在開始新規劃…");setError("");
    try {
      const state = await repository.initialize();
      generation.current++;setSession(state);setGoal(null);setProposal(null);
      setEditingGoal(true);setFormKey(value => value+1);setReadOnly(false);setUnsupported(false);
    } catch {setError("未能開始新規劃，請重試。");}
    finally {setProgress(null);}
  }

  return <div>
    {editingGoal && <fieldset disabled={busy || !ready}><GoalSetup key={formKey} onConfirm={confirmed => {generation.current++;setGoal(confirmed);setProposal(null);}} /></fieldset>}
    {!editingGoal && <button disabled={busy} onClick={() => setEditingGoal(true)}>修改目標</button>}
    {!ready && <p role="status">讀取餐單中…</p>}
    {error && <p role="alert">{error}</p>}
    {readOnly && <p>目前為唯讀狀態。</p>}
    {unsupported && <button disabled={busy} onClick={() => void startNew()}>開始新規劃</button>}
    <button disabled={!ready || busy} onClick={() => void reload()}>重新讀取餐單</button>
    {goal && <PlanningForm key={`${session?.current ? session.planId : "new"}:${formKey}`} initial={session?.current?.candidate ?? null} recipes={recipes} disabled={busy || !ready || readOnly} onBuild={preferences => void preview(preferences)} onInvalidate={() => setProposal(null)} />}
    {busy && <p role="status">{progress}</p>}
    {proposal && <section aria-label="餐單提案預覽"><h2>餐單提案預覽 · 尚未採用</h2>
      <p>採用前不會變更目前計畫。</p>
      <GoalSummary goal={proposal.evaluation.candidate.goal} label="採用後的目標" />
      <ProposalComparison proposal={proposal} base={session?.current ?? null} />
      <button disabled={busy || readOnly || proposal.baseRevision !== session?.revision} onClick={() => void save({type:"adopt",candidate:proposal.evaluation.candidate,scope:proposal.scope,runId:proposal.runId})}>採用這份提案</button>
      <button disabled={busy} onClick={() => {generation.current++;setProposal(null);}}>取消提案</button>
      <PlanView evaluation={proposal.evaluation} recipes={recipes} disabled />
    </section>}
    {session?.current && <section aria-label="已採用餐單"><h2>已採用餐單</h2><p>{readOnly ? "唯讀快照" : "已保存"} · 版本 {session.revision}</p>
      <GoalSummary goal={session.current.candidate.goal} label="目前生效目標" />
      <button disabled={busy || readOnly || !session.canUndo} onClick={() => void save({type:"undo"})}>復原上一版</button>
      <PlanView evaluation={session.current} recipes={recipes} disabled={busy || readOnly}
        onAction={action => void save(action)}
        onReplace={(meal,recipeId) => void preview({constraints:session.current!.candidate.constraints,pantry:session.current!.candidate.pantry,fixedMeals:[],replacements:{},searchBudget:20000},{meal,recipeId})}
        onPortion={(meal,value) => {
          if (!/^\d+(?:\.\d{1,3})?$/.test(value) || Number(value) <= 0 || Number(value) > 10000) {setError("份量須為正數且最多三位小數。");return;}
          void save({type:"portion",day:meal.day,slot:meal.slot,quantity:Number(value)});
        }} />
    </section>}
    {session && <button disabled={busy} onClick={() => void clear()}>清除本次規劃</button>}
  </div>;
}
