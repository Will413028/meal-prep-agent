import { PersistenceError, type ProposalValidator } from "./http";
import { validateProposal } from "../../shared/api/validate";

export function pythonValidator(origin: string | undefined): ProposalValidator {
  return async (input, signal) => {
    if (!origin) throw new PersistenceError(503,"calculation_unavailable");
    const upstream = await fetch(new URL("/api/v1/proposals/validate", origin), {
      method:"POST", headers:{"content-type":"application/json",accept:"application/json"},
      body:JSON.stringify(input), redirect:"manual", cache:"no-store",
      signal:AbortSignal.any([signal,AbortSignal.timeout(10_000)]),
    });
    if (!upstream.ok) {
      await upstream.body?.cancel();
      throw new PersistenceError(upstream.status === 422 ? 422 : 503, upstream.status === 422 ? "invalid_proposal" : "calculation_unavailable");
    }
    return validateProposal(await upstream.json());
  };
}
