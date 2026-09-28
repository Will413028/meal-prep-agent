import { HttpAgent } from "@ag-ui/client";
import { expect, test } from "vitest";

test("official client preserves arbitrary UTF-8 chunk boundaries of the adapter LF stream", async () => {
  const events = [
    { type: "RUN_STARTED", threadId: "t", runId: "r" },
    { type: "TEXT_MESSAGE_START", messageId: "m", role: "assistant" },
    { type: "TEXT_MESSAGE_CONTENT", messageId: "m", delta: "合成" },
    { type: "TEXT_MESSAGE_END", messageId: "m" },
    { type: "RUN_FINISHED", threadId: "t", runId: "r" },
  ];
  const bytes = new TextEncoder().encode(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join(""));
  const received: unknown[] = [];
  const agent = new HttpAgent({ url: "https://synthetic.invalid/agent", threadId: "t", fetch: async () => new Response(new ReadableStream({ start(controller) { for (const byte of bytes) controller.enqueue(Uint8Array.of(byte)); controller.close(); } }), { headers: { "content-type": "text/event-stream" } }) });
  await agent.runAgent({ runId: "r" }, { onEvent({ event }) { received.push(event); } });
  expect(received).toEqual(events);
  expect(agent.messages).toMatchObject([{ id: "m", content: "合成" }]);
});

test("official abort reaches the fetch signal and ends a pending request", async () => {
  let started!: () => void;
  let aborted = false;
  const observed = new Promise<void>(resolve => { started = resolve; });
  const agent = new HttpAgent({ url: "https://synthetic.invalid/agent", threadId: "t", fetch: async (_url, init) => new Response(new ReadableStream({ start(controller) {
    controller.enqueue(new TextEncoder().encode('data: {"type":"RUN_STARTED","threadId":"t","runId":"r"}\n\n'));
    init.signal!.addEventListener("abort", () => { aborted = true; controller.error(new DOMException("Aborted", "AbortError")); }, { once: true });
  } }), { headers: { "content-type": "text/event-stream" } }) });
  const run = agent.runAgent({ runId: "r" }, { onEvent() { started(); } }).catch(() => {});
  await observed;
  agent.abortRun();
  await run;
  expect(aborted).toBe(true);
});
