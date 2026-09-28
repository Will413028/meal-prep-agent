import { PersistenceError, type ProposalValidator, type ProposalBuilder, type AgentRunner } from "./http";
import { validateBuildResult, validateProposal } from "../../shared/api/validate";

export function pythonValidator(origin: string | undefined): ProposalValidator {
  return async (input, signal) => validateProposal(await post(origin,"/api/v1/proposals/validate",input,signal));
}

export function pythonBuilder(origin: string | undefined): ProposalBuilder {
  return async (input, signal) => validateBuildResult(await post(origin,"/api/v1/proposals/build",input,signal));
}

async function post(origin: string | undefined, path: "/api/v1/proposals/validate" | "/api/v1/proposals/build", input: unknown, signal: AbortSignal): Promise<unknown> {
    if (!origin) throw new PersistenceError(503,"calculation_unavailable");
    const upstream = await fetch(new URL(path, origin), {
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

export function pythonAgent(origin: string | undefined): AgentRunner {
  return async (input,signal) => {
    if (!origin) throw new PersistenceError(503,"model_unavailable");
    return fetch(new URL("/agent",origin),{
      method:"POST",headers:{"content-type":"application/json",accept:"text/event-stream"},
      body:JSON.stringify(input),redirect:"manual",cache:"no-store",
      signal:AbortSignal.any([signal,AbortSignal.timeout(60_000)]),
    });
  };
}
