import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterAll, beforeAll, expect, test } from "vitest";
import { commitSession, createSession, deleteSession, expireSessions, readSession, sessionLifetime, type SessionStore } from "./sessions";
import { sessionHttp, type ProposalValidator, type ProposalBuilder } from "./http";
import synthetic from "../../../tests/fixtures/synthetic-evaluation.json";
import { validateEvaluation } from "../../shared/api/validate";
import { validateSession } from "../../shared/api/persistence";
import { pythonBuilder, pythonValidator } from "./python-validator";
import { SQLiteSessionStore } from "./sqlite-store";

let directory: string;
let db: DatabaseSync;
let store: SQLiteSessionStore;
const now = Date.UTC(2026, 9, 1);

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(),"meal-prep-session-http-"));
  const path = join(directory,"plan.sqlite3");
  db = new DatabaseSync(path);
  const migration = await readFile(new URL("../../../../../deploy/migrations/0001_plan_sessions.sql", import.meta.url), "utf8");
  db.exec(migration);
  db.exec("PRAGMA user_version=1");
  store = new SQLiteSessionStore(path);
});
afterAll(async () => {
  store?.close();
  db?.close();
  if (directory) await rm(directory,{recursive:true,force:true});
});

function failStore(operation: "remove" | "compareAndSwap"): SessionStore {
  const failure = () => Promise.reject(new Error("injected storage failure"));
  return {
    insert: row => store.insert(row),
    find: (tokenHash,at,planId) => store.find(tokenHash,at,planId),
    compareAndSwap: (base,next,operationId,operationHash,at) => operation === "compareAndSwap"
      ? failure() : store.compareAndSwap(base,next,operationId,operationHash,at),
    remove: (base,at) => operation === "remove" ? failure() : store.remove(base,at),
    purge: at => store.purge(at),
  };
}

test("preview uses the cloud base without saving and rejects a caller-supplied base", async () => {
  const {headers,payload,evaluation} = await initializeHttp();
  const preview = {schemaVersion:1,context:{planId:payload.planId,sessionGeneration:payload.sessionGeneration,baseRevision:0,runId:crypto.randomUUID(),scope:payload.action.scope},goal:evaluation.candidate.goal,constraints:evaluation.candidate.constraints};
  let calls = 0;
  const builder: ProposalBuilder = async input => {
    calls++;
    expect(input.base).toBeNull();
    return {status:"ready",reason:null,examined:1,proposal:{...input.context,evaluation,diff:[],shoppingDiff:[],prepDiff:[],violations:[]}};
  };
  const send = (body: unknown) => sessionHttp(new Request("https://meal.test/api/plan/preview",{method:"POST",headers,body:JSON.stringify(body)}),store,()=>now,undefined,builder);
  const response = await send(preview);
  expect(response.status).toBe(200);
  expect((await response.json()).status).toBe("ready");
  expect((await readSession(store,headers.cookie.split("=")[1],now))?.revision).toBe(0);
  expect((await send({...preview,base:evaluation})).status).toBe(400);
  expect(calls).toBe(1);
});

test("explicit creation stores only an opaque token hash and valid thirty-day empty state", async () => {
  const session = await createSession(store, now);
  expect(session).not.toBeNull();
  expect(session!.token).toMatch(/^[a-f0-9]{64}$/);
  expect(session!.row.tokenHash).not.toBe(session!.token);
  expect(session!.row.revision).toBe(0);
  expect(session!.row.currentJson).toBeNull();
  expect(session!.row.previousJson).toBeNull();
  expect(session!.row.expiresAt).toBe(now + sessionLifetime);
  expect(await readSession(store, session!.token, now)).toEqual(session!.row);
  const stored = db.prepare("SELECT * FROM plan_sessions WHERE planId = ?").get(session!.row.planId);
  expect(JSON.stringify(stored)).not.toContain(session!.token);
});

test("missing random expired and another owner's plan never return a session", async () => {
  const a = await createSession(store, now);
  const b = await createSession(store, now);
  expect(a).not.toBeNull();
  expect(b).not.toBeNull();
  expect(await readSession(store, null, now)).toBeNull();
  expect(await readSession(store, "f".repeat(64), now)).toBeNull();
  expect(await readSession(store, a!.token, now, b!.row.planId)).toBeNull();
  expect(await readSession(store, a!.token, now + sessionLifetime)).toBeNull();
  expect((await readSession(store, a!.token, now + 1000))!.expiresAt).toBe(now + sessionLifetime);
});

test("SQLite CAS accepts exactly one concurrent revision and returns its atomic snapshot", async () => {
  const { token, row } = await createSession(store, now);
  const results = await Promise.all([
    commitSession(store, row, {currentJson: '{"synthetic":"A"}', previousJson: null}, crypto.randomUUID(), "hash-a", now+1),
    commitSession(store, row, {currentJson: '{"synthetic":"B"}', previousJson: null}, crypto.randomUUID(), "hash-b", now+1),
  ]);
  const winners = results.filter(result => result !== null);
  expect(winners).toHaveLength(1);
  expect(winners[0]!.revision).toBe(1);
  expect(winners[0]!.expiresAt).toBe(now + 1 + sessionLifetime);
  expect(await readSession(store, token, now + 1)).toEqual(winners[0]);
  const next = await commitSession(store, winners[0]!, {currentJson:'{"synthetic":"C"}', previousJson:winners[0]!.currentJson}, crypto.randomUUID(), "hash-c", now+2);
  expect(next!.revision).toBe(2);
  expect(next!.previousJson).toBe(winners[0]!.currentJson);
});

test("wrong ownership generation revision schema and expired bases cannot modify a row", async () => {
  const { row } = await createSession(store, now);
  const next = {currentJson:'{"synthetic":true}', previousJson:null};
  for (const patch of [{tokenHash:"a".repeat(64)}, {sessionGeneration:crypto.randomUUID()}, {planId:crypto.randomUUID()}, {revision:1}, {schemaVersion:2}]) {
    expect(await commitSession(store, {...row,...patch}, next, crypto.randomUUID(), "hash", now)).toBeNull();
  }
  expect(await commitSession(store, row, next, crypto.randomUUID(), "hash", now+sessionLifetime)).toBeNull();
});

test("clear and expiry cleanup cannot be undone by a late first proposal", async () => {
  const { token, row } = await createSession(store, now);
  expect(await deleteSession(store, row, now)).toBe(true);
  expect(await readSession(store, token, now)).toBeNull();
  expect(await commitSession(store, row, {currentJson:'{"synthetic":true}',previousJson:null}, crypto.randomUUID(), "hash", now)).toBeNull();
  const expired = await createSession(store, now);
  expect(await readSession(store, expired.token, now+sessionLifetime)).toBeNull();
  expect(await expireSessions(store, now+sessionLifetime)).toBeGreaterThan(0);
  expect(db.prepare("SELECT * FROM plan_sessions WHERE tokenHash=?").get(expired.row.tokenHash)).toBeUndefined();
  expect(await commitSession(store, expired.row, {currentJson:'{}',previousJson:null}, crypto.randomUUID(), "hash", now+sessionLifetime)).toBeNull();
});

test("HTTP initialization sets a secure host cookie and read does not renew it", async () => {
  const response = await sessionHttp(new Request("https://meal.test/api/session", {method:"POST",
    headers:{origin:"https://meal.test","content-type":"application/json","x-meal-client":"1"},body:'{"schemaVersion":1}'}), store, () => now);
  expect(response.status).toBe(201);
  const cookie = response.headers.get("set-cookie")!;
  expect(cookie).toMatch(/^__Host-meal_session=[a-f0-9]{64};/);
  expect(cookie).toContain("HttpOnly"); expect(cookie).toContain("Secure");
  expect(cookie).toContain("SameSite=Lax"); expect(cookie).toContain("Path=/");
  expect(cookie).not.toContain("Domain=");
  const state = await response.json();
  expect(state.csrfToken).toMatch(/^[a-f0-9]{64}$/);
  expect(state).not.toHaveProperty("tokenHash");
  const read = await sessionHttp(new Request("https://meal.test/api/plan", {headers:{cookie:cookie.split(";")[0]}}), store, () => now+1000);
  expect(read.status).toBe(200);
  expect(read.headers.get("cache-control")).toBe("no-store");
  expect(read.headers.has("set-cookie")).toBe(false);
  expect(await read.json()).toEqual(state);
});

test("HTTP writes require exact origin JSON and same-origin header, reads never mint identities", async () => {
  const invalidHeaders: Record<string,string>[] = [
    {origin:"https://evil.test","content-type":"application/json","x-meal-client":"1"},
    {origin:"https://meal.test","content-type":"text/plain","x-meal-client":"1"},
    {origin:"https://meal.test","content-type":"application/json"},
  ];
  for (const headers of invalidHeaders) {
    const response = await sessionHttp(new Request("https://meal.test/api/session", {method:"POST",headers,body:'{"schemaVersion":1}'}),store,()=>now);
    expect(response.status).toBe(403);
    expect(response.headers.has("set-cookie")).toBe(false);
  }
  const missing = await sessionHttp(new Request("https://meal.test/api/plan"),store,()=>now);
  expect(missing.status).toBe(404);
  expect(missing.headers.has("set-cookie")).toBe(false);
});

async function initializeHttp() {
  const created = await sessionHttp(new Request("https://meal.test/api/session",{method:"POST",headers:{origin:"https://meal.test","content-type":"application/json","x-meal-client":"1"},body:'{"schemaVersion":1}'}),store,()=>now);
  expect(created.status).toBe(201);
  const state = validateSession(await created.json());
  const headers = {origin:"https://meal.test","content-type":"application/json","x-meal-client":"1","x-meal-csrf":state.csrfToken,cookie:created.headers.get("set-cookie")!.split(";")[0]};
  const evaluation = validateEvaluation(structuredClone(synthetic));
  const payload = {schemaVersion:1,planId:state.planId,sessionGeneration:state.sessionGeneration,baseRevision:0,operationId:crypto.randomUUID(),
    action:{type:"adopt",candidate:evaluation.candidate,scope:evaluation.candidate.meals.map(({day,slot}) => ({day,slot})),runId:crypto.randomUUID()}};
  return {state,headers,payload,evaluation};
}

for (const route of ["adopt","preview"] as const) test(`untrusted Python ${route} response is validated before returning or writing it`,async()=>{
  const {headers,payload,evaluation}=await initializeHttp();
  const context={planId:payload.planId,sessionGeneration:payload.sessionGeneration,baseRevision:0,runId:payload.action.runId,scope:payload.action.scope};
  const malformed=structuredClone(evaluation) as Partial<typeof evaluation>;
  delete malformed.mealNutrition;
  const proposal={...context,evaluation:malformed,diff:[],shoppingDiff:[],prepDiff:[],violations:[]};
  const send:typeof fetch=async()=>Response.json(route==="adopt" ? proposal : {status:"ready",reason:null,examined:1,proposal});
  const body=route==="adopt" ? payload : {schemaVersion:1,context,goal:evaluation.candidate.goal,constraints:evaluation.candidate.constraints};
  const response=await sessionHttp(new Request(`https://meal.test/api/plan/${route==="adopt" ? "actions":"preview"}`,{method:"POST",headers,body:JSON.stringify(body)}),store,()=>now,pythonValidator("http://private.test",send),pythonBuilder("http://private.test",send));
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({error:"calculation_unavailable"});
  expect(await readSession(store,headers.cookie.split("=")[1],now)).toMatchObject({revision:0,currentJson:null});
});

test("adoption validates from the stored base, commits once, and rejects a reused operation with different content", async () => {
  const {state,headers,payload,evaluation} = await initializeHttp();
  let validations = 0;
  const validator: ProposalValidator = async (input) => {
    validations++;
    expect(input.base).toBeNull();
    expect(input.context.planId).toBe(state.planId);
    expect(JSON.stringify(input)).not.toContain(headers.cookie);
    return {...input.context,evaluation,diff:[],shoppingDiff:[],prepDiff:[],violations:[]};
  };
  const request = () => new Request("https://meal.test/api/plan/actions",{method:"POST",headers,body:JSON.stringify(payload)});
  const first = await sessionHttp(request(),store,()=>now+1000,validator);
  expect(first.status).toBe(200);
  const saved = validateSession(await first.json());
  expect(saved.revision).toBe(1); expect(saved.current).toEqual(evaluation);
  expect(saved.lastOperationId).toBe(payload.operationId);
  const retry = await sessionHttp(request(),store,()=>now+2000,validator);
  expect(retry.status).toBe(200);
  expect(await retry.json()).toEqual(saved);
  expect(validations).toBe(1);
  payload.action.runId = crypto.randomUUID();
  expect((await sessionHttp(request(),store,()=>now+2000,validator)).status).toBe(409);
});

test("checks and one-level undo use saved state without calling Python", async () => {
  const {headers,payload,evaluation} = await initializeHttp();
  const validator: ProposalValidator = async input => ({...input.context,evaluation,diff:[],shoppingDiff:[],prepDiff:[],violations:[]});
  const send = (body: unknown, validate?: ProposalValidator) => sessionHttp(new Request("https://meal.test/api/plan/actions",{method:"POST",headers,body:JSON.stringify(body)}),store,()=>now+1000,validate);
  expect((await send(payload,validator)).status).toBe(200);
  const checked = {...payload,baseRevision:1,operationId:crypto.randomUUID(),action:{type:"checks",collection:"shopping",id:evaluation.shopping.items[0].id,checked:true}};
  const checkResponse = await send(checked);
  expect(checkResponse.status).toBe(200);
  const checkState = validateSession(await checkResponse.json());
  expect(checkState.revision).toBe(2); expect(checkState.canUndo).toBe(true);
  expect(checkState.current!.shopping.items[0].checked).toBe(true);
  expect(evaluation.shopping.items[0].checked).toBe(false);
  const undone = {...payload,baseRevision:2,operationId:crypto.randomUUID(),action:{type:"undo"}};
  const undoResponse = await send(undone);
  expect(undoResponse.status).toBe(200);
  const undoState = validateSession(await undoResponse.json());
  expect(undoState.revision).toBe(3); expect(undoState.canUndo).toBe(false);
  expect(undoState.current).toEqual(evaluation);
  expect((await send(checked)).status).toBe(409);
  expect((await send({...undone,baseRevision:3,operationId:crypto.randomUUID()})).status).toBe(409);
});

test("lock changes stay local to the requested meal and portions are recalculated from the cloud base", async () => {
  const {headers,payload,evaluation} = await initializeHttp();
  const send = (body: unknown, validator?: ProposalValidator) => sessionHttp(new Request("https://meal.test/api/plan/actions",{method:"POST",headers,body:JSON.stringify(body)}),store,()=>now+1000,validator);
  const validator: ProposalValidator = async input => ({...input.context,evaluation,diff:[],shoppingDiff:[],prepDiff:[],violations:[]});
  expect((await send(payload,validator)).status).toBe(200);
  const meal = evaluation.candidate.meals[0];
  const lock = {...payload,baseRevision:1,operationId:crypto.randomUUID(),action:{type:"locks",day:meal.day,slot:meal.slot,locked:true}};
  const locked = await send(lock);
  expect(locked.status).toBe(200);
  expect(validateSession(await locked.json()).current!.candidate.meals[0].locked).toBe(true);
  const unlock = {...lock,baseRevision:2,operationId:crypto.randomUUID(),action:{...lock.action,locked:false}};
  expect((await send(unlock)).status).toBe(200);
  let called = false;
  const portionValidator: ProposalValidator = async input => {
    called = true;
    expect(input.base!.candidate.meals[0].quantity).toBe(meal.quantity);
    expect(input.candidate.meals[0].quantity).toBe(1);
    expect(input.context.scope).toEqual([{day:meal.day,slot:meal.slot}]);
    return {...input.context,evaluation,diff:[],shoppingDiff:[],prepDiff:[],violations:[]};
  };
  const portion = {...payload,baseRevision:3,operationId:crypto.randomUUID(),action:{type:"portion",day:meal.day,slot:meal.slot,quantity:1}};
  expect((await send(portion,portionValidator)).status).toBe(200);
  expect(called).toBe(true);
});

test("a change or clear during Python validation makes its late result unusable", async () => {
  for (const clear of [false,true]) {
    const {headers,payload,evaluation} = await initializeHttp();
    let release!: () => void; let reached!: () => void;
    const barrier = new Promise<void>(resolve => { release = resolve; });
    const observed = new Promise<void>(resolve => { reached = resolve; });
    const validator: ProposalValidator = async input => { reached(); await barrier; return {...input.context,evaluation,diff:[],shoppingDiff:[],prepDiff:[],violations:[]}; };
    const pending = sessionHttp(new Request("https://meal.test/api/plan/actions",{method:"POST",headers,body:JSON.stringify(payload)}),store,()=>now,validator);
    await observed;
    const token = headers.cookie.split("=")[1];
    const row = (await readSession(store,token,now))!;
    if (clear) await deleteSession(store,row,now);
    else await commitSession(store,row,{currentJson:JSON.stringify(evaluation),previousJson:null},crypto.randomUUID(),"concurrent",now);
    release();
    expect((await pending).status).toBe(409);
    expect((await readSession(store,token,now))?.revision ?? null).toBe(clear ? null : 1);
  }
});

test("clear requires CSRF and reports storage failure without clearing the browser identity", async () => {
  const created = await sessionHttp(new Request("https://meal.test/api/session", {method:"POST",headers:{origin:"https://meal.test","content-type":"application/json","x-meal-client":"1"},body:'{"schemaVersion":1}'}),store,()=>now);
  const state = await created.json();
  const cookie = created.headers.get("set-cookie")!.split(";")[0];
  const headers = {origin:"https://meal.test","content-type":"application/json","x-meal-client":"1",cookie};
  const rejected = await sessionHttp(new Request("https://meal.test/api/session",{method:"DELETE",headers}),store,()=>now);
  expect(rejected.status).toBe(403);
  const failed = await sessionHttp(new Request("https://meal.test/api/session",{method:"DELETE",headers:{...headers,"x-meal-csrf":state.csrfToken}}),failStore("remove"),()=>now);
  expect(failed.status).toBe(503);
  expect(failed.headers.has("set-cookie")).toBe(false);
  const cleared = await sessionHttp(new Request("https://meal.test/api/session",{method:"DELETE",headers:{...headers,"x-meal-csrf":state.csrfToken}}),store,()=>now);
  expect(cleared.status).toBe(200);
  expect(await cleared.json()).toEqual({cleared:true});
  expect(cleared.headers.get("set-cookie")).toContain("Max-Age=0");
  expect((await sessionHttp(new Request("https://meal.test/api/plan",{headers:{cookie}}),store,()=>now)).status).toBe(404);
});

test("unknown stored versions are rejected without deleting the cloud row", async () => {
  const {token,row} = await createSession(store,now);
  db.prepare("UPDATE plan_sessions SET schemaVersion=99 WHERE tokenHash=?").run(row.tokenHash);
  const result = await sessionHttp(new Request("https://meal.test/api/plan",{headers:{cookie:`__Host-meal_session=${token}`}}),store,()=>now);
  expect(result.status).toBe(409);
  expect(result.headers.has("set-cookie")).toBe(false);
  expect((db.prepare("SELECT schemaVersion FROM plan_sessions WHERE tokenHash=?").get(row.tokenHash) as {schemaVersion:number}).schemaVersion).toBe(99);
});

test("Web rejects numeric lexemes that would silently round before Python validation", async () => {
  const {headers,payload,evaluation} = await initializeHttp();
  const validator: ProposalValidator = async input => ({...input.context,evaluation,diff:[],shoppingDiff:[],prepDiff:[],violations:[]});
  const raw = JSON.stringify(payload).replace('"baseRevision":0','"baseRevision":0.00000000000000000000000000000000000000001e-999');
  const result = await sessionHttp(new Request("https://meal.test/api/plan/actions",{method:"POST",headers,body:raw}),store,()=>now,validator);
  expect(result.status).toBe(400);
});

test("a storage failure at the final update preserves the prior row and returns no renewal cookie", async () => {
  const {headers,payload,evaluation} = await initializeHttp();
  let calculated = false;
  const validator: ProposalValidator = async input => { calculated = true; return {...input.context,evaluation,diff:[],shoppingDiff:[],prepDiff:[],violations:[]}; };
  const response = await sessionHttp(new Request("https://meal.test/api/plan/actions",{method:"POST",headers,body:JSON.stringify(payload)}),failStore("compareAndSwap"),()=>now,validator);
  expect(calculated).toBe(true);
  expect(response.status).toBe(503);
  expect(response.headers.has("set-cookie")).toBe(false);
  expect((await readSession(store,headers.cookie.split("=")[1],now))?.revision).toBe(0);
});

test("expiry during Python calculation rejects the late write before scheduled cleanup", async () => {
  const {headers,payload,evaluation} = await initializeHttp();
  let clock = now;
  const validator: ProposalValidator = async input => { clock += sessionLifetime; return {...input.context,evaluation,diff:[],shoppingDiff:[],prepDiff:[],violations:[]}; };
  const response = await sessionHttp(new Request("https://meal.test/api/plan/actions",{method:"POST",headers,body:JSON.stringify(payload)}),store,()=>clock,validator);
  expect(response.status).toBe(409);
  expect((db.prepare("SELECT revision FROM plan_sessions WHERE planId=?").get(payload.planId) as {revision:number})?.revision).toBe(0);
});

test("an unchanged candidate must still reject a concurrent modification clear or expiry", async () => {
  for (const cause of ["change","clear","expiry"]) {
    const {headers,payload,evaluation} = await initializeHttp();
    let clock = now;
    const send = (body: unknown, validator: ProposalValidator) => sessionHttp(new Request("https://meal.test/api/plan/actions",{method:"POST",headers,body:JSON.stringify(body)}),store,()=>clock,validator);
    const canonical: ProposalValidator = async input => ({...input.context,evaluation,diff:[],shoppingDiff:[],prepDiff:[],violations:[]});
    expect((await send(payload,canonical)).status).toBe(200);
    const stale = {...payload,baseRevision:1,operationId:crypto.randomUUID()};
    const racing: ProposalValidator = async input => {
      const row = (await readSession(store,headers.cookie.split("=")[1],clock))!;
      if (cause === "clear") await deleteSession(store,row,clock);
      else if (cause === "expiry") clock += sessionLifetime;
      else await commitSession(store,row,{currentJson:JSON.stringify({...evaluation,warnings:["concurrent"]}),previousJson:row.currentJson},crypto.randomUUID(),"concurrent",clock);
      return canonical(input,new AbortController().signal);
    };
    expect((await send(stale,racing)).status).toBe(409);
  }
});

test("old nutrition snapshots remain in SQLite after rejection and explicit new identity", async () => {
  for (const missing of ["mealNutrition","targetDifference"]) {
    const {token,row} = await createSession(store,now);
    const old = JSON.parse(JSON.stringify(synthetic));
    if (missing === "mealNutrition") delete old.mealNutrition;
    else delete old.days[0].nutrients.kcal.targetDifference;
    const original = JSON.stringify(old);
    db.prepare("UPDATE plan_sessions SET currentJson=? WHERE tokenHash=?").run(original,row.tokenHash);
    const cookie = `__Host-meal_session=${token}`;
    const rejected = await sessionHttp(new Request("https://meal.test/api/plan",{headers:{cookie}}),store,()=>now);
    expect(rejected.status).toBe(409);
    expect(await rejected.json()).toEqual({error:"unsupported_state"});
    const fresh = await sessionHttp(new Request("https://meal.test/api/session",{method:"POST",headers:{cookie,origin:"https://meal.test","content-type":"application/json","x-meal-client":"1"},body:'{"schemaVersion":1}'}),store,()=>now);
    expect(fresh.status).toBe(201);
    expect((await fresh.json() as {planId:string}).planId).not.toBe(row.planId);
    expect((await readSession(store,token,now))?.currentJson).toBe(original);
  }
});

test("Agent proxy replaces caller context with the owned SQLite base and strips cookies", async () => {
  const {headers,payload,evaluation} = await initializeHttp();
  const validator: ProposalValidator = async input => ({...input.context,evaluation,diff:[],shoppingDiff:[],prepDiff:[],violations:[]});
  await sessionHttp(new Request("https://meal.test/api/plan/actions",{method:"POST",headers,body:JSON.stringify(payload)}),store,()=>now,validator);
  const context = {planId:payload.planId,sessionGeneration:payload.sessionGeneration,baseRevision:1,runId:crypto.randomUUID(),scope:evaluation.candidate.meals.map(({day,slot}) => ({day,slot}))};
  const planning = {schemaVersion:1,context,goal:evaluation.candidate.goal,constraints:evaluation.candidate.constraints};
  const body = {protocolVersion:"1.0",threadId:payload.planId,runId:context.runId,messages:[{id:"m",role:"user",content:"請幫我换菜"}],state:{},tools:[],context:[],forwardedProps:{planning}};
  let forwarded: unknown;
  const run = async (input: unknown) => {forwarded=input;return new Response('data: {"type":"RUN_FINISHED"}\n\n',{headers:{"content-type":"text/event-stream"}});};
  const send = (value: unknown) => sessionHttp(new Request("https://meal.test/api/agent",{method:"POST",headers,body:JSON.stringify(value)}),store,()=>now,undefined,undefined,run);
  const result = await send(body);
  expect(result.status).toBe(200);
  expect(forwarded).toMatchObject({forwardedProps:{planning:{base:evaluation,context}}});
  expect(JSON.stringify(forwarded)).not.toContain("__Host-meal_session");
  expect((await send({...body,forwardedProps:{planning:{...planning,base:evaluation}}})).status).toBe(400);
  expect((await send({...body,runId:crypto.randomUUID()})).status).toBe(400);
  expect((await readSession(store,headers.cookie.split("=")[1],now))?.revision).toBe(1);
});

test("session creation accepts the byte boundary but rejects oversized bodies before creating a row", async () => {
  const headers = {origin:"https://meal.test","content-type":"application/json","x-meal-client":"1"};
  const count = () => (db.prepare("SELECT COUNT(*) AS n FROM plan_sessions").get() as {n:number}).n;
  const before = await count();
  for (const extra of [0,1]) {
    const response = await sessionHttp(new Request("https://meal.test/api/session",{method:"POST",headers,body:'{"schemaVersion":1}'.padEnd(128*1024+extra," ")}),store,()=>now);
    expect(response.status).toBe(extra ? 413 : 201);
  }
  expect(await count()).toBe(before+1);
});

test("two anonymous Agent runs receive only their owned snapshot and reject questionnaire fields",async()=>{
  const users=await Promise.all([initializeHttp(),initializeHttp()]);
  const requests=[];
  for(const [index,user] of users.entries()) {
    const evaluation=structuredClone(user.evaluation);evaluation.candidate.meals[0].locked=index===1;
    const validator:ProposalValidator=async input=>({...input.context,evaluation,diff:[],shoppingDiff:[],prepDiff:[],violations:[]});
    await sessionHttp(new Request("https://meal.test/api/plan/actions",{method:"POST",headers:user.headers,body:JSON.stringify(user.payload)}),store,()=>now,validator);
    const runId=crypto.randomUUID();
    requests.push({protocolVersion:"1.0",threadId:user.payload.planId,runId,messages:[{id:"m",role:"user",content:"合成展示"}],state:{},tools:[],context:[],forwardedProps:{mode:"fixture",planning:{schemaVersion:1,goal:evaluation.candidate.goal,constraints:evaluation.candidate.constraints,context:{planId:user.payload.planId,sessionGeneration:user.payload.sessionGeneration,baseRevision:1,runId,scope:user.payload.action.scope}}}});
  }
  const contexts:Record<string,unknown>={};
  const run=async(input:import("./http").AgentInput)=>{contexts[input.threadId]=input.forwardedProps.planning.base;return new Response("synthetic");};
  const send=(index:number,body:unknown)=>sessionHttp(new Request("https://meal.test/api/agent",{method:"POST",headers:users[index].headers,body:JSON.stringify(body)}),store,()=>now,undefined,undefined,run);
  expect((await Promise.all(requests.map((body,index)=>send(index,body)))).map(response=>response.status)).toEqual([200,200]);
  expect(contexts[requests[0].threadId]).toMatchObject({candidate:{meals:[expect.objectContaining({locked:false}),...users[0].evaluation.candidate.meals.slice(1)]}});
  expect(contexts[requests[1].threadId]).toMatchObject({candidate:{meals:[expect.objectContaining({locked:true}),...users[1].evaluation.candidate.meals.slice(1)]}});
  expect((await send(0,requests[1])).status).toBe(404);
  const raw={...requests[0],forwardedProps:{...requests[0].forwardedProps,planning:{...requests[0].forwardedProps.planning,age:37,height:171.3,weight:68.7}}};
  expect((await send(0,raw)).status).toBe(400);
  expect(Object.keys(contexts)).toHaveLength(2);
  const stored=db.prepare("SELECT currentJson,previousJson FROM plan_sessions WHERE planId=?").get(requests[0].threadId);
  expect(JSON.stringify(stored)).not.toMatch(/"(?:age|height|weight)"/);
});
