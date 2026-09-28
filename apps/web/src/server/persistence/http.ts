import { boundedBody, RequestTooLarge } from "../request-limits";
import type { D1Database } from "@cloudflare/workers-types";
import type { paths } from "../../shared/api/schema";
import { validateBuildResult, validateEvaluation, validateProposal } from "../../shared/api/validate";
import { validateAgentRun, type AgentRunRequest, validateAction, validateSession, validateSessionInit, validatePreviewRequest, type SessionState } from "../../shared/api/persistence";
import { commitSession, createSession, deleteSession, hash, readSession, type SessionRow } from "./sessions";
import { parseActionJson } from "./json";

export class PersistenceError extends Error {
  constructor(public status: number, public code: string) { super(code); }
}

export type ProposalInput = paths["/api/v1/proposals/validate"]["post"]["requestBody"]["content"]["application/json"];
export type ProposalOutput = paths["/api/v1/proposals/validate"]["post"]["responses"][200]["content"]["application/json"];
export type ProposalValidator = (input: ProposalInput, signal: AbortSignal) => Promise<unknown>;
export type BuildInput = paths["/api/v1/proposals/build"]["post"]["requestBody"]["content"]["application/json"];
export type BuildOutput = paths["/api/v1/proposals/build"]["post"]["responses"][200]["content"]["application/json"];
export type AgentInput = Omit<AgentRunRequest,"forwardedProps"> & {forwardedProps:{planning:BuildInput;mode?:"fixture" | "live"}};
export type AgentRunner = (input: AgentInput, signal: AbortSignal) => Promise<Response>;
export type ProposalBuilder = (input: BuildInput, signal: AbortSignal) => Promise<unknown>;

function normalized(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalized);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a],[b]) => a.localeCompare(b)).map(([key,entry]) => [key,normalized(entry)]));
  return value;
}

export function cookieToken(request: Request): string | null {
  const values = (request.headers.get("cookie") ?? "").split(";").map(value => value.trim()).filter(value => value.startsWith("__Host-meal_session="));
  return values.length === 1 ? values[0].slice("__Host-meal_session=".length) : null;
}

export function writeOrigin(request: Request): void {
  if (request.headers.get("origin") !== new URL(request.url).origin || request.headers.get("content-type")?.split(";")[0].trim() !== "application/json" || request.headers.get("x-meal-client") !== "1") {
    throw new PersistenceError(403, "invalid_origin");
  }
}

export async function csrf(token: string): Promise<string> {
  return hash("meal-prep:csrf:v1:" + token);
}

export async function checkCsrf(request: Request, token: string): Promise<void> {
  const expected = await csrf(token);
  const supplied = request.headers.get("x-meal-csrf") ?? "";
  let difference = supplied.length ^ expected.length;
  for (let index = 0; index < expected.length; index++) difference |= expected.charCodeAt(index) ^ (supplied.charCodeAt(index) || 0);
  if (difference !== 0) throw new PersistenceError(403,"invalid_csrf");
}

export async function stateFromRow(row: SessionRow, token: string): Promise<SessionState> {
  try {
    if (row.schemaVersion !== 1) throw new Error("version");
    const current: unknown = row.currentJson === null ? null : JSON.parse(row.currentJson);
    if (row.previousJson !== null) validateEvaluation(JSON.parse(row.previousJson));
    return validateSession({schemaVersion:1, sessionGeneration:row.sessionGeneration, planId:row.planId,
      revision:row.revision, expiresAt:new Date(row.expiresAt).toISOString(), csrfToken:await csrf(token),
      current, canUndo:row.previousJson !== null, lastOperationId:row.lastOperationId});
  } catch { throw new PersistenceError(409, "unsupported_state"); }
}

export function response(body: unknown, status = 200, cookie?: string): Response {
  const headers = new Headers({"cache-control":"no-store", vary:"Cookie"});
  if (cookie) headers.set("set-cookie",cookie);
  return Response.json(body,{status,headers});
}

export function sessionCookie(token: string, expiresAt: number, now: number): string {
  return `__Host-meal_session=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${Math.max(0, Math.floor((expiresAt-now)/1000))}; Expires=${new Date(expiresAt).toUTCString()}`;
}

export async function sessionHttp(request: Request, db: D1Database, clock: () => number = Date.now, validator?: ProposalValidator, builder?: ProposalBuilder, agent?: AgentRunner): Promise<Response> {
  try {
    const url = new URL(request.url);
    const bodyText = request.method === "POST" ? await boundedBody(request) : "";
    if (request.method === "POST" && url.pathname === "/api/agent") {
      writeOrigin(request);
      const token = cookieToken(request);
      if (!token) throw new PersistenceError(404,"not_found");
      await checkCsrf(request,token);
      let body;
      try { body = validateAgentRun(parseActionJson(bodyText)); }
      catch { throw new PersistenceError(400,"invalid_request"); }
      if (body.messages.at(-1)?.role !== "user" || body.messages.reduce((total,message) => total + [...message.content].length,0) > 8000) throw new PersistenceError(400,"invalid_request");
      const {schemaVersion: _version,...planning} = body.forwardedProps.planning;
      const context = planning.context;
      if (body.runId !== context.runId || body.threadId !== context.planId) throw new PersistenceError(400,"invalid_request");
      const row = await readSession(db,token,clock(),context.planId);
      if (!row) throw new PersistenceError(404,"not_found");
      if (row.revision !== context.baseRevision || row.sessionGeneration !== context.sessionGeneration) throw new PersistenceError(409,"revision_conflict");
      const state = await stateFromRow(row,token);
      if (!agent) throw new PersistenceError(503,"model_unavailable");
      let upstream;
      try { upstream = await agent({...body,forwardedProps:{...body.forwardedProps,planning:{...planning,base:state.current}}},request.signal); }
      catch { throw new PersistenceError(503,"model_unavailable"); }
      const headers = new Headers({"content-type":upstream.headers.get("content-type") ?? "application/json","cache-control":"no-store",vary:"Cookie"});
      return new Response(upstream.body,{status:upstream.status,headers});
    }
    if (request.method === "POST" && url.pathname === "/api/plan/preview") {
      writeOrigin(request);
      const token = cookieToken(request);
      if (!token) throw new PersistenceError(404,"not_found");
      await checkCsrf(request,token);
      let body;
      try { body = validatePreviewRequest(parseActionJson(bodyText)); }
      catch { throw new PersistenceError(400,"invalid_request"); }
      const row = await readSession(db,token,clock(),body.context.planId);
      if (!row) throw new PersistenceError(404,"not_found");
      if (row.revision !== body.context.baseRevision || row.sessionGeneration !== body.context.sessionGeneration) throw new PersistenceError(409,"revision_conflict");
      const state = await stateFromRow(row,token);
      if (!builder) throw new PersistenceError(503,"calculation_unavailable");
      const {schemaVersion: _version,...preferences} = body;
      let result;
      try { result = validateBuildResult(await builder({...preferences,base:state.current},request.signal)); }
      catch (error) { if (error instanceof PersistenceError) throw error; throw new PersistenceError(503,"calculation_unavailable"); }
      const latest = await readSession(db,token,clock(),row.planId);
      if (!latest || latest.revision !== row.revision || latest.sessionGeneration !== row.sessionGeneration || latest.schemaVersion !== row.schemaVersion) throw new PersistenceError(409,"revision_conflict");
      if (result.proposal && (result.proposal.planId !== row.planId || result.proposal.sessionGeneration !== row.sessionGeneration || result.proposal.baseRevision !== row.revision || result.proposal.runId !== body.context.runId)) throw new PersistenceError(502,"invalid_calculation_response");
      return response(result);
    }
    if (request.method === "POST" && url.pathname === "/api/session") {
      writeOrigin(request);
      try { validateSessionInit(parseActionJson(bodyText)); } catch { throw new PersistenceError(400,"invalid_request"); }
      const now = clock();
      const {token,row} = await createSession(db,now);
      return response(await stateFromRow(row,token),201,sessionCookie(token,row.expiresAt,now));
    }
    if (request.method === "GET" && url.pathname === "/api/plan") {
      const token = cookieToken(request);
      const row = await readSession(db,token,clock(),url.searchParams.get("planId") ?? undefined);
      if (!row || !token) throw new PersistenceError(404,"not_found");
      return response(await stateFromRow(row,token));
    }
    if (request.method === "DELETE" && url.pathname === "/api/session") {
      writeOrigin(request);
      const token = cookieToken(request);
      if (!token) throw new PersistenceError(404,"not_found");
      await checkCsrf(request,token);
      const row = await readSession(db,token,clock());
      if (!row || !await deleteSession(db,row,clock())) throw new PersistenceError(404,"not_found");
      return response({cleared:true},200,sessionCookie("",clock(),clock()));
    }
    if (request.method === "POST" && url.pathname === "/api/plan/actions") {
      writeOrigin(request);
      const token = cookieToken(request);
      if (!token) throw new PersistenceError(404,"not_found");
      await checkCsrf(request,token);
      let body;
      try { body = validateAction(parseActionJson(bodyText)); } catch { throw new PersistenceError(400,"invalid_request"); }
      const row = await readSession(db,token,clock(),body.planId);
      if (!row) throw new PersistenceError(404,"not_found");
      const current = await stateFromRow(row,token);
      if (row.sessionGeneration !== body.sessionGeneration) throw new PersistenceError(409,"stale_session");
      const operationHash = await hash(JSON.stringify(normalized(body)));
      if (row.lastOperationId === body.operationId) {
        if (row.lastOperationHash !== operationHash || row.revision !== body.baseRevision+1) throw new PersistenceError(409,"operation_conflict");
        return response(current,200,sessionCookie(token,row.expiresAt,clock()));
      }
      if (row.revision !== body.baseRevision) throw new PersistenceError(409,"revision_conflict");
      let next;
      let previousJson = row.currentJson;
      if (body.action.type === "checks") {
        if (!current.current) throw new PersistenceError(409,"no_current_plan");
        next = structuredClone(current.current);
        const collection = body.action.collection === "shopping" ? next.shopping.items : next.prep.steps;
        const action = body.action;
        const item = collection.find(item => item.id === action.id);
        if (!item) throw new PersistenceError(404,"not_found");
        item.checked = action.checked;
        if ("requiresReconfirmation" in item) item.requiresReconfirmation = false;
      } else if (body.action.type === "locks") {
        if (!current.current) throw new PersistenceError(409,"no_current_plan");
        next = structuredClone(current.current);
        const action = body.action;
        const meal = next.candidate.meals.find(meal => meal.day === action.day && meal.slot === action.slot);
        if (!meal) throw new PersistenceError(404,"not_found");
        meal.locked = action.locked;
      } else if (body.action.type === "undo") {
        if (row.previousJson === null) throw new PersistenceError(409,"nothing_to_undo");
        next = validateEvaluation(JSON.parse(row.previousJson));
        previousJson = null;
      } else if (body.action.type === "adopt" || body.action.type === "portion") {
        if (!validator) throw new PersistenceError(503,"calculation_unavailable");
        let candidate;
        let scope;
        let runId;
        if (body.action.type === "adopt") {
          candidate = body.action.candidate; scope = body.action.scope; runId = body.action.runId;
        } else {
          if (!current.current) throw new PersistenceError(409,"no_current_plan");
          candidate = structuredClone(current.current.candidate);
          const action = body.action;
          const meal = candidate.meals.find(meal => meal.day === action.day && meal.slot === action.slot);
          if (!meal) throw new PersistenceError(404,"not_found");
          meal.quantity = action.quantity;
          scope = [{day:action.day,slot:action.slot}]; runId = body.operationId;
        }
        const input: ProposalInput = {
          context:{planId:row.planId,sessionGeneration:row.sessionGeneration,baseRevision:row.revision,runId,scope},
          base:current.current,candidate,
        };
        let canonical;
        try { canonical = validateProposal(await validator(input,request.signal)); }
        catch (error) { if (error instanceof PersistenceError) throw error; throw new PersistenceError(503,"calculation_unavailable"); }
        if (canonical.planId !== row.planId || canonical.sessionGeneration !== row.sessionGeneration || canonical.baseRevision !== row.revision || canonical.runId !== input.context.runId) throw new PersistenceError(502,"invalid_calculation_response");
        next = canonical.evaluation;
      } else throw new PersistenceError(400,"unsupported_action");
      const currentJson = JSON.stringify(next);
      if (currentJson === row.currentJson && body.action.type !== "undo") {
        const unchanged = await readSession(db,token,clock(),row.planId);
        if (!unchanged || unchanged.sessionGeneration !== row.sessionGeneration || unchanged.revision !== row.revision || unchanged.schemaVersion !== row.schemaVersion) throw new PersistenceError(409,"revision_conflict");
        return response(await stateFromRow(unchanged,token));
      }
      const saved = await commitSession(db,row,{currentJson,previousJson},body.operationId,operationHash,clock());
      if (!saved) throw new PersistenceError(409,"revision_conflict");
      return response(await stateFromRow(saved,token),200,sessionCookie(token,saved.expiresAt,clock()));
    }
    throw new PersistenceError(404,"not_found");
  } catch (error) {
    if (error instanceof RequestTooLarge) return response({error:"request_too_large"},413);
    return error instanceof PersistenceError ? response({error:error.code},error.status) : response({error:"storage_unavailable"},503);
  }
}
