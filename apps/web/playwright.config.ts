import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: [["list"], ["junit", { outputFile: "../../.artifacts/playwright.xml" }]],
  use: { baseURL: "http://127.0.0.1:14317" },
  webServer: [{
    command: process.env.MEAL_TEST_WORKER === "1"
      ? "pnpm exec wrangler dev --config dist/server/wrangler.json --ip 127.0.0.1 --port 14317 --var MEAL_API_ORIGIN:http://127.0.0.1:14318"
      : "pnpm exec next dev --hostname 127.0.0.1 --port 14317",
    env: { MEAL_API_ORIGIN: "http://127.0.0.1:14318", NEXT_TELEMETRY_DISABLED: "1" },
    url: "http://127.0.0.1:14317",
    reuseExistingServer: false,
  }, {
    command: "uv run --project ../../backend --frozen uvicorn meal_prep.bootstrap.probe:create_synthetic_probe_app --factory --host 127.0.0.1 --port 14318",
    env: { PYDANTIC_AI_NO_BANNER: "1" },
    url: "http://127.0.0.1:14318/health",
    reuseExistingServer: false,
  }],
});
