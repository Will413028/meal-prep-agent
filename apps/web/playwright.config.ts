import { defineConfig } from "@playwright/test";
import { mkdirSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

const dbDirectory=fileURLToPath(new URL("../../.artifacts/e2e/",import.meta.url));
mkdirSync(dbDirectory,{recursive:true});
const dbPath=`${dbDirectory}plan-${process.pid}.sqlite3`;
const candidate=new DatabaseSync(dbPath);
try {
  candidate.exec(readFileSync(new URL("../../deploy/migrations/0001_plan_sessions.sql",import.meta.url),"utf8"));
  candidate.exec("PRAGMA user_version=1");
} finally {candidate.close();}
const webEnvironment={NEXT_TELEMETRY_DISABLED:"1",MEAL_API_ORIGIN:"http://127.0.0.1:14318",
  MEAL_PUBLIC_ORIGIN:"http://127.0.0.1:14317",MEAL_DB_PATH:dbPath};

export default defineConfig({
  testDir: "./tests/e2e",
  testIgnore: process.env.MEAL_TEST_WORKER === "1" ? [] : ["**/persistence.spec.ts","**/planner.spec.ts","**/chat-faults.spec.ts"],
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  // These functional scenarios share one API with process-local admission.
  // Intentional admission contention is exercised by backend regression tests.
  workers: 1,
  reporter: [["list"], ["junit", { outputFile: "../../.artifacts/playwright.xml" }]],
  use: { baseURL: "http://127.0.0.1:14317" },
  webServer: [...(process.env.MEAL_TEST_WORKER === "1" ? [{
    command:"pnpm exec next build && cp -R .next/static .next/standalone/apps/web/.next/ && HOSTNAME=127.0.0.1 PORT=14319 node .next/standalone/apps/web/server.js",
    timeout:120_000,
    env:webEnvironment,
    url:"http://127.0.0.1:14319",reuseExistingServer:false,
  }] : []), {
    command: process.env.MEAL_TEST_WORKER === "1"
      ? "pnpm exec wrangler dev --config wrangler.jsonc --ip 127.0.0.1 --port 14317 --var MEAL_API_ORIGIN:http://127.0.0.1:14318 --var MEAL_WEB_ORIGIN:http://127.0.0.1:14319"
      : "pnpm exec next dev --hostname 127.0.0.1 --port 14317",
    env: webEnvironment,
    url: "http://127.0.0.1:14317",
    reuseExistingServer: false,
  }, {
    command: "uv run --project ../../backend --frozen uvicorn meal_prep.bootstrap.probe:create_synthetic_probe_app --factory --host 127.0.0.1 --port 14318",
    env: { PYDANTIC_AI_NO_BANNER: "1" },
    url: "http://127.0.0.1:14318/health",
    reuseExistingServer: false,
  }],
});
