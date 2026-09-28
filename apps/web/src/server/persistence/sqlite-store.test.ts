import { mkdtemp, rm, readFile, stat, writeFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { SQLiteSessionStore } from "./sqlite-store";
import { commitSession, createSession, deleteSession, readSession, sessionLifetime } from "./sessions";

const now = Date.UTC(2026,9,1);

async function initializedDatabase(path:string): Promise<void> {
  const migration=await readFile(new URL("../../../../../deploy/migrations/0001_plan_sessions.sql",import.meta.url),"utf8");
  const db=new DatabaseSync(path);
  try {db.exec(migration);db.exec("PRAGMA user_version=1");}
  finally {db.close();}
}

test("SQLite refuses a missing or uninitialized volume without creating session data",async()=>{
  const dir=await mkdtemp(join(tmpdir(),"meal-prep-sqlite-"));
  const missing=join(dir,"missing.sqlite3");
  const empty=join(dir,"empty.sqlite3");
  try {
    expect(()=>new SQLiteSessionStore(missing)).toThrow();
    expect(await stat(missing).catch(()=>null)).toBeNull();
    await writeFile(empty,"");
    expect(()=>new SQLiteSessionStore(empty)).toThrow();
    expect((await readFile(empty)).byteLength).toBe(0);
  } finally {await rm(dir,{recursive:true,force:true});}
});

test("SQLite removes expired rows on startup after an interrupted cleanup schedule",async()=>{
  const dir=await mkdtemp(join(tmpdir(),"meal-prep-sqlite-"));
  const path=join(dir,"plan.sqlite3");
  try {
    await initializedDatabase(path);
    const raw=new DatabaseSync(path);
    raw.prepare("INSERT INTO plan_sessions VALUES (?,?,?,?,?,?,?,?,?,?,?)").run("a".repeat(64),"generation","plan",0,1,null,null,1,Date.now()-1,null,null);
    raw.close();
    const store=new SQLiteSessionStore(path);
    store.close();
    const checked=new DatabaseSync(path,{readOnly:true});
    expect((checked.prepare("SELECT COUNT(*) AS count FROM plan_sessions").get() as {count:number}).count).toBe(0);
    checked.close();
  } finally {await rm(dir,{recursive:true,force:true});}
});

test("a competing writer fails promptly instead of stalling Web and SSE for seconds",async()=>{
  const dir=await mkdtemp(join(tmpdir(),"meal-prep-sqlite-"));
  const path=join(dir,"plan.sqlite3");
  try {
    await initializedDatabase(path);
    const store=new SQLiteSessionStore(path);
    const lock=new DatabaseSync(path);
    try {
      lock.exec("BEGIN IMMEDIATE");
      const started=performance.now();
      await expect(createSession(store,now)).rejects.toThrow();
      expect(performance.now()-started).toBeLessThan(1000);
    } finally {lock.exec("ROLLBACK");lock.close();store.close();}
  } finally {await rm(dir,{recursive:true,force:true});}
});

test("SQLite preserves the exact session after restart and admits one atomic CAS winner",async()=>{
  const dir=await mkdtemp(join(tmpdir(),"meal-prep-sqlite-"));
  const path=join(dir,"plan.sqlite3");
  try {
    await initializedDatabase(path);
    const first=new SQLiteSessionStore(path);
    const {token,row}=await createSession(first,now);
    expect(await readSession(first,token,now)).toEqual(row);
    const results=await Promise.all([
      commitSession(first,row,{currentJson:'{"synthetic":"A"}',previousJson:null},"op-a","hash-a",now+1),
      commitSession(first,row,{currentJson:'{"synthetic":"B"}',previousJson:null},"op-b","hash-b",now+1),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
    const saved=results.find(Boolean)!;
    first.close();
    const reopened=new SQLiteSessionStore(path);
    expect(await readSession(reopened,token,now+1)).toEqual(saved);
    expect(await readSession(reopened,token,now+sessionLifetime+2)).toBeNull();
    reopened.close();
  } finally {await rm(dir,{recursive:true,force:true});}
});

test("SQLite rejects a stale, foreign, expired or cleared base without changing another row",async()=>{
  const dir=await mkdtemp(join(tmpdir(),"meal-prep-sqlite-"));
  try {
    const path=join(dir,"plan.sqlite3");
    await initializedDatabase(path);
    const store=new SQLiteSessionStore(path);
    const a=await createSession(store,now);
    const b=await createSession(store,now);
    const next={currentJson:'{"synthetic":true}',previousJson:null};
    for (const bad of [{...a.row,tokenHash:b.row.tokenHash},{...a.row,sessionGeneration:b.row.sessionGeneration},{...a.row,planId:b.row.planId},{...a.row,revision:1},{...a.row,schemaVersion:99}]) {
      expect(await commitSession(store,bad,next,"op","hash",now)).toBeNull();
    }
    expect(await commitSession(store,a.row,next,"op","hash",now+sessionLifetime)).toBeNull();
    expect(await deleteSession(store,a.row,now)).toBe(true);
    expect(await commitSession(store,a.row,next,"op","hash",now)).toBeNull();
    expect(await readSession(store,b.token,now)).toEqual(b.row);
    store.close();
  } finally {await rm(dir,{recursive:true,force:true});}
});
