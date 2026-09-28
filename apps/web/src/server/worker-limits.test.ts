import { beforeEach, expect, test, vi } from "vitest";

const handlers = vi.hoisted(() => ({app:vi.fn()}));
import worker from "../worker";

beforeEach(()=>{handlers.app.mockReset().mockResolvedValue(new Response("web"));});
function environment() {
  return {MEAL_WEB:{fetch:handlers.app},API_RATE_LIMITER:{limit:vi.fn().mockResolvedValue({success:true})},SESSION_RATE_LIMITER:{limit:vi.fn().mockResolvedValue({success:true})},AI_RATE_LIMITER:{limit:vi.fn().mockResolvedValue({success:true})}};
}
const request = (path:string,cookie="a".repeat(64)) => new Request(`https://meal.test${path}`,{method:path==="/api/plan" ? "GET":"POST",headers:{"cf-connecting-ip":"192.0.2.1",cookie:`__Host-meal_session=${cookie}`}});

test("rate-limited AI stops before domain or provider while saved-plan reads still work",async()=>{
  const env=environment();env.AI_RATE_LIMITER.limit.mockResolvedValue({success:false});
  const blocked=await worker.fetch(request("/api/agent"),env);
  expect(blocked.status).toBe(429);
  expect(blocked.headers.get("retry-after")).toBe("60");
  expect(handlers.app).not.toHaveBeenCalled();
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
  expect((await worker.fetch(request("/api/agent"),{})).status).toBe(503);
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

test("session-owned Agent reaches private Web with its cookie and propagates cancellation",async()=>{
  const upstream=vi.fn(async(_request:Request)=>new Response("data: fixture\n\n",{headers:{"content-type":"text/event-stream"}}));
  const env={...environment(),MEAL_WEB:{fetch:upstream}};
  const controller=new AbortController();
  const response=await worker.fetch(new Request("https://meal.test/api/agent",{method:"POST",headers:{"cf-connecting-ip":"192.0.2.1",cookie:`__Host-meal_session=${"a".repeat(64)}`},body:'{"safe":"request"}',signal:controller.signal}),env);
  expect(response.status).toBe(200);
  const sent=upstream.mock.calls[0][0] as Request;
  expect(sent.url).toBe("http://meal-web.internal/api/agent");
  expect(await sent.json()).toEqual({safe:"request"});
  expect(sent.headers.get("cookie")).toBe(`__Host-meal_session=${"a".repeat(64)}`);
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

test("session routes reach only the private Web service with one scoped cookie and preserve Set-Cookie",async()=>{
  const upstream=vi.fn(async(_request:Request)=>new Response('{"ok":true}',{status:201,headers:{"content-type":"application/json","set-cookie":"__Host-meal_session=fresh; HttpOnly; Secure; Path=/","cache-control":"no-store"}}));
  const env={...environment(),MEAL_WEB:{fetch:upstream},MEAL_API:{fetch:vi.fn()}};
  const response=await worker.fetch(new Request("https://meal.test/api/session?upstream=https://evil.test",{method:"POST",headers:{
    "cf-connecting-ip":"192.0.2.1",origin:"https://meal.test","content-type":"application/json","x-meal-client":"1",
    cookie:"other=secret; __Host-meal_session="+"a".repeat(64),authorization:"private-auth","x-forwarded-host":"evil.test",
  },body:'{"schemaVersion":1}'}),env);
  expect(response.status).toBe(201);
  expect(response.headers.get("set-cookie")).toContain("__Host-meal_session=fresh");
  expect(upstream).toHaveBeenCalledTimes(1);
  const sent=upstream.mock.calls[0][0] as Request;
  expect(sent.url).toBe("http://meal-web.internal/api/session");
  expect(sent.headers.get("cookie")).toBe("__Host-meal_session="+"a".repeat(64));
  expect(sent.headers.get("origin")).toBe("https://meal.test");
  expect(sent.headers.get("x-forwarded-host")).toBe("meal.test");
  expect(sent.headers.has("authorization")).toBe(false);
  expect(sent.headers.has("cf-connecting-ip")).toBe(false);
  expect(env.MEAL_API.fetch).not.toHaveBeenCalled();
});

test("cutover pause rejects every persistence route before forwarding while pages remain readable",async()=>{
  const env={...environment(),MEAL_PERSISTENCE_PAUSED:"1"};
  for (const path of ["/api/session","/api/plan","/api/plan/actions","/api/plan/preview","/api/agent"]) {
    const response=await worker.fetch(request(path),env);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({error:"storage_unavailable"});
  }
  expect(handlers.app).not.toHaveBeenCalled();
  expect((await worker.fetch(new Request("https://meal.test/"),env)).status).toBe(200);
});

test("unsupported persistence methods never reach the private Web service",async()=>{
  const env=environment();
  for(const [path,method] of [["/api/plan","POST"],["/api/agent","GET"],["/api/plan/actions","DELETE"],["/api/session","PUT"]]) {
    const response=await worker.fetch(new Request(`https://meal.test${path}`,{method,headers:{"cf-connecting-ip":"192.0.2.1"}}),env);
    expect(response.status).toBe(405);
  }
  expect(handlers.app).not.toHaveBeenCalled();
});
