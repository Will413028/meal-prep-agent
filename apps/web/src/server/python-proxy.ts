import { boundedBody, RequestTooLarge } from "./request-limits";

type PythonRoute = "/api/v1/goals/validate" | "/diagnostics/agent" | "/api/v1/recipes" | "/api/v1/runtime";

export async function proxyPython(request: Request, path: PythonRoute) {
  const origin = process.env.MEAL_API_ORIGIN;
  if (!origin) return Response.json({ error: "api_unavailable" }, { status: 503 });
  try {
    const upstream = await fetch(new URL(path, origin), {
      method: (path === "/api/v1/recipes" || path === "/api/v1/runtime") ? "GET" : "POST",
      headers: { "content-type": "application/json", accept: path === "/diagnostics/agent" ? "text/event-stream" : "application/json" },
      body: (path === "/api/v1/recipes" || path === "/api/v1/runtime") ? undefined : await boundedBody(request),
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(path === "/diagnostics/agent" ? 60_000 : 10_000)]),
      cache: "no-store",
      redirect: "manual",
    });
    if (upstream.status >= 300 && upstream.status < 400) {
      await upstream.body?.cancel();
      return Response.json({ error: "api_unavailable" }, { status: 502 });
    }
    return new Response(upstream.body, {
      status: upstream.status,
      headers: { "content-type": path === "/diagnostics/agent" && upstream.ok ? "text/event-stream" : "application/json", "cache-control": "no-store" },
    });
  } catch (error) {
    if (error instanceof RequestTooLarge) return Response.json({error:"request_too_large"},{status:413,headers:{"cache-control":"no-store"}});
    return Response.json({ error: "api_unavailable" }, { status: 503 });
  }
}
