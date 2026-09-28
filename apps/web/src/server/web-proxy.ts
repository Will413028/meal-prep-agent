export type WebService = {fetch(request: Request): Promise<Response>};

export async function proxyWeb(request: Request, service?: WebService, origin?: string): Promise<Response> {
  if (!["GET","HEAD"].includes(request.method)) return new Response(null,{status:405,headers:{allow:"GET, HEAD"}});
  if (!service && !origin) return unavailable();
  const url = new URL(request.url);
  const target = new URL(service ? "http://meal-web.internal" : origin!);
  target.pathname=url.pathname;target.search=url.search;
  const headers=new Headers(request.headers);
  for(const name of ["cookie","authorization","forwarded","x-forwarded-for","connection","upgrade","transfer-encoding"]) headers.delete(name);
  headers.set("x-forwarded-host",url.host);
  headers.set("x-forwarded-proto",url.protocol.slice(0,-1));
  const forwarded=new Request(target,{method:request.method,headers,redirect:"manual",signal:AbortSignal.any([request.signal,AbortSignal.timeout(30_000)])});
  try { return await (service ? service.fetch(forwarded) : fetch(forwarded)); }
  catch { return unavailable(); }
}

function unavailable():Response {
  return Response.json({error:"web_unavailable"},{status:503,headers:{"cache-control":"no-store"}});
}
