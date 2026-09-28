"use client";

import { useEffect, useRef, useState } from "react";
import { HttpAgent } from "@ag-ui/client";
import { receiveEvent, startRun, stopRun, type RunState } from "./run-state";

export function TransportProbe() {
  const active = useRef<{ state: RunState; agent: HttpAgent } | null>(null);
  const [state, setState] = useState<RunState | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setReady(true);
    return () => { active.current?.agent.abortRun(); active.current = null; };
  }, []);

  async function start() {
    active.current?.agent.abortRun();
    const run = { state: startRun(crypto.randomUUID()), agent: new HttpAgent({ url: "/api/agent", threadId: crypto.randomUUID(), debug: false, initialMessages: [{ id: crypto.randomUUID(), role: "user", content: "Run synthetic transport probe." }] }) };
    active.current = run;
    setState(run.state);
    const timeout = setTimeout(() => { run.agent.abortRun(); }, 60_000);
    try {
      await run.agent.runAgent({ runId: run.state.runId }, {
        onEvent({ event }) {
          if (active.current !== run) return;
          run.state = receiveEvent(run.state, run.state.runId, event);
          setState(run.state);
        },
        onRunFailed() {
          if (active.current !== run || run.state.status === "cancelled") return;
          run.state = stopRun(run.state, "failed");
          setState(run.state);
        },
      });
      if (run.state.status === "running") throw new Error("Missing terminal event");
    } catch {
      if (active.current === run) {
        run.state = stopRun(run.state, run.state.status === "cancelled" ? "cancelled" : "failed");
        setState(run.state);
      }
    } finally { clearTimeout(timeout); }
  }

  function cancel() {
    if (!active.current) return;
    active.current.state = stopRun(active.current.state, "cancelled");
    setState(active.current.state);
    active.current.agent.abortRun();
  }

  const message = !state ? "僅測試合成工具連線，不傳送身體問卷。" : state.status === "running" ? "工具執行中…" : state.status === "cancelled" ? "已取消，本次結果不會採用。" : state.status === "finished" && state.ready ? "合成工具往返完成；這不是可採用餐單。" : "未取得完整工具結果，請重試。";
  return <section aria-label="合成 Agent 連線測試">
    <button disabled={!ready} onClick={() => { void start(); }}>測試 Agent 連線</button>
    <button onClick={cancel} disabled={state?.status !== "running"}>取消本次執行</button>
    <p role="status" data-testid="probe-status">{message}</p>
  </section>;
}
