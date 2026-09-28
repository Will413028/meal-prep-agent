import { afterEach, expect, test, vi } from "vitest";
import { proxyPython } from "./python-proxy";

afterEach(() => {vi.unstubAllGlobals();vi.unstubAllEnvs();});

for (const extra of [0,1]) test(`proxy enforces 128 KiB boundary with ${extra} extra bytes`, async () => {
  vi.stubEnv("MEAL_API_ORIGIN","https://python.invalid");
  const upstream = vi.fn(async () => Response.json({ok:true}));
  vi.stubGlobal("fetch",upstream);
  const text = '{"schemaVersion":1,"kcal":2000,"protein":100}';
  const response = await proxyPython(new Request("https://meal.test/api/v1/goals/validate",{method:"POST",body:text.padEnd(128*1024+extra," ")}),"/api/v1/goals/validate");
  expect(response.status).toBe(extra ? 413 : 200);
  expect(upstream).toHaveBeenCalledTimes(extra ? 0 : 1);
});

test("chunked multibyte input stops reading at the byte limit without trusting content-length", async () => {
  vi.stubEnv("MEAL_API_ORIGIN","https://python.invalid");
  const upstream = vi.fn();vi.stubGlobal("fetch",upstream);
  let cancelled=false;
  const bytes = new TextEncoder().encode("餐".repeat(44000));
  const body = new ReadableStream({start(controller){controller.enqueue(bytes);},cancel(){cancelled=true;}});
  const request = new Request("https://meal.test/api/v1/goals/validate",{method:"POST",body,duplex:"half",headers:{"content-length":"2"}} as RequestInit);
  const responsePromise = proxyPython(request,"/api/v1/goals/validate");
  const result = await Promise.race([responsePromise,new Promise<null>(resolve=>setTimeout(()=>resolve(null),100))]);
  expect(result?.status).toBe(413);
  expect(cancelled).toBe(true);
  expect(upstream).not.toHaveBeenCalled();
});
