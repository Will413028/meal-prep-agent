import { expect, test } from "vitest";
import { startRun, stopRun, receiveEvent } from "./run-state";

const ready = { type: "CUSTOM", name: "proposal_ready", value: { runId: "a", synthetic: true, adoptable: false } };
test("RUN_FINISHED alone never declares a proposal ready", () => {
  expect(receiveEvent(startRun("a"), "a", { type: "RUN_FINISHED", runId: "a" })).toMatchObject({ ready: false, adoptable: false });
});
test("outcome waits for successful finish and synthetic probe is never adoptable", () => {
  const pending = receiveEvent(startRun("a"), "a", ready);
  expect(pending).toMatchObject({ status: "running", ready: true, adoptable: false });
  expect(receiveEvent(pending, "a", { type: "RUN_FINISHED", runId: "a" })).toMatchObject({ status: "finished", ready: true, adoptable: false });
});
test.each(["cancelled", "failed"] as const)("%s cannot be revived by late outcome or finish", (status) => {
  const stopped = stopRun(startRun("a"), status);
  expect(receiveEvent(stopped, "a", ready)).toEqual(stopped);
  expect(receiveEvent(stopped, "a", { type: "RUN_FINISHED", runId: "a" })).toEqual(stopped);
});
test("events from an old transport or mismatched outcome cannot affect the active run", () => {
  const current = startRun("b");
  expect(receiveEvent(current, "a", ready)).toEqual(current);
  expect(receiveEvent(current, "b", ready)).toEqual(current);
});
test("stream error discards any pending outcome", () => {
  const pending = receiveEvent(startRun("a"), "a", ready);
  expect(receiveEvent(pending, "a", { type: "RUN_ERROR" })).toMatchObject({ status: "failed", ready: false, adoptable: false });
});
