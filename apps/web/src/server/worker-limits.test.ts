import { beforeEach, expect, test, vi } from "vitest";
import type { D1Database } from "@cloudflare/workers-types";

const handlers = vi.hoisted(() => ({app:vi.fn(),session:vi.fn()}));
vi.mock("vinext/server/fetch-handler",()=>({default:{fetch:handlers.app}}));
vi.mock("./persistence/http",async importOriginal=>({...await importOriginal<typeof import("./persistence/http")>(),sessionHttp:handlers.session}));
import worker from "../worker";

beforeEach(()=>{handlers.app.mockReset().mockResolvedValue(new Response("web"));handlers.session.mockReset().mockResolvedValue(new Response("session"));});
function environment() {
  return {DB:{} as D1Database,API_RATE_LIMITER:{limit:vi.fn().mockResolvedValue({success:true})},SESSION_RATE_LIMITER:{limit:vi.fn().mockResolvedValue({success:true})},AI_RATE_LIMITER:{limit:vi.fn().mockResolvedValue({success:true})}};
}
const request = (path:string,cookie="a".repeat(64)) => new Request(`https://meal.test${path}`,{method:path==="/api/plan" ? "GET":"POST",headers:{"cf-connecting-ip":"192.0.2.1",cookie:`__Host-meal_session=${cookie}`}});

test("rate-limited AI stops before domain or provider while saved-plan reads still work",async()=>{
  const env=environment();env.AI_RATE_LIMITER.limit.mockResolvedValue({success:false});
  const blocked=await worker.fetch(request("/api/agent"),env);
  expect(blocked.status).toBe(429);
  expect(blocked.headers.get("retry-after")).toBe("60");
  expect(handlers.session).not.toHaveBeenCalled();
  expect((await worker.fetch(request("/api/plan"),env)).status).toBe(200);
});

test("session creation and general API have independent limits and no raw identifiers in keys",async()=>{
  const env=environment();
  expect((await worker.fetch(request("/api/agent"),env)).status).toBe(200);
  expect(env.AI_RATE_LIMITER.limit).toHaveBeenCalledTimes(1);
  const first=env.AI_RATE_LIMITER.limit.mock.calls[0][0].key;
  await worker.fetch(request("/api/agent","b".repeat(64)),env);
  expect(env.AI_RATE_LIMITER.limit.mock.calls[1][0].key).not.toBe(first);
  expect(first).not.toContain("a".repeat(64));
  expect(JSON.stringify(env.API_RATE_LIMITER.limit.mock.calls)).not.toContain("192.0.2.1");
  env.SESSION_RATE_LIMITER.limit.mockResolvedValue({success:false});
  expect((await worker.fetch(request("/api/session"),env)).status).toBe(429);
  env.API_RATE_LIMITER.limit.mockResolvedValue({success:false});
  expect((await worker.fetch(request("/api/v1/recipes"),env)).status).toBe(429);
  expect((await worker.fetch(new Request("https://meal.test/"),env)).status).toBe(200);
});

test("missing or failed limiter fails closed for API without disabling the page",async()=>{
  expect((await worker.fetch(request("/api/agent"),{DB:{} as D1Database})).status).toBe(503);
  const env=environment();env.API_RATE_LIMITER.limit.mockRejectedValue(new Error("private binding failure"));
  const response=await worker.fetch(request("/api/agent"),env);
  expect(response.status).toBe(503);
  expect(await response.text()).not.toContain("private");
});
