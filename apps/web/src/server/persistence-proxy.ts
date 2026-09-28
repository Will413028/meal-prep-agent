import { cookieToken } from "./session-identity";
import type { WebService } from "./web-proxy";

export async function proxyPersistence(request: Request, service?: WebService, origin?: string): Promise<Response> {
  if (!service && !origin) return unavailable();
  const source = new URL(request.url);
  const target = new URL(service ? "http://meal-web.internal" : origin!);
  target.pathname = source.pathname;
  if (source.pathname === "/api/plan" && request.method === "GET") {
    const planId = source.searchParams.get("planId");
    if (planId) target.searchParams.set("planId",planId);
  }
  const headers = new Headers();
  for (const name of ["origin","content-type","x-meal-client","x-meal-csrf"]) {
    const value = request.headers.get(name);
    if (value !== null) headers.set(name,value);
  }
  const token = cookieToken(request);
  if (token && /^[a-f0-9]{64}$/.test(token)) headers.set("cookie",`__Host-meal_session=${token}`);
  headers.set("x-forwarded-host",source.host);
  headers.set("x-forwarded-proto",source.protocol.slice(0,-1));
  try {
    const forwarded = new Request(target,{method:request.method,headers,
      body:request.method === "GET" ? undefined : request.body,
      redirect:"manual",signal:AbortSignal.any([request.signal,AbortSignal.timeout(source.pathname === "/api/agent" ? 75_000 : 20_000)]),
      duplex:"half"} as RequestInit);
    const upstream = await (service ? service.fetch(forwarded) : fetch(forwarded));
    if (upstream.status >= 300 && upstream.status < 400) {await upstream.body?.cancel();return unavailable();}
    const responseHeaders = new Headers({"cache-control":"no-store",vary:"Cookie"});
    for (const name of ["content-type","set-cookie","retry-after"]) {
      const value = upstream.headers.get(name);
      if (value !== null) responseHeaders.set(name,value);
    }
    return new Response(upstream.body,{status:upstream.status,headers:responseHeaders});
  } catch { return unavailable(); }
}

function unavailable(): Response {
  return Response.json({error:"storage_unavailable"},{status:503,headers:{"cache-control":"no-store",vary:"Cookie"}});
}
