import { test, expect, type Page } from "@playwright/test";
import evaluation from "../fixtures/synthetic-evaluation.json" with { type: "json" };
import { validateSession } from "../../src/shared/api/persistence";

async function call(page: Page, path: string, method = "GET", body?: unknown, csrf?: string) {
  return page.evaluate(async ({path,method,body,csrf}) => {
    const response = await fetch(path, {method, headers:{"content-type":"application/json","x-meal-client":"1", ...(csrf ? {"x-meal-csrf":csrf} : {})}, ...(body ? {body:JSON.stringify(body)} : {})});
    const text = await response.text();
    let result: unknown;
    try { result = JSON.parse(text); } catch { result = text; }
    return {status:response.status, body:result};
  }, {path,method,body,csrf});
}

test("Worker persists canonical Python results and isolates browser identities", async ({page,browser}) => {
  await page.goto("/");
  const roundedVersion = await page.evaluate(async () => (await fetch("/api/session",{method:"POST",headers:{"content-type":"application/json","x-meal-client":"1"},body:'{"schemaVersion":1.0000000000000000001}'})).status);
  expect(roundedVersion).toBe(400);
  const initialized = await call(page,"/api/session","POST",{schemaVersion:1});
  expect(initialized.status).toBe(201);
  const state = validateSession(initialized.body);
  const cookies = await page.context().cookies();
  expect(cookies.find(cookie => cookie.name === "__Host-meal_session")).toMatchObject({httpOnly:true,secure:true,sameSite:"Lax",path:"/"});
  expect(await page.evaluate(() => document.cookie)).not.toContain("meal_session");
  const action = {schemaVersion:1,planId:state.planId,sessionGeneration:state.sessionGeneration,baseRevision:0,operationId:crypto.randomUUID(),action:{type:"adopt",candidate:evaluation.candidate,scope:evaluation.candidate.meals.map(({day,slot}) => ({day,slot})),runId:crypto.randomUUID()}};
  const adopted = await call(page,"/api/plan/actions","POST",action,state.csrfToken);
  expect(adopted.status).toBe(200);
  const saved = validateSession(adopted.body);
  expect(saved.revision).toBe(1);
  expect(saved.current?.shopping.items.length).toBeGreaterThan(0);
  expect((await call(page,"/api/plan/actions","POST",action,state.csrfToken)).body).toEqual(saved);
  await page.reload();
  expect((await call(page,"/api/plan")).body).toEqual(saved);
  const secondPage = await page.context().newPage();
  await secondPage.goto("/");
  let arrivals = 0;
  let release!: () => void;
  const barrier = new Promise<void>(resolve => { release = resolve; });
  for (const tab of [page,secondPage]) {
    await tab.route("**/api/plan/actions", async route => {
      arrivals++;
      if (arrivals === 2) release();
      await barrier;
      await route.continue();
    });
  }
  const check = {schemaVersion:1,planId:saved.planId,sessionGeneration:saved.sessionGeneration,baseRevision:1,operationId:crypto.randomUUID(),action:{type:"checks",collection:"shopping",id:saved.current!.shopping.items[0].id,checked:true}};
  const competing = await Promise.all([
    call(page,"/api/plan/actions","POST",check,saved.csrfToken),
    call(secondPage,"/api/plan/actions","POST",{...check,operationId:crypto.randomUUID()},saved.csrfToken),
  ]);
  expect(competing.map(result => result.status).sort()).toEqual([200,409]);
  const winner = validateSession(competing.find(result => result.status === 200)!.body);
  expect(winner.revision).toBe(2);
  expect(winner.current?.shopping.items[0].checked).toBe(true);
  await page.unroute("**/api/plan/actions");
  await secondPage.close();
  const undo = {...check,baseRevision:2,operationId:crypto.randomUUID(),action:{type:"undo"}};
  const restored = validateSession((await call(page,"/api/plan/actions","POST",undo,saved.csrfToken)).body);
  expect(restored.revision).toBe(3);
  expect(restored.current).toEqual(saved.current);
  expect(restored.canUndo).toBe(false);
  expect((await call(page,"/api/plan/actions","POST",action,saved.csrfToken)).status).toBe(409);
  await page.route("**/api/plan/actions", async route => {
    const committed = await route.fetch();
    expect(committed.status()).toBe(200);
    await route.abort("connectionreset");
  });
  const interrupted = {...check,baseRevision:3,operationId:crypto.randomUUID()};
  await expect(call(page,"/api/plan/actions","POST",interrupted,saved.csrfToken)).rejects.toThrow();
  await page.unroute("**/api/plan/actions");
  const recovered = validateSession((await call(page,"/api/plan")).body);
  expect(recovered.lastOperationId).toBe(interrupted.operationId);
  expect(recovered.revision).toBe(4);
  const other = await browser.newContext();
  try {
    const otherPage = await other.newPage();
    await otherPage.goto("/");
    expect((await call(otherPage,"/api/plan")).status).toBe(404);
    expect((await call(otherPage,"/api/session","POST",{schemaVersion:1})).status).toBe(201);
    expect((await call(otherPage,`/api/plan?planId=${state.planId}`)).status).toBe(404);
    expect((await call(page,"/api/session","DELETE",{schemaVersion:1},state.csrfToken)).status).toBe(200);
    expect((await call(page,"/api/plan")).status).toBe(404);
  } finally { await other.close(); }
});
