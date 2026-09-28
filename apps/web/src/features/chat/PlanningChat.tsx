"use client";

import { useEffect, useRef, useState } from "react";
import { HttpAgent } from "@ag-ui/client";
import type { AgentRunRequest, PreviewRequest } from "../../shared/api/persistence";
import { validateProposal } from "../../shared/api/validate";
import type { components } from "../../shared/api/schema";
import { planningFailure } from "../planner/messages";

type Proposal = components["schemas"]["CanonicalProposal"];
type Message = AgentRunRequest["messages"][number];
type ActiveRun = { agent: HttpAgent; runId: string; cancelled: boolean };
const clarificationMessages = {
  meal:"請指定要調整的日期與餐次，例如 10 月 2 日午餐；目前餐單不變。",
  recipe:"請指定想換成哪道受控食譜；目前餐單不變。",
  conditions:"請先在表單確認要變更的飲食條件；目前餐單不變。",
} as const;
type Clarification = keyof typeof clarificationMessages;

export function PlanningChat({disabled,prepare,onProposal,onBusy,onInvalidate}: {
  disabled: boolean;
  prepare: (runId: string) => {planning: PreviewRequest;csrf: string};
  onProposal: (proposal: Proposal, current: () => boolean) => Promise<void>;
  onBusy: (busy: boolean) => void;
  onInvalidate: () => void;
}) {
  const [mode,setMode] = useState<"fixture" | "live">("fixture");
  const [liveAvailable,setLiveAvailable] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/v1/runtime",{cache:"no-store",signal:controller.signal})
      .then(async response => response.ok ? response.json() : null)
      .then(value => {if (!controller.signal.aborted) setLiveAvailable(value?.liveAvailable === true);})
      .catch(() => {});
    return () => controller.abort();
  },[]);
  const [messages,setMessages] = useState<Message[]>([]);
  const [draft,setDraft] = useState("");
  const [status,setStatus] = useState("尚未傳送訊息。");
  const [running,setRunning] = useState(false);
  const [partial,setPartial] = useState("");
  const [retry,setRetry] = useState<Message | null>(null);
  const [quotaUntil,setQuotaUntil] = useState<number | null>(null);
  const cooling = quotaUntil !== null;
  useEffect(() => {
    if (quotaUntil === null) return;
    const timer = setTimeout(() => setQuotaUntil(null),Math.max(0,quotaUntil-Date.now()));
    return () => clearTimeout(timer);
  },[quotaUntil]);
  const active = useRef<ActiveRun | null>(null);
  useEffect(() => () => {if (active.current) {active.current.cancelled=true;active.current.agent.abortRun();active.current=null;}},[]);

  async function send(text: string, retryTurn: Message | null = null) {
    if (!text.trim() || running || disabled || cooling) return;
    const runId = crypto.randomUUID();
    const {planning,csrf} = prepare(runId);
    const retryIndex = retryTurn ? messages.findIndex(message => message.id === retryTurn.id && message.role === "user") : -1;
    const history = (retryIndex >= 0 ? messages.slice(0,retryIndex+1) : [...messages,{id:crypto.randomUUID(),role:"user" as const,content:text.trim()}]).slice(-8);
    while (history.length > 1 && history.reduce((total,item) => total+[...item.content].length,0) > 8000) history.shift();
    let quotaDelay = 0;
    const agent = new HttpAgent({url:"/api/agent",threadId:planning.context.planId,debug:false,
      headers:{"x-meal-client":"1","x-meal-csrf":csrf},initialMessages:history,
      fetch:async (input,init) => {
        const response = await fetch(input,init);
        if (response.status === 429) quotaDelay=60_000;
        return response;
      }});
    const run = {agent,runId,cancelled:false};
    active.current?.agent.abortRun();active.current=run;
    setMessages(history);setDraft("");setPartial("");setRunning(true);setRetry(null);setStatus("AI 正在處理…");onInvalidate();onBusy(true);
    let proposal: Proposal | null = null;
    let finished = false;
    let failure = false;
    let reason: string | null = null;
    let clarification: Clarification | null = null;
    let attemptedProposal = false;
    let answer = "";
    const current = () => active.current === run && !run.cancelled;
    const timeout = setTimeout(() => {run.agent.abortRun();},60_000);
    try {
      await agent.runAgent({runId,forwardedProps:{planning,mode}}, {
        onEvent({event}) {
          if (!current()) return;
          if (event.type === "RUN_ERROR") {failure=true;proposal=null;if (event.code === "model_quota") quotaDelay=60_000;}
          if (event.type === "RUN_FINISHED" && event.runId === runId) finished=true;
          if (event.type === "TOOL_CALL_START" && event.toolCallName === "build_proposal") attemptedProposal=true;
          if (event.type === "TEXT_MESSAGE_CONTENT" && mode === "fixture") {answer+=event.delta;setPartial(answer);}
          if (event.type === "CUSTOM" && event.name === "proposal_ready") {
            try {
              if (!event.value || typeof event.value !== "object") throw new Error("invalid outcome");
              const outcome = event.value as Record<string,unknown>;
              if (reason || clarification) throw new Error("conflicting outcome");
              const candidate = validateProposal(outcome.proposal);
              const context = planning.context;
              if (outcome.runId !== runId || candidate.runId !== runId || candidate.planId !== context.planId || candidate.sessionGeneration !== context.sessionGeneration || candidate.baseRevision !== context.baseRevision) throw new Error("stale proposal");
              proposal=candidate;
            } catch {failure=true;proposal=null;}
          }
          if (event.type === "CUSTOM" && event.name === "proposal_unavailable" && event.value && typeof event.value === "object") {
            const outcome = event.value as Record<string,unknown>;
            if (outcome.runId === runId && typeof outcome.reason === "string") {
              if (proposal || clarification) {failure=true;proposal=null;}
              else reason=outcome.reason;
            }
          }
          if (event.type === "CUSTOM" && event.name === "clarification_required" && event.value && typeof event.value === "object") {
            const outcome = event.value as Record<string,unknown>;
            if (outcome.runId === runId && (outcome.missing === "meal" || outcome.missing === "recipe" || outcome.missing === "conditions")) {
              if (proposal || reason) {failure=true;proposal=null;}
              else clarification=outcome.missing;
            } else failure=true;
          }
        },
        onRunFailed() {failure=true;proposal=null;},
      });
      if (!current()) return;
      if (!finished || failure) throw new Error("incomplete run");
      if (attemptedProposal && !proposal && !reason && !clarification) throw new Error("proposal tool did not return an outcome");
      if (proposal) {
        await onProposal(proposal,current);
        if (current()) {
          setStatus("提案已完成，請預覽後決定是否採用。");
          const shown=mode === "live" ? "已依確認條件產生未採用提案，使用合成展示資料。請核對預覽後決定是否採用。" : answer;
          if (shown) setMessages(value => [...value,{id:crypto.randomUUID(),role:"assistant",content:shown.slice(0,2000)}]);
        }
      } else {
        const outcome=clarification ? clarificationMessages[clarification] : reason ? planningFailure(reason) : "回覆已完成；尚無可採用提案。";
        setStatus(outcome);
        if (reason) setRetry(history.at(-1) ?? null);
        const shown=mode === "live" ? outcome : answer;
        if (shown) setMessages(value => [...value,{id:crypto.randomUUID(),role:"assistant",content:shown.slice(0,2000)}]);
      }
    } catch {
      if (current()) {
        setRetry(history.at(-1) ?? null);
        if (quotaDelay) {
          setQuotaUntil(Date.now()+quotaDelay);
          setStatus("AI 遇到額度或頻率限制，暫停新 AI 操作 60 秒；之後可重試檢查是否恢復。既有餐單與表單仍可使用，未切換模型。");
        } else setStatus("AI 未完成，未產生可採用結果。可重試，或使用餐單表單。");
        onInvalidate();
      }
    } finally {
      clearTimeout(timeout);
      if (active.current === run) {setRunning(false);onBusy(false);setPartial("");}
    }
  }

  function cancel() {
    if (!active.current) return;
    const cancelled = active.current;
    active.current=null;cancelled.cancelled=true;cancelled.agent.abortRun();
    setRunning(false);onBusy(false);onInvalidate();setPartial("");setStatus("已取消；晚到結果不會採用。");
  }

  return <section aria-label="備餐對話"><h2>備餐對話</h2>
    <label>模型模式<select value={mode} disabled={disabled || running} onChange={event => {
      const next = event.target.value === "live" ? "live" : "fixture";
      setMode(next);setMessages([]);setPartial("");setRetry(null);setQuotaUntil(null);onInvalidate();
      setStatus("已切換模式，尚未傳送訊息。");
    }}><option value="fixture">合成展示</option><option value="live" disabled={!liveAvailable}>真模型 · Cloudflare GLM-4.7-flash</option></select></label>
    <p>{mode === "fixture" ? "合成展示：只執行固定工具流程，不理解自由文字。請用餐單表單調整條件；不呼叫真模型。" : "真模型：訊息將傳送至 Cloudflare GLM-4.7-flash；失敗不自動切換展示模式。"}</p>
    <p>{mode === "live" ? "自由聊天會傳送至模型；" : "展示輸入不會傳送至真模型；"}身體問卷只在本機計算。對話不會隨餐單保存。</p>
    <ol>{messages.map(message => <li key={message.id}>{message.role === "user" ? "你" : "助理"}：{message.content}</li>)}</ol>
    {partial && <p>{partial}</p>}
    <p role="status">{status}</p>
    <form onSubmit={event => {event.preventDefault();void send(draft);}}>
      <label>想如何安排餐點？<textarea maxLength={2000} value={draft} disabled={disabled || running || cooling} onChange={event => setDraft(event.target.value)} /></label>
      <button disabled={disabled || running || cooling || !draft.trim()}>傳送</button>
    </form>
    {running && <button onClick={cancel}>取消 AI 執行</button>}
    {retry && <button disabled={disabled || running || cooling} onClick={() => void send(retry.content,retry)}>重試 AI</button>}
  </section>;
}
