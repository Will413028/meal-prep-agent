import { validateSession, type PlanActionRequest, type SessionState, type PreviewRequest } from "./persistence";
import { validateBuildResult } from "./validate";

export class PlanRepositoryError extends Error {
  constructor(public status: number, public code: string) { super(code); }
}

export class PlanRepository {
  constructor(private fetcher: typeof fetch = (...args) => fetch(...args)) {}
  private async request(path: string, method = "GET", body?: unknown, csrf?: string): Promise<Response> {
    return this.fetcher(path,{method,credentials:"same-origin",cache:"no-store",
      headers:{"content-type":"application/json","x-meal-client":"1",...(csrf ? {"x-meal-csrf":csrf} : {})},
      ...(body === undefined ? {} : {body:JSON.stringify(body)})});
  }
  private async state(response: Response): Promise<SessionState> {
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      throw new PlanRepositoryError(response.status,body?.error === "unsupported_state" ? "unsupported_state" : "save_rejected");
    }
    try { return validateSession(await response.json()); }
    catch { throw new PlanRepositoryError(502,"invalid_response"); }
  }
  async read(): Promise<SessionState | null> {
    const response = await this.request("/api/plan");
    return response.status === 404 ? null : this.state(response);
  }
  async initialize(): Promise<SessionState> {
    return this.state(await this.request("/api/session","POST",{schemaVersion:1}));
  }
  async preview(body: PreviewRequest, csrf: string) {
    const response = await this.request("/api/plan/preview","POST",body,csrf);
    if (!response.ok) throw new PlanRepositoryError(response.status,"preview_rejected");
    return validateBuildResult(await response.json());
  }
  async clear(csrf: string): Promise<void> {
    try {
      const response = await this.request("/api/session","DELETE",{schemaVersion:1},csrf);
      if (response.ok && (await response.json())?.cleared === true) return;
      if (response.status >= 400 && response.status < 500 && response.status !== 404) throw new PlanRepositoryError(response.status,"clear_rejected");
    } catch (error) {
      if (error instanceof PlanRepositoryError) throw error;
    }
    try { if (await this.read() === null) return; } catch { /* Absence must be confirmed. */ }
    throw new PlanRepositoryError(503,"clear_unconfirmed");
  }
  async apply(action: PlanActionRequest, csrf: string): Promise<SessionState> {
    try {
      const response = await this.request("/api/plan/actions","POST",action,csrf);
      if (response.status < 500) return await this.state(response);
    } catch (error) {
      if (error instanceof PlanRepositoryError && error.status < 500) throw error;
    }
    // A dropped response may follow a committed write. Confirm once, never
    // resend automatically or treat a later revision as this operation's result.
    const recovered = await this.read().catch(() => null);
    if (recovered?.planId === action.planId && recovered.sessionGeneration === action.sessionGeneration
      && recovered.revision === action.baseRevision+1 && recovered.lastOperationId === action.operationId) return recovered;
    throw new PlanRepositoryError(503,"save_unconfirmed");
  }
}
