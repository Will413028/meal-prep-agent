import { beforeEach, expect, test, vi } from "vitest";
import type { D1Database } from "@cloudflare/workers-types";

const handlers = vi.hoisted(() => ({app:vi.fn(),session:vi.fn()}));
vi.mock("./persistence/http",async importOriginal=>({...await importOriginal<typeof import("./persistence/http")>(),sessionHttp:handlers.session}));
import worker from "../worker";

beforeEach(()=>{handlers.app.mockReset().mockResolvedValue(new Response("web"));handlers.session.mockReset().mockResolvedValue(new Response("session"));});
function environment() {
  return {MEAL_WEB:{fetch:handlers.app},DB:{} as D1Database,API_RATE_LIMITER:{limit:vi.fn().mockResolvedValue({success:true})},SESSION_RATE_LIMITER:{limit:vi.fn().mockResolvedValue({success:true})},AI_RATE_LIMITER:{limit:vi.fn().mockResolvedValue({success:true})}};
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


test("private Python binding handles fixed routes without forwarding identity or query",async()=>{
  const upstream=vi.fn(async(_request:Request)=>Response.json({liveAvailable:true}));
  const env={...environment(),MEAL_API:{fetch:upstream}};
  const response=await worker.fetch(new Request("https://meal.test/api/v1/runtime?upstream=https://evil.test",{headers:{cookie:"private-cookie",authorization:"private-token"}}),env);
  expect(await response.text()).toBe(JSON.stringify({liveAvailable:true}));
  expect(upstream).toHaveBeenCalledTimes(1);
  const sent=upstream.mock.calls[0][0] as Request;
  expect(sent.url).toBe("http://meal-api.internal/api/v1/runtime");
  expect(sent.headers.has("cookie")).toBe(false);
  expect(sent.headers.has("authorization")).toBe(false);
  expect(sent.redirect).toBe("manual");
  expect(handlers.app).not.toHaveBeenCalled();
});

test("private binding is used for the session-owned Agent and propagates cancellation",async()=>{
  const upstream=vi.fn(async(_request:Request)=>new Response("data: fixture\n\n",{headers:{"content-type":"text/event-stream"}}));
  const env={...environment(),MEAL_API:{fetch:upstream}};
  await worker.fetch(request("/api/agent"),env);
  const agent=handlers.session.mock.calls[0][5];
  const controller=new AbortController();
  const response=await agent({safe:"server-owned-context"},controller.signal).catch(()=>new Response(null,{status:503}));
  expect(response.status).toBe(200);
  const sent=upstream.mock.calls[0][0] as Request;
  expect(sent.url).toBe("http://meal-api.internal/agent");
  expect(await sent.json()).toEqual({safe:"server-owned-context"});
  expect(sent.headers.has("cookie")).toBe(false);
  controller.abort();
  expect(sent.signal.aborted).toBe(true);
});


test("Web uses its private service with public forwarding metadata and no anonymous identity",async()=>{
  const upstream=vi.fn(async(_request:Request)=>new Response("Oracle Web"));
  const env={...environment(),MEAL_WEB:{fetch:upstream}};
  const response=await worker.fetch(new Request("https://meal.test/?view=plan",{headers:{cookie:"private-cookie",authorization:"private-auth",forwarded:"host=evil.test","x-forwarded-host":"evil.test"}}),env);
  expect(await response.text()).toBe("Oracle Web");
  const sent=upstream.mock.calls[0][0];
  expect(sent.url).toBe("http://meal-web.internal/?view=plan");
  expect(sent.headers.get("x-forwarded-host")).toBe("meal.test");
  expect(sent.headers.get("x-forwarded-proto")).toBe("https");
  for(const header of ["cookie","authorization","forwarded"]) expect(sent.headers.has(header)).toBe(false);
  expect(sent.redirect).toBe("manual");
});

test("unknown API and Web POST cannot bypass Worker policy through the Node app",async()=>{
  const upstream=vi.fn(async(_request:Request)=>new Response("Oracle Web"));
  const env={...environment(),MEAL_WEB:{fetch:upstream}};
  expect((await worker.fetch(new Request("https://meal.test/api/unlisted"),env)).status).toBe(404);
  expect((await worker.fetch(new Request("https://meal.test/",{method:"POST",body:"untrusted action"}),env)).status).toBe(405);
  expect(upstream).not.toHaveBeenCalled();
});
