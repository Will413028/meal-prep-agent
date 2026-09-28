export type RunState = { runId: string; status: "running" | "finished" | "cancelled" | "failed"; ready: boolean; adoptable: boolean };
export function startRun(runId: string): RunState { return { runId, status: "running", ready: false, adoptable: false }; }
export function stopRun(state: RunState, status: "cancelled" | "failed"): RunState { return { ...state, status, ready: false, adoptable: false }; }
export function receiveEvent(state: RunState, runId: string, event: unknown): RunState {
  if (state.runId !== runId || state.status !== "running" || !event || typeof event !== "object") return state;
  const value = event as Record<string, unknown>;
  if (value.type === "RUN_ERROR") return stopRun(state, "failed");
  if (value.type === "RUN_FINISHED" && value.runId === runId) return { ...state, status: "finished" };
  if (value.type === "CUSTOM" && value.name === "proposal_ready" && value.value && typeof value.value === "object") {
    const outcome = value.value as Record<string, unknown>;
    if (outcome.runId === runId && outcome.synthetic === true && outcome.adoptable === false) return { ...state, ready: true };
  }
  return state;
}
