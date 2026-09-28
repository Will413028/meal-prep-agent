import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { expect, test } from "vitest";
import synthetic from "../../../tests/fixtures/synthetic-evaluation.json";
import { validateEvaluation } from "../../shared/api/validate";
import { validateSession } from "../../shared/api/persistence";
import { sessionHttp, type ProposalValidator } from "./http";
import { SQLiteSessionStore } from "./sqlite-store";

test("Oracle SQLite HTTP preserves identity, adoption, revision and undo across restart",async()=>{
  const dir=await mkdtemp(join(tmpdir(),"meal-prep-sqlite-http-"));
  const path=join(dir,"plan.sqlite3");
  const migration=await readFile(new URL("../../../../../deploy/migrations/0001_plan_sessions.sql",import.meta.url),"utf8");
  const initial=new DatabaseSync(path);
  initial.exec(migration);
  initial.exec("PRAGMA user_version=1");
  initial.close();
  let store=new SQLiteSessionStore(path);
  const origin="https://meal.test";
  const now=Date.UTC(2026,9,1);
  const request=(path:string,method:string,headers:Record<string,string>={},body?:unknown)=>new Request(`${origin}${path}`,{method,headers,body:body===undefined ? undefined : JSON.stringify(body)});
  const writeHeaders={origin,"content-type":"application/json","x-meal-client":"1"};
  const create=async()=>sessionHttp(request("/api/session","POST",writeHeaders,{schemaVersion:1}),store,()=>now,undefined,undefined,undefined,origin);
  try {
    expect((await sessionHttp(request("/api/session","POST",{...writeHeaders,origin:"https://evil.test"},{schemaVersion:1}),store,()=>now,undefined,undefined,undefined,origin)).status).toBe(403);
    const created=await create();
    expect(created.status).toBe(201);
    const identity=created.headers.get("set-cookie")!.split(";")[0];
    const state=validateSession(await created.json());
    const other=await create();
    const otherIdentity=other.headers.get("set-cookie")!.split(";")[0];
    expect((await sessionHttp(request(`/api/plan?planId=${state.planId}`,"GET",{cookie:otherIdentity}),store,()=>now,undefined,undefined,undefined,origin)).status).toBe(404);

    const evaluation=validateEvaluation(structuredClone(synthetic));
    const action={schemaVersion:1,planId:state.planId,sessionGeneration:state.sessionGeneration,baseRevision:0,operationId:crypto.randomUUID(),
      action:{type:"adopt",candidate:evaluation.candidate,scope:evaluation.candidate.meals.map(({day,slot})=>({day,slot})),runId:crypto.randomUUID()}};
    const headers={...writeHeaders,"x-meal-csrf":state.csrfToken,cookie:identity};
    const validator:ProposalValidator=async input=>({...input.context,evaluation,diff:[],shoppingDiff:[],prepDiff:[],violations:[]});
    const send=(payload:unknown)=>sessionHttp(request("/api/plan/actions","POST",headers,payload),store,()=>now+1,validator,undefined,undefined,origin);
    expect((await send({...action,baseRevision:1})).status).toBe(409);
    const adopted=await send(action);
    expect(adopted.status).toBe(200);
    expect(validateSession(await adopted.json()).revision).toBe(1);
    expect((await send(action)).status).toBe(200);
    expect((await send({...action,operationId:crypto.randomUUID()})).status).toBe(409);

    store.close();
    store=new SQLiteSessionStore(path);
    const resumed=await sessionHttp(request(`/api/plan?planId=${state.planId}`,"GET",{cookie:identity}),store,()=>now+2,undefined,undefined,undefined,origin);
    expect(validateSession(await resumed.json()).current).toEqual(evaluation);
    const checked={...action,baseRevision:1,operationId:crypto.randomUUID(),action:{type:"checks",collection:"shopping",id:evaluation.shopping.items[0].id,checked:true}};
    const check=await send(checked);
    expect(validateSession(await check.json()).revision).toBe(2);
    const undo={...action,baseRevision:2,operationId:crypto.randomUUID(),action:{type:"undo"}};
    const reverted=await send(undo);
    const final=validateSession(await reverted.json());
    expect(final.revision).toBe(3);
    expect(final.current).toEqual(evaluation);
    expect(final.canUndo).toBe(false);
  } finally {store.close();await rm(dir,{recursive:true,force:true});}
});
