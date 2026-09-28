import { expect, test } from "@playwright/test";

test("visitors see that this is synthetic demonstration data", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Meal Prep Agent" })).toBeVisible();
  await expect(page.getByText("合成資料展示", { exact: true })).toBeVisible();
});

test("manual goal requires explicit confirmation and a new draft preserves it", async ({ page }) => {
  await page.route("**/api/v1/goals/validate", async (route) => {
    const input = route.request().postDataJSON();
    await route.fulfill({ json: { schemaVersion: 1, policyVersion: "nutrition-v1", requested: { ...input, schemaVersion: undefined, carbs: null, fat: null }, ranges: { kcal: { min: input.kcal * 0.95, max: input.kcal * 1.05 }, protein: { min: input.protein, max: input.protein * 1.1 }, carbs: null, fat: null } } });
  });
  await page.goto("/");
  await page.getByLabel("每日熱量（kcal）").fill("2000");
  await page.getByLabel("每日蛋白質（g）").fill("100");
  await page.getByRole("button", { name: "檢查目標" }).click();
  await expect(page.getByTestId("confirmed-goal")).toHaveCount(0);
  await page.getByRole("button", { name: "確認使用此目標" }).click();
  await expect(page.getByTestId("confirmed-goal")).toContainText("2000 kcal");
  await page.getByLabel("每日熱量（kcal）").fill("2200");
  await page.getByRole("button", { name: "檢查目標" }).click();
  await expect(page.getByTestId("confirmed-goal")).toContainText("2000 kcal");
});

test("guided estimation keeps the body questionnaire out of API payloads and storage", async ({ page }) => {
  const payloads: unknown[] = [];
  await page.route("**/api/v1/goals/validate", async (route) => {
    const input = route.request().postDataJSON();
    payloads.push(input);
    await route.fulfill({ json: { schemaVersion: 1, policyVersion: "nutrition-v1", requested: { kcal: input.kcal, protein: input.protein, carbs: null, fat: null }, ranges: { kcal: { min: 2394, max: 2646 }, protein: { min: 56, max: 61.6 }, carbs: null, fat: null } } });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "幫我設定目標" }).click();
  await page.getByLabel("年齡（歲）").fill("30");
  await page.getByLabel("身高（cm）").fill("170");
  await page.getByLabel("體重（kg）").fill("70");
  await page.getByLabel("公式分類").selectOption("male");
  await page.getByLabel("活動分級").selectOption("inactive");
  await page.getByLabel("飲食目標").selectOption("maintain");
  await page.getByLabel("規律訓練").selectOption("false");
  await page.getByLabel("孕期或哺乳期").selectOption("false");
  await page.getByLabel("需要專業調整飲食").selectOption("false");
  await page.getByRole("button", { name: "在本機估算" }).click();
  await expect(page.getByRole("button", { name: "確認使用此目標" })).toBeVisible();
  expect(payloads).toEqual([{ schemaVersion: 1, kcal: 2520, protein: 56 }]);
  expect(await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length }))).toEqual({ local: 0, session: 0 });
  await expect(page.getByTestId("confirmed-goal")).toHaveCount(0);
  await page.reload();
  await page.getByRole("button", { name: "幫我設定目標" }).click();
  await expect(page.getByLabel("年齡（歲）")).toHaveValue("");
});

test("manual goal reaches the real Python validator through the Web route", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("每日熱量（kcal）").fill("2000");
  await page.getByLabel("每日蛋白質（g）").fill("100");
  await page.getByRole("button", { name: "檢查目標" }).click();
  await expect(page.getByRole("button", { name: "確認使用此目標" })).toBeVisible();
  await page.getByRole("button", { name: "確認使用此目標" }).click();
  await expect(page.getByTestId("confirmed-goal")).toContainText("2000 kcal");
});

test("browser receives official AG-UI SSE through the fixed proxy", async ({ page }) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const response = await fetch("/api/agent", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
      threadId: "synthetic-thread", runId: "browser-run", state: {}, tools: [], context: [], forwardedProps: {},
      messages: [{ id: "message-1", role: "user", content: "Run synthetic transport probe." }],
    }) });
    return { status: response.status, type: response.headers.get("content-type"), text: await response.text() };
  });
  expect(result.status).toBe(200);
  expect(result.type).toContain("text/event-stream");
  const events = result.text.split("\n").filter(line => line.startsWith("data: ")).map(line => JSON.parse(line.slice(6)));
  expect(events.some(event => event.type === "TOOL_CALL_RESULT")).toBe(true);
  expect(events.find(event => event.name === "proposal_ready")?.value).toEqual({ runId: "browser-run", synthetic: true, adoptable: false });
  expect(events.at(-1)?.type).toBe("RUN_FINISHED");
});
