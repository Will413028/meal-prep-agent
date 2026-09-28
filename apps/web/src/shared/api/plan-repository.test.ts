import { expect, test, vi } from "vitest";
import { PlanRepository } from "./plan-repository";

const state = {schemaVersion:1,sessionGeneration:crypto.randomUUID(),planId:crypto.randomUUID(),revision:1,expiresAt:"2026-10-30T00:00:00Z",csrfToken:"a".repeat(64),current:null,canUndo:false,lastOperationId:crypto.randomUUID()};
const action = {schemaVersion:1 as const,sessionGeneration:state.sessionGeneration,planId:state.planId,baseRevision:0,operationId:state.lastOperationId,action:{type:"undo" as const}};

test("repository reads back an interrupted commit without resending the action", async () => {
  const fetcher = vi.fn<typeof fetch>().mockRejectedValueOnce(new TypeError("connection lost")).mockResolvedValueOnce(Response.json(state));
  const repository = new PlanRepository(fetcher);
  expect(await repository.apply(action,state.csrfToken)).toEqual(state);
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(fetcher.mock.calls[0][0]).toBe("/api/plan/actions");
  expect(fetcher.mock.calls[1][0]).toBe("/api/plan");
  expect(fetcher.mock.calls[0][1]).toMatchObject({credentials:"same-origin",headers:{"x-meal-csrf":state.csrfToken,"x-meal-client":"1"}});
});

test("repository does not claim an unrelated or later revision completed its action", async () => {
  for (const changed of [{...state,revision:2},{...state,lastOperationId:crypto.randomUUID()},{...state,sessionGeneration:crypto.randomUUID()}]) {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValueOnce(new TypeError("lost")).mockResolvedValueOnce(Response.json(changed));
    await expect(new PlanRepository(fetcher).apply(action,state.csrfToken)).rejects.toThrow("save_unconfirmed");
    expect(fetcher).toHaveBeenCalledTimes(2);
  }
});

test("missing identity reads as absent without implicitly creating another session", async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({error:"not_found"},{status:404}));
  expect(await new PlanRepository(fetcher).read()).toBeNull();
  expect(fetcher).toHaveBeenCalledTimes(1);
});

test("explicit create and clear use their respective authenticated routes", async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json(state,{status:201})).mockResolvedValueOnce(Response.json({cleared:true}));
  const repository = new PlanRepository(fetcher);
  expect(await repository.initialize()).toEqual(state);
  await repository.clear(state.csrfToken);
  expect(fetcher.mock.calls.map(([path,options]) => [path,options?.method])).toEqual([["/api/session","POST"],["/api/session","DELETE"]]);
  expect(fetcher.mock.calls[1][1]?.headers).toMatchObject({"x-meal-csrf":state.csrfToken});
});

test("clear confirms absence after an interrupted delete but never treats read failure or another session as success", async () => {
  const absent = vi.fn<typeof fetch>().mockRejectedValueOnce(new TypeError("lost response")).mockResolvedValueOnce(Response.json({error:"not_found"},{status:404}));
  await expect(new PlanRepository(absent).clear(state.csrfToken)).resolves.toBeUndefined();
  expect(absent.mock.calls.map(([path,options]) => [path,options?.method])).toEqual([["/api/session","DELETE"],["/api/plan","GET"]]);
  for (const response of [Response.json(state),Response.json({error:"storage_unavailable"},{status:503})]) {
    const unconfirmed = vi.fn<typeof fetch>().mockRejectedValueOnce(new TypeError("lost response")).mockResolvedValueOnce(response);
    await expect(new PlanRepository(unconfirmed).clear(state.csrfToken)).rejects.toThrow("clear_unconfirmed");
  }
});

test("unsupported snapshots expose a specific recovery code without creating a session", async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({error:"unsupported_state"},{status:409}));
  await expect(new PlanRepository(fetcher).read()).rejects.toMatchObject({status:409,code:"unsupported_state"});
  expect(fetcher).toHaveBeenCalledTimes(1);
});
