import app from "vinext/server/fetch-handler";
import type { D1Database } from "@cloudflare/workers-types";
import { sessionHttp } from "./server/persistence/http";
import { expireSessions } from "./server/persistence/sessions";
import { pythonAgent, pythonBuilder, pythonValidator } from "./server/persistence/python-validator";

type Environment = { DB: D1Database; MEAL_API_ORIGIN?: string };

export default {
  async fetch(request: Request, env: Environment): Promise<Response> {
    const path = new URL(request.url).pathname;
    if (["/api/session","/api/plan","/api/plan/actions","/api/plan/preview","/api/agent"].includes(path)) {
      return sessionHttp(request,env.DB,Date.now,pythonValidator(env.MEAL_API_ORIGIN),pythonBuilder(env.MEAL_API_ORIGIN),pythonAgent(env.MEAL_API_ORIGIN));
    }
    return app.fetch(request);
  },
  async scheduled(_event: unknown, env: Environment): Promise<void> {
    await expireSessions(env.DB,Date.now());
  },
};
