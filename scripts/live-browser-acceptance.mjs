// Opt-in deployed browser check. It uses synthetic goals and writes only summary data.
import { createRequire } from "node:module";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(resolve(root, "apps/web/package.json"));
const { chromium, expect } = require("@playwright/test");
const origin = process.env.MEAL_DEPLOYED_ORIGIN;
if (!origin || new URL(origin).protocol !== "https:") throw new Error("Set MEAL_DEPLOYED_ORIGIN to the HTTPS deployment.");
const trial = Number(process.argv[2]);
if (!Number.isInteger(trial) || trial < 1 || trial > 20) throw new Error("Pass an unused trial number from 1 to 20.");
const output = resolve(root, `.artifacts/t12-live-browser-${trial}.json`);
if (existsSync(output)) throw new Error("Trial artifact exists; choose another number.");

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  const started = Date.now();
  await page.goto(origin);
  await page.getByRole("button", { name: "載入合成目標" }).click();
  await page.getByRole("button", { name: "確認使用此目標" }).click();
  await page.getByLabel("開始日期").fill("2026-10-01");
  await page.getByRole("button", { name: "設定條件並開啟對話" }).click();
  const chat = page.getByRole("region", { name: "備餐對話" });
  const mode = chat.getByLabel("模型模式");
  await expect(mode.locator('option[value="live"]')).toBeEnabled();
  await mode.selectOption("live");
  await chat.getByLabel("想如何安排餐點？").fill("請依已確認的手動目標安排三天三餐。先查受控食譜，再產生尚未採用的餐單提案。");
  const responsePromise = page.waitForResponse(response => new URL(response.url()).pathname === "/api/agent", { timeout: 90_000 });
  await chat.getByRole("button", { name: "傳送", exact: true }).click();
  const response = await responsePromise;
  const preview = page.getByRole("region", { name: "餐單提案預覽" });
  await expect(preview).toBeVisible({ timeout: 90_000 });
  await expect(preview.getByRole("article")).toHaveCount(9);
  await expect(preview.getByRole("region", { name: /營養與餐點/ })).toHaveCount(3);
  await expect(chat.getByRole("status")).toContainText("提案已完成");
  await expect(page.getByRole("region", { name: "已採用餐單" })).toHaveCount(0);
  const sent = response.request().postDataJSON();
  if (response.status() !== 200 || sent?.forwardedProps?.mode !== "live") throw new Error("Deployed live request was not accepted.");
  const result = { status: response.status(), elapsedSeconds: Math.round((Date.now() - started) / 1000), mode: "live", preview: true, meals: 9, adopted: false };
  mkdirSync(resolve(root, ".artifacts"), { recursive: true });
  writeFileSync(output, JSON.stringify(result, null, 2) + "\n");
  process.stdout.write(JSON.stringify(result) + "\n");
} finally {
  await browser.close();
}
