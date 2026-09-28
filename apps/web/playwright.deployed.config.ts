import { defineConfig } from "@playwright/test";

const origin = process.env.MEAL_DEPLOYED_ORIGIN;
if (!origin || new URL(origin).protocol !== "https:") throw new Error("Set MEAL_DEPLOYED_ORIGIN to the deployment HTTPS origin.");

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: ["planner.spec.ts", "persistence.spec.ts"],
  workers: 1,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [["list"], ["junit", { outputFile: "../../.artifacts/deployed-playwright.xml" }]],
  use: { baseURL: origin },
});
