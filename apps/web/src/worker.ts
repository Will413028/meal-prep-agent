import { limitPublicApi, type RateLimitBindings } from "./server/rate-limit";
import { proxyPython, type PythonRoute } from "./server/python-proxy";
import { proxyWeb, type WebService } from "./server/web-proxy";
import { proxyPersistence } from "./server/persistence-proxy";

type Environment = RateLimitBindings & { MEAL_API_ORIGIN?: string; MEAL_API?: {fetch(request:Request):Promise<Response>}; MEAL_WEB?: WebService; MEAL_WEB_ORIGIN?: string; MEAL_PERSISTENCE_PAUSED?: string };
const persistenceRoutes: Record<string,readonly string[]> = {
  "/api/session":["POST","DELETE"],
  "/api/plan":["GET"],
  "/api/plan/actions":["POST"],
  "/api/plan/preview":["POST"],
  "/api/agent":["POST"],
};

export default {
  async fetch(request: Request, env: Environment): Promise<Response> {
    const path = new URL(request.url).pathname;
    if (env.MEAL_PERSISTENCE_PAUSED === "1" && path in persistenceRoutes) return Response.json({error:"storage_unavailable"},{status:503,headers:{"cache-control":"no-store"}});
    const limited = await limitPublicApi(request,env);
    if (limited) return limited;
    const origin = env.MEAL_API ? "http://meal-api.internal" : env.MEAL_API_ORIGIN;
    const send: typeof fetch = env.MEAL_API
      ? (input,init) => env.MEAL_API!.fetch(new Request(input,init))
      : (...args) => fetch(...args);
    const routes: Record<string,{method:string;path:PythonRoute}> = {
      "/api/v1/goals/validate":{method:"POST",path:"/api/v1/goals/validate"},
      "/api/v1/recipes":{method:"GET",path:"/api/v1/recipes"},
      "/api/v1/runtime":{method:"GET",path:"/api/v1/runtime"},
      "/api/diagnostics/agent":{method:"POST",path:"/diagnostics/agent"},
    };
    const route=routes[path];
    if (route) {
      if (request.method !== route.method) return new Response(null,{status:405,headers:{allow:route.method,"cache-control":"no-store"}});
      if (!origin) return Response.json({error:"api_unavailable"},{status:503,headers:{"cache-control":"no-store"}});
      return proxyPython(request,route.path,origin,send);
    }
    if (path in persistenceRoutes) {
      const methods=persistenceRoutes[path];
      if (!methods.includes(request.method)) return new Response(null,{status:405,headers:{allow:methods.join(", "),"cache-control":"no-store"}});
      return proxyPersistence(request,env.MEAL_WEB,env.MEAL_WEB_ORIGIN);
    }
    if (path === "/api" || path.startsWith("/api/")) return Response.json({error:"not_found"},{status:404,headers:{"cache-control":"no-store"}});
    return proxyWeb(request,env.MEAL_WEB,env.MEAL_WEB_ORIGIN);
  },
};
