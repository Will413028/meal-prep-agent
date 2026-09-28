import { sessionHttp } from "./http";
import { pythonAgent, pythonBuilder, pythonValidator } from "./python-validator";
import { SQLiteSessionStore } from "./sqlite-store";

let store: SQLiteSessionStore | undefined;

function database(): SQLiteSessionStore {
  if (store) return store;
  const path=process.env.MEAL_DB_PATH;
  if (!path?.startsWith("/")) throw new Error("MEAL_DB_PATH must be absolute");
  store=new SQLiteSessionStore(path);
  const sweep=setInterval(()=>{void store?.purge(Date.now()).catch(()=>{ /* Reads still reject expired rows. */ });},24*60*60*1000);
  sweep.unref();
  return store;
}

export async function handlePersistence(request: Request): Promise<Response> {
  const publicOrigin=process.env.MEAL_PUBLIC_ORIGIN;
  if (!publicOrigin || !/^https?:\/\/[^/]+$/.test(publicOrigin)) return unavailable();
  try {
    const origin=process.env.MEAL_API_ORIGIN;
    return await sessionHttp(request,database(),Date.now,pythonValidator(origin),pythonBuilder(origin),pythonAgent(origin),publicOrigin);
  } catch {return unavailable();}
}

export function storageHealth(): Response {
  try {return database().health() ? new Response("ok") : new Response("unhealthy",{status:503});}
  catch {return new Response("unhealthy",{status:503});}
}

function unavailable(): Response {
  return Response.json({error:"storage_unavailable"},{status:503,headers:{"cache-control":"no-store",vary:"Cookie"}});
}
