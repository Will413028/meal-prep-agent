import type { RateLimit } from "@cloudflare/workers-types";
import { cookieToken, hash } from "./session-identity";

export type RateLimitBindings = {
  API_RATE_LIMITER?: RateLimit;
  SESSION_RATE_LIMITER?: RateLimit;
  AI_RATE_LIMITER?: RateLimit;
};

export async function limitPublicApi(request: Request, env: RateLimitBindings): Promise<Response | null> {
  const path = new URL(request.url).pathname;
  if (!path.startsWith("/api/")) return null;
  const unavailable = () => Response.json({error:"rate_limit_unavailable"},{status:503,headers:{"cache-control":"no-store"}});
  const rejected = () => Response.json({error:"rate_limited"},{status:429,headers:{"cache-control":"no-store","retry-after":"60"}});
  try {
    if (!env.API_RATE_LIMITER) return unavailable();
    const ip = await hash(`meal-prep:ip:${request.headers.get("cf-connecting-ip") ?? "local"}`);
    if (!(await env.API_RATE_LIMITER.limit({key:ip})).success) return rejected();
    if (request.method === "POST" && path === "/api/session") {
      if (!env.SESSION_RATE_LIMITER) return unavailable();
      if (!(await env.SESSION_RATE_LIMITER.limit({key:ip})).success) return rejected();
    }
    if (request.method === "POST" && path === "/api/agent") {
      if (!env.AI_RATE_LIMITER) return unavailable();
      const token = cookieToken(request);
      const key = token ? await hash(`meal-prep:ai:${token}`) : ip;
      if (!(await env.AI_RATE_LIMITER.limit({key})).success) return rejected();
    }
    return null;
  } catch {return unavailable();}
}
