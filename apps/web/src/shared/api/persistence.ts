import type { paths } from "./schema";
import sessionResponse from "./SessionState-validator.js";
import actionRequest from "./PlanActionRequest-validator.js";
import sessionInit from "./SessionInit-validator.js";
import agentRunRequest from "./AgentRunRequest-validator.js";
import previewRequest from "./PreviewRequest-validator.js";

export type SessionState = paths["/api/plan"]["get"]["responses"][200]["content"]["application/json"];
export type PlanActionRequest = paths["/api/plan/actions"]["post"]["requestBody"]["content"]["application/json"];
export type PreviewRequest = paths["/api/plan/preview"]["post"]["requestBody"]["content"]["application/json"];

export function validatePreviewRequest(value: unknown): PreviewRequest {
  if (!previewRequest(value)) throw new Error("Invalid preview contract");
  return value as PreviewRequest;
}

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

export type AgentRunRequest = paths["/api/agent"]["post"]["requestBody"]["content"]["application/json"];
export function validateAgentRun(value: unknown): AgentRunRequest {
  if (!agentRunRequest(value)) throw new Error("Invalid Agent run contract");
  return value as AgentRunRequest;
}
