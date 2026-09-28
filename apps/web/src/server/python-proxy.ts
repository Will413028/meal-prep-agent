type PythonRoute = "/api/v1/goals/validate" | "/agent";

export async function proxyPython(request: Request, path: PythonRoute) {
  const origin = process.env.MEAL_API_ORIGIN;
  if (!origin) return Response.json({ error: "api_unavailable" }, { status: 503 });
  try {
    const upstream = await fetch(new URL(path, origin), {
      method: "POST",
      headers: { "content-type": "application/json", accept: path === "/agent" ? "text/event-stream" : "application/json" },
      body: await request.text(),
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(path === "/agent" ? 60_000 : 10_000)]),
      cache: "no-store",
      redirect: "manual",
    });
    if (upstream.status >= 300 && upstream.status < 400) {
      await upstream.body?.cancel();
      return Response.json({ error: "api_unavailable" }, { status: 502 });
    }
    return new Response(upstream.body, {
      status: upstream.status,
      headers: { "content-type": path === "/agent" && upstream.ok ? "text/event-stream" : "application/json", "cache-control": "no-store" },
    });
  } catch {
    return Response.json({ error: "api_unavailable" }, { status: 503 });
  }
}
