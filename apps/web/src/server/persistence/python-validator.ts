import { PersistenceError, type ProposalValidator, type ProposalBuilder, type AgentRunner } from "./http";

export function pythonValidator(origin: string | undefined, send: typeof fetch = (...args) => fetch(...args)): ProposalValidator {
  return (input, signal) => post(origin,"/api/v1/proposals/validate",input,signal,send);
}

export function pythonBuilder(origin: string | undefined, send: typeof fetch = (...args) => fetch(...args)): ProposalBuilder {
  return (input, signal) => post(origin,"/api/v1/proposals/build",input,signal,send);
}

async function post(origin: string | undefined, path: "/api/v1/proposals/validate" | "/api/v1/proposals/build", input: unknown, signal: AbortSignal, send: typeof fetch): Promise<unknown> {
    if (!origin) throw new PersistenceError(503,"calculation_unavailable");
    const upstream = await send(new URL(path, origin), {
      method:"POST", headers:{"content-type":"application/json",accept:"application/json"},
      body:JSON.stringify(input), redirect:"manual", cache:"no-store",
      signal:AbortSignal.any([signal,AbortSignal.timeout(10_000)]),
    });
    if (!upstream.ok) {
      await upstream.body?.cancel();
      throw new PersistenceError(upstream.status === 422 ? 422 : 503, upstream.status === 422 ? "invalid_proposal" : "calculation_unavailable");
    }
    return upstream.json();
}

export function pythonAgent(origin: string | undefined, send: typeof fetch = (...args) => fetch(...args)): AgentRunner {
  return async (input,signal) => {
    if (!origin) throw new PersistenceError(503,"model_unavailable");
    return send(new URL("/agent",origin),{
      method:"POST",headers:{"content-type":"application/json",accept:"text/event-stream"},
      body:JSON.stringify(input),redirect:"manual",cache:"no-store",
      signal:AbortSignal.any([signal,AbortSignal.timeout(60_000)]),
    });
  };
}
