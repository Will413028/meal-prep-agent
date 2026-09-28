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

export function PlanningChat({disabled,prepare,onProposal,onBusy,onInvalidate}: {
  disabled: boolean;
  prepare: (runId: string) => {planning: PreviewRequest;csrf: string};
  onProposal: (proposal: Proposal, current: () => boolean) => Promise<void>;
  onBusy: (busy: boolean) => void;
  onInvalidate: () => void;
}) {
  const [messages,setMessages] = useState<Message[]>([]);
  const [draft,setDraft] = useState("");
  const [status,setStatus] = useState("尚未傳送訊息。");
  const [running,setRunning] = useState(false);
  const [partial,setPartial] = useState("");
  const [retry,setRetry] = useState<string | null>(null);
  const active = useRef<ActiveRun | null>(null);
  useEffect(() => () => {if (active.current) {active.current.cancelled=true;active.current.agent.abortRun();active.current=null;}},[]);

  async function send(text: string) {
    if (!text.trim() || running || disabled) return;
    const runId = crypto.randomUUID();
    const {planning,csrf} = prepare(runId);
    const history = [...messages,{id:crypto.randomUUID(),role:"user" as const,content:text.trim()}].slice(-12);
    while (history.length > 1 && history.reduce((total,item) => total+[...item.content].length,0) > 8000) history.shift();
    const agent = new HttpAgent({url:"/api/agent",threadId:planning.context.planId,debug:false,
      headers:{"x-meal-client":"1","x-meal-csrf":csrf},initialMessages:history});
    const run = {agent,runId,cancelled:false};
    active.current?.agent.abortRun();active.current=run;
    setMessages(history);setDraft("");setPartial("");setRunning(true);setRetry(null);setStatus("AI 正在處理…");onInvalidate();onBusy(true);
    let proposal: Proposal | null = null;
    let finished = false;
    let failure = false;
    let reason: string | null = null;
    let answer = "";
    const current = () => active.current === run && !run.cancelled;
    const timeout = setTimeout(() => {run.agent.abortRun();},60_000);
    try {
      await agent.runAgent({runId,forwardedProps:{planning}}, {
        onEvent({event}) {
          if (!current()) return;
          if (event.type === "RUN_ERROR") {failure=true;proposal=null;}
          if (event.type === "RUN_FINISHED" && event.runId === runId) finished=true;
          if (event.type === "TEXT_MESSAGE_CONTENT") {answer+=event.delta;setPartial(answer);}
          if (event.type === "CUSTOM" && event.name === "proposal_ready") {
            try {
              if (!event.value || typeof event.value !== "object") throw new Error("invalid outcome");
              const outcome = event.value as Record<string,unknown>;
              const candidate = validateProposal(outcome.proposal);
              const context = planning.context;
              if (outcome.runId !== runId || candidate.runId !== runId || candidate.planId !== context.planId || candidate.sessionGeneration !== context.sessionGeneration || candidate.baseRevision !== context.baseRevision) throw new Error("stale proposal");
              proposal=candidate;
            } catch {failure=true;proposal=null;}
          }
          if (event.type === "CUSTOM" && event.name === "proposal_unavailable" && event.value && typeof event.value === "object") {
            const outcome = event.value as Record<string,unknown>;
            if (outcome.runId === runId && typeof outcome.reason === "string") reason=outcome.reason;
          }
        },
        onRunFailed() {failure=true;proposal=null;},
      });
      if (!current()) return;
      if (!finished || failure) throw new Error("incomplete run");
      if (answer) setMessages(value => [...value,{id:crypto.randomUUID(),role:"assistant",content:answer.slice(0,2000)}]);
      if (proposal) {await onProposal(proposal,current);if (current()) setStatus("提案已完成，請預覽後決定是否採用。");}
      else setStatus(reason ? planningFailure(reason) : "回覆已完成；尚無可採用提案。");
    } catch {
      if (current()) {setRetry(text);setStatus("AI 未完成，未產生可採用結果。可重試，或使用餐單表單。");onInvalidate();}
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
    <p>自由聊天會傳送至模型；身體問卷仍只在本機計算。對話不會隨餐單保存。</p>
    <ol>{messages.map(message => <li key={message.id}>{message.role === "user" ? "你" : "助理"}：{message.content}</li>)}</ol>
    {partial && <p>{partial}</p>}
    <p role="status">{status}</p>
    <form onSubmit={event => {event.preventDefault();void send(draft);}}>
      <label>想如何安排餐點？<textarea maxLength={2000} value={draft} disabled={disabled || running} onChange={event => setDraft(event.target.value)} /></label>
      <button disabled={disabled || running || !draft.trim()}>傳送</button>
    </form>
    {running && <button onClick={cancel}>取消 AI 執行</button>}
    {retry && <button disabled={disabled || running} onClick={() => void send(retry)}>重試 AI</button>}
  </section>;
}
