import { expect, test } from "@playwright/test";

test("probe waits for client hydration before accepting a click", async ({ page }) => {
  let release!: () => void;
  const scripts = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/*.js*", async route => { await scripts; await route.continue(); });
  await page.goto("/diagnostics/transport", { waitUntil: "commit" });
  const start = page.getByRole("button", { name: "測試 Agent 連線" });
  try {
    await expect(start).toBeVisible();
    await expect(start).toBeDisabled();
  } finally { release(); }
  await expect(start).toBeEnabled();
  await start.click();
  await expect(page.getByTestId("probe-status")).toHaveText("合成工具往返完成；這不是可採用餐單。");
});

test("browser abort closes a real incremental stream through the fixed proxy", async ({ page }) => {
  await page.goto("/diagnostics/transport");
  const evidence = await page.evaluate(async () => {
    const controller = new AbortController();
    const response = await fetch("/api/agent", { method: "POST", signal: controller.signal, headers: { "content-type": "application/json" }, body: JSON.stringify({ threadId: "disconnect", runId: "browser-disconnect", state: {}, tools: [], context: [], forwardedProps: {}, messages: [{ id: "m", role: "user", content: "probe" }] }) });
    const reader = response.body!.getReader();
    const first = await reader.read();
    const initial = new TextDecoder().decode(first.value);
    controller.abort();
    let aborted = false;
    try { await reader.read(); } catch (error) { aborted = error instanceof DOMException && error.name === "AbortError"; }
    reader.releaseLock();
    return { initial, aborted };
  });
  expect(evidence.initial).toContain("RUN_STARTED");
  expect(evidence.initial).not.toContain("proposal_ready");
  expect(evidence.aborted).toBe(true);
});

test("explicit synthetic outcome and successful finish are shown by the real consumer", async ({ page }) => {
  await page.goto("/diagnostics/transport");
  await expect(page.getByRole("button", { name: "測試 Agent 連線" })).toBeVisible();
  await page.getByRole("button", { name: "測試 Agent 連線" }).click();
  await expect(page.getByTestId("probe-status")).toHaveText("合成工具往返完成；這不是可採用餐單。");
});

test("bare finish never becomes a usable outcome", async ({ page }) => {
  await page.route("**/api/agent", async route => {
    const { runId, threadId } = route.request().postDataJSON();
    await route.fulfill({ contentType: "text/event-stream", body: [{ type: "RUN_STARTED", runId, threadId }, { type: "RUN_FINISHED", runId, threadId }].map(event => `data: ${JSON.stringify(event)}\n\n`).join("") });
  });
  await page.goto("/diagnostics/transport");
  await expect(page.getByRole("button", { name: "測試 Agent 連線" })).toBeVisible();
  await page.getByRole("button", { name: "測試 Agent 連線" }).click();
  await expect(page.getByTestId("probe-status")).toHaveText("未取得完整工具結果，請重試。");
});

test("cancelled browser run stays cancelled after a late response and can retry", async ({ page }) => {
  let release!: () => void;
  let observed!: () => void;
  const barrier = new Promise<void>(resolve => { release = resolve; });
  const requested = new Promise<void>(resolve => { observed = resolve; });
  let first = true;
  await page.route("**/api/agent", async route => {
    const { runId, threadId } = route.request().postDataJSON();
    if (first) { first = false; observed(); await barrier; }
    await route.fulfill({ contentType: "text/event-stream", body: [
      { type: "RUN_STARTED", runId, threadId },
      { type: "CUSTOM", name: "proposal_ready", value: { runId, synthetic: true, adoptable: false } },
      { type: "RUN_FINISHED", runId, threadId },
    ].map(event => `data: ${JSON.stringify(event)}\n\n`).join("") });
  });
  await page.goto("/diagnostics/transport");
  await page.getByRole("button", { name: "測試 Agent 連線" }).click();
  await requested;
  await page.getByRole("button", { name: "取消本次執行" }).click();
  release();
  await expect(page.getByTestId("probe-status")).toHaveText("已取消，本次結果不會採用。");
  await page.getByRole("button", { name: "測試 Agent 連線" }).click();
  await expect(page.getByTestId("probe-status")).toHaveText("合成工具往返完成；這不是可採用餐單。");
});
