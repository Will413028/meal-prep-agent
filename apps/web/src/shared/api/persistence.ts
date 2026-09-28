import type { paths } from "./schema";
import sessionResponse from "./SessionState-validator.js";
import actionRequest from "./PlanActionRequest-validator.js";
import sessionInit from "./SessionInit-validator.js";

export type SessionState = paths["/api/plan"]["get"]["responses"][200]["content"]["application/json"];
export type PlanActionRequest = paths["/api/plan/actions"]["post"]["requestBody"]["content"]["application/json"];

export function validateSession(value: unknown): SessionState {
  if (!sessionResponse(value)) throw new Error("Invalid session contract");
  return value as SessionState;
}
export function validateAction(value: unknown): PlanActionRequest {
  if (!actionRequest(value)) throw new Error("Invalid action contract");
  return value as PlanActionRequest;
}
export function validateSessionInit(value: unknown): void {
  if (!sessionInit(value)) throw new Error("Invalid session initialization contract");
}
