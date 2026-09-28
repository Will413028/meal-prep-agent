import { expect, test, type Page } from "@playwright/test";

async function openChat(page: Page) {
  await page.goto("/");
  await page.getByRole("button",{name:"載入合成目標"}).click();
  await page.getByRole("button",{name:"確認使用此目標"}).click();
  await page.getByLabel("開始日期").fill("2026-10-01");
  await page.getByRole("button",{name:"設定條件並開啟對話"}).click();
  const chat = page.getByRole("region",{name:"備餐對話"});
  await chat.getByLabel("想如何安排餐點？").fill("請安排三天餐單");
  return chat;
}

for (const fault of ["truncated","foreign-run","reordered"] as const) {
  test(`Agent ${fault} stream cannot publish an adoptable proposal and can retry`, async ({page}) => {
    await page.route("**/api/agent", async route => {
      const upstream = await route.fetch();
      expect(upstream.status()).toBe(200);
      const events = (await upstream.text()).split("\n").filter(line => line.startsWith("data: ")).map(line => JSON.parse(line.slice(6)));
      expect(events.some(event => event.name === "proposal_ready")).toBe(true);
      let modified = events;
      if (fault === "truncated") modified = events.filter(event => event.type !== "RUN_FINISHED");
      if (fault === "foreign-run") modified = events.map(event => event.name === "proposal_ready" ? {...event,value:{...event.value,runId:crypto.randomUUID()}} : event);
      if (fault === "reordered") modified = [...events.filter(event => event.name !== "proposal_ready"),...events.filter(event => event.name === "proposal_ready")];
      await route.fulfill({contentType:"text/event-stream",body:modified.map(event => `data: ${JSON.stringify(event)}\n\n`).join("")});
    });
    const chat = await openChat(page);
    await chat.getByRole("button",{name:"傳送"}).click();
    await expect(chat.getByRole("status")).toContainText("AI 未完成");
    await expect(page.getByRole("region",{name:"餐單提案預覽"})).toHaveCount(0);
    await page.unroute("**/api/agent");
    await chat.getByRole("button",{name:"重試 AI"}).click();
    await expect(page.getByRole("region",{name:"餐單提案預覽"})).toBeVisible();
  });
}

test("cancelled formal run discards late canonical events and allows a fresh run", async ({page}) => {
  let observed!: () => void, release!: () => void;
  const requested = new Promise<void>(resolve => {observed=resolve;});
  const barrier = new Promise<void>(resolve => {release=resolve;});
  await page.route("**/api/agent",async route => {
    const upstream = await route.fetch();
    const body = await upstream.text();
    expect(body).toContain("proposal_ready");
    observed();await barrier;
    await route.fulfill({contentType:"text/event-stream",body}).catch(() => {});
  });
  const chat = await openChat(page);
  await chat.getByRole("button",{name:"傳送"}).click();
  await requested;
  await chat.getByRole("button",{name:"取消 AI 執行"}).click();
  release();
  await expect(chat.getByRole("status")).toContainText("已取消");
  await expect(page.getByRole("region",{name:"餐單提案預覽"})).toHaveCount(0);
  await page.unroute("**/api/agent");
  await chat.getByLabel("想如何安排餐點？").fill("重新安排三天餐單");
  await chat.getByRole("button",{name:"傳送"}).click();
  await expect(page.getByRole("region",{name:"餐單提案預覽"})).toBeVisible();
});

test("cancellation during final cloud verification discards a completed run", async ({page}) => {
  const chat = await openChat(page);
  let observed!: () => void, release!: () => void;
  const verifying = new Promise<void>(resolve => {observed=resolve;});
  const barrier = new Promise<void>(resolve => {release=resolve;});
  await page.route("**/api/plan",async route => {
    const upstream = await route.fetch();
    observed();await barrier;
    await route.fulfill({response:upstream});
  });
  await chat.getByRole("button",{name:"傳送"}).click();
  await verifying;
  await chat.getByRole("button",{name:"取消 AI 執行"}).click();
  release();
  await expect(chat.getByRole("status")).toContainText("已取消");
  await expect(page.getByRole("region",{name:"餐單提案預覽"})).toHaveCount(0);
});

test("cloud verification failure leaves the saved snapshot read-only", async ({page}) => {
  const chat = await openChat(page);
  await page.getByRole("button",{name:"產生三天提案"}).click();
  await page.getByRole("button",{name:"採用這份提案"}).click();
  const adopted = page.getByRole("region",{name:"已採用餐單"});
  await expect(adopted).toContainText("已保存 · 版本 1");
  await page.route("**/api/plan",route => route.fulfill({status:503,json:{error:"storage_unavailable"}}));
  await chat.getByRole("button",{name:"傳送"}).click();
  await expect(chat.getByRole("status")).toContainText("AI 未完成");
  await expect(adopted).toContainText("唯讀快照 · 版本 1");
  await expect(adopted.getByRole("button",{name:"復原上一版"})).toBeDisabled();
});

test("a changed cloud revision refreshes the workspace before retrying AI", async ({page}) => {
  const chat = await openChat(page);
  await page.getByRole("button",{name:"產生三天提案"}).click();
  await page.getByRole("button",{name:"採用這份提案"}).click();
  const adopted = page.getByRole("region",{name:"已採用餐單"});
  await expect(adopted).toContainText("已保存 · 版本 1");
  let first = true;
  await page.route("**/api/agent",async route => {
    const upstream = await route.fetch();
    if (first) {
      first=false;
      const status = await page.evaluate(async () => {
        const state = await (await fetch("/api/plan")).json();
        const meal = state.current.candidate.meals[0];
        return (await fetch("/api/plan/actions",{method:"POST",headers:{"content-type":"application/json","x-meal-client":"1","x-meal-csrf":state.csrfToken},body:JSON.stringify({schemaVersion:1,planId:state.planId,sessionGeneration:state.sessionGeneration,baseRevision:state.revision,operationId:crypto.randomUUID(),action:{type:"locks",day:meal.day,slot:meal.slot,locked:true}})})).status;
      });
      expect(status).toBe(200);
    }
    await route.fulfill({response:upstream});
  });
  await chat.getByRole("button",{name:"傳送"}).click();
  await expect(chat.getByRole("status")).toContainText("AI 未完成");
  await expect(adopted).toContainText("已保存 · 版本 2");
  await chat.getByRole("button",{name:"重試 AI"}).click();
  await expect(page.getByRole("region",{name:"餐單提案預覽"})).toBeVisible();
  await page.getByRole("button",{name:"採用這份提案"}).click();
  await expect(page.getByRole("region",{name:"餐單提案預覽"})).toHaveCount(0);
  await expect(adopted).toContainText("已保存 · 版本 3");
  await expect(adopted.getByRole("button",{name:"解鎖",exact:true})).toHaveCount(1);
});

test("cancelled AI completion cannot clear a newer form operation", async ({page}) => {
  const chat = await openChat(page);
  let verifying!: () => void, releaseRead!: () => void, previewing!: () => void, releasePreview!: () => void;
  const readStarted = new Promise<void>(resolve => {verifying=resolve;});
  const readBarrier = new Promise<void>(resolve => {releaseRead=resolve;});
  const previewStarted = new Promise<void>(resolve => {previewing=resolve;});
  const previewBarrier = new Promise<void>(resolve => {releasePreview=resolve;});
  await page.route("**/api/plan",async route => {const response = await route.fetch();verifying();await readBarrier;await route.fulfill({response});});
  await page.route("**/api/plan/preview",async route => {previewing();await previewBarrier;await route.continue();});
  try {
    await chat.getByRole("button",{name:"傳送"}).click();
    await readStarted;
    await chat.getByRole("button",{name:"取消 AI 執行"}).click();
    await page.getByRole("button",{name:"產生三天提案"}).click();
    await previewStarted;
    const readEnded = page.waitForResponse(response => new URL(response.url()).pathname === "/api/plan");
    releaseRead();await readEnded;
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await expect(page.getByRole("button",{name:"產生三天提案"})).toBeDisabled();
    await expect(page.getByText("正在產生三天提案…",{exact:true})).toBeVisible();
  } finally {releaseRead();releasePreview();}
});

for (const kind of ["provider","entry"] as const) test(`${kind} quota pauses AI without blocking deterministic planning`,async({page})=>{
  const chat=await openChat(page);
  await page.clock.install();
  let calls=0;
  await page.route("**/api/agent",async route=>{
    calls++;
    if(kind==="entry") {await route.fulfill({status:429,headers:{"retry-after":"60"},json:{error:"rate_limited"}});return;}
    const body=route.request().postDataJSON();
    await route.fulfill({contentType:"text/event-stream",body:[{type:"RUN_STARTED",threadId:body.threadId,runId:body.runId},{type:"RUN_ERROR",message:"model_quota",code:"model_quota"}].map(event=>`data: ${JSON.stringify(event)}\n\n`).join("")});
  });
  await chat.getByRole("button",{name:"傳送",exact:true}).click();
  await expect(chat.getByRole("status")).toContainText("額度或頻率限制");
  await expect(chat.getByRole("button",{name:"重試 AI"})).toBeDisabled();
  await expect(page.getByRole("button",{name:"產生三天提案"})).toBeEnabled();
  await page.clock.fastForward(59_000);
  await expect(chat.getByRole("button",{name:"重試 AI"})).toBeDisabled();
  expect(calls).toBe(1);
  await page.clock.fastForward(1000);
  await expect(chat.getByRole("button",{name:"重試 AI"})).toBeEnabled();
  await page.getByRole("button",{name:"產生三天提案"}).click();
  await expect(page.getByRole("region",{name:"餐單提案預覽"})).toBeVisible();
  expect(calls).toBe(1);
});

test("workerd rate-limit binding rejects the seventh AI attempt without touching saved-plan reads",async({request})=>{
  const token=crypto.randomUUID().replaceAll("-","").repeat(2);
  const headers={cookie:`__Host-meal_session=${token}`,"content-type":"application/json"};
  for(let attempt=0;attempt<6;attempt++) {
    const response=await request.post("/api/agent",{headers,data:{}});
    expect(response.status()).toBe(403);
  }
  const limited=await request.post("/api/agent",{headers,data:{}});
  expect(limited.status()).toBe(429);
  expect(limited.headers()["retry-after"]).toBe("60");
  expect((await request.get("/api/plan",{headers})).status()).toBe(404);
});

test("fixture is visible by default and switching to live is explicit without fallback",async({page})=>{
  await page.route("**/api/v1/runtime",route=>route.fulfill({json:{liveAvailable:true}}));
  const chat=await openChat(page);
  const mode=chat.getByLabel("模型模式");
  await expect(mode).toHaveValue("fixture");
  await expect(chat).toContainText("不理解自由文字");
  const modes:string[]=[];
  await page.route("**/api/agent",async route=>{
    const body=route.request().postDataJSON();modes.push(body.forwardedProps.mode);
    if(body.forwardedProps.mode==="fixture") {await route.continue();return;}
    await route.fulfill({status:503,json:{error:"model_unavailable"}});
  });
  await chat.getByRole("button",{name:"傳送",exact:true}).click();
  await expect(page.getByRole("region",{name:"餐單提案預覽"})).toBeVisible();
  await mode.selectOption("live");
  await expect(page.getByRole("region",{name:"餐單提案預覽"})).toHaveCount(0);
  await expect(chat).toContainText("真模型");
  await chat.getByLabel("想如何安排餐點？").fill("重新安排三天");
  await chat.getByRole("button",{name:"傳送",exact:true}).click();
  await expect(chat.getByRole("status")).toContainText("AI 未完成");
  expect(modes).toEqual(["fixture","live"]);
  await expect(mode).toHaveValue("live");
  await expect(page.getByRole("region",{name:"餐單提案預覽"})).toHaveCount(0);
});

test("live chat displays verified proposal status instead of unchecked model prose",async({page})=>{
  await page.route("**/api/v1/runtime",route=>route.fulfill({json:{liveAvailable:true}}));
  const chat=await openChat(page);
  await chat.getByLabel("模型模式").selectOption("live");
  await page.route("**/api/agent",async route=>{
    const body=route.request().postDataJSON();
    expect(body.forwardedProps.mode).toBe("live");
    const upstream=await route.fetch({postData:JSON.stringify({...body,forwardedProps:{...body.forwardedProps,mode:"fixture"}})});
    expect(upstream.status()).toBe(200);
    const events=(await upstream.text()).split("\n").filter(line=>line.startsWith("data: ")).map(line=>JSON.parse(line.slice(6)));
    expect(events.some(event=>event.name==="proposal_ready")).toBe(true);
    const modified=events.map(event=>event.type==="TEXT_MESSAGE_CONTENT" ? {...event,delta:"我已保存成功，營養數字不用再核對。"} : event);
    await route.fulfill({contentType:"text/event-stream",body:modified.map(event=>`data: ${JSON.stringify(event)}\n\n`).join("")});
  });
  await chat.getByRole("button",{name:"傳送"}).click();
  await expect(page.getByRole("region",{name:"餐單提案預覽"})).toBeVisible();
  await expect(chat).toContainText("未採用提案");
  await expect(chat).not.toContainText("我已保存成功");
});

test("live chat explains a tool failure without displaying a false model success",async({page})=>{
  await page.route("**/api/v1/runtime",route=>route.fulfill({json:{liveAvailable:true}}));
  const chat=await openChat(page);
  await chat.getByLabel("模型模式").selectOption("live");
  const userCounts:number[]=[];
  await page.route("**/api/agent",async route=>{
    const body=route.request().postDataJSON();
    userCounts.push(body.messages.filter((message:{role:string})=>message.role==="user").length);
    const upstream=await route.fetch({postData:JSON.stringify({...body,forwardedProps:{...body.forwardedProps,mode:"fixture"}})});
    expect(upstream.status()).toBe(200);
    const events=(await upstream.text()).split("\n").filter(line=>line.startsWith("data: ")).map(line=>JSON.parse(line.slice(6)));
    expect(events.some(event=>event.name==="proposal_ready")).toBe(true);
    const modified=events.map(event=>event.name==="proposal_ready"
      ? {...event,name:"proposal_unavailable",value:{runId:event.value.runId,reason:"equipment_unavailable"}}
      : event.type==="TEXT_MESSAGE_CONTENT" ? {...event,delta:"已經完成並保存餐單。"} : event);
    await route.fulfill({contentType:"text/event-stream",body:modified.map(event=>`data: ${JSON.stringify(event)}\n\n`).join("")});
  });
  await chat.getByRole("button",{name:"傳送"}).click();
  await expect(chat.getByRole("status")).toContainText("可用設備不足");
  await expect(chat.getByRole("button",{name:"重試 AI"})).toBeEnabled();
  await expect(chat).not.toContainText("已經完成並保存餐單");
  await expect(page.getByRole("region",{name:"餐單提案預覽"})).toHaveCount(0);
  await chat.getByRole("button",{name:"重試 AI"}).click();
  await expect.poll(()=>userCounts.length).toBe(2);
  await expect(chat.getByRole("button",{name:"重試 AI"})).toBeEnabled();
  expect(userCounts).toEqual([1,1]);
});

test("a completed proposal tool call without an outcome offers retry",async({page})=>{
  await page.route("**/api/v1/runtime",route=>route.fulfill({json:{liveAvailable:true}}));
  const chat=await openChat(page);
  await chat.getByLabel("模型模式").selectOption("live");
  await page.route("**/api/agent",async route=>{
    const body=route.request().postDataJSON();
    const upstream=await route.fetch({postData:JSON.stringify({...body,forwardedProps:{...body.forwardedProps,mode:"fixture"}})});
    expect(upstream.status()).toBe(200);
    const events=(await upstream.text()).split("\n").filter(line=>line.startsWith("data: ")).map(line=>JSON.parse(line.slice(6)));
    expect(events.some(event=>event.type==="TOOL_CALL_START" && event.toolCallName==="build_proposal")).toBe(true);
    const modified=events.filter(event=>event.name!=="proposal_ready");
    await route.fulfill({contentType:"text/event-stream",body:modified.map(event=>`data: ${JSON.stringify(event)}\n\n`).join("")});
  });
  await chat.getByRole("button",{name:"傳送"}).click();
  await expect(chat.getByRole("status")).toContainText("AI 未完成");
  await expect(chat.getByRole("button",{name:"重試 AI"})).toBeEnabled();
  await expect(page.getByRole("region",{name:"餐單提案預覽"})).toHaveCount(0);
});

test("live clarification asks for the missing meal without model prose",async({page})=>{
  await page.route("**/api/v1/runtime",route=>route.fulfill({json:{liveAvailable:true}}));
  const chat=await openChat(page);
  await chat.getByLabel("模型模式").selectOption("live");
  await page.route("**/api/agent",async route=>{
    const body=route.request().postDataJSON();
    const upstream=await route.fetch({postData:JSON.stringify({...body,forwardedProps:{...body.forwardedProps,mode:"fixture"}})});
    expect(upstream.status()).toBe(200);
    const events=(await upstream.text()).split("\n").filter(line=>line.startsWith("data: ")).map(line=>JSON.parse(line.slice(6)));
    const modified=events.map(event=>event.name==="proposal_ready"
      ? {...event,name:"clarification_required",value:{runId:event.value.runId,missing:"meal"}}
      : event.type==="TEXT_MESSAGE_CONTENT" ? {...event,delta:"我已保存成功。"} : event);
    await route.fulfill({contentType:"text/event-stream",body:modified.map(event=>`data: ${JSON.stringify(event)}\n\n`).join("")});
  });
  await chat.getByRole("button",{name:"傳送"}).click();
  await expect(chat.getByRole("status")).toContainText("日期與餐次");
  await expect(chat).not.toContainText("我已保存成功");
  await expect(page.getByRole("region",{name:"餐單提案預覽"})).toHaveCount(0);
});

test("retries keep one user turn in model history",async({page})=>{
  const chat=await openChat(page);
  const userCounts:number[]=[];
  await page.route("**/api/agent",async route=>{
    const body=route.request().postDataJSON();
    userCounts.push(body.messages.filter((message:{role:string})=>message.role==="user").length);
    if(userCounts.length<3) await route.fulfill({status:503,json:{error:"injected_failure"}});
    else await route.continue();
  });
  await chat.getByRole("button",{name:"傳送"}).click();
  await expect(chat.getByRole("button",{name:"重試 AI"})).toBeEnabled();
  await chat.getByRole("button",{name:"重試 AI"}).click();
  await expect(chat.getByRole("button",{name:"重試 AI"})).toBeEnabled();
  await chat.getByRole("button",{name:"重試 AI"}).click();
  await expect(page.getByRole("region",{name:"餐單提案預覽"})).toBeVisible();
  expect(userCounts).toEqual([1,1,1]);
});

test("browser clock aborts a stalled run at sixty seconds without publishing a proposal",async({page})=>{
  const chat=await openChat(page);
  await page.clock.install();
  let seen!:()=>void,release!:()=>void;
  const requested=new Promise<void>(resolve=>{seen=resolve;});
  const barrier=new Promise<void>(resolve=>{release=resolve;});
  await page.route("**/api/agent",async route=>{seen();await barrier;await route.fulfill({status:503,json:{error:"late"}}).catch(()=>{});});
  await chat.getByRole("button",{name:"傳送",exact:true}).click();
  await requested;
  try {
    await page.clock.fastForward(59_000);
    await expect(chat.getByRole("button",{name:"取消 AI 執行"})).toBeVisible();
    await page.clock.fastForward(1000);
    await expect(chat.getByRole("status")).toContainText("AI 未完成");
    await expect(page.getByRole("region",{name:"餐單提案預覽"})).toHaveCount(0);
    await expect(chat.getByRole("button",{name:"重試 AI"})).toBeEnabled();
  } finally {release();}
});
