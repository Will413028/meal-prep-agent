import type { D1Database } from "@cloudflare/workers-types";

export type SessionRow = {
  tokenHash: string; sessionGeneration: string; planId: string; revision: number;
  schemaVersion: number; currentJson: string | null; previousJson: string | null;
  updatedAt: number; expiresAt: number; lastOperationId: string | null; lastOperationHash: string | null;
};
export const sessionLifetime = 30 * 24 * 60 * 60 * 1000;

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, value => value.toString(16).padStart(2, "0")).join("");
}

export async function hash(value: string): Promise<string> {
  return hex(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))));
}

export async function createSession(db: D1Database, now: number): Promise<{ token: string; row: SessionRow }> {
  const token = hex(crypto.getRandomValues(new Uint8Array(32)));
  const row: SessionRow = {
    tokenHash: await hash(token), sessionGeneration: crypto.randomUUID(), planId: crypto.randomUUID(),
    revision: 0, schemaVersion: 1, currentJson: null, previousJson: null,
    updatedAt: now, expiresAt: now + sessionLifetime, lastOperationId: null, lastOperationHash: null,
  };
  await db.prepare("INSERT INTO plan_sessions (tokenHash,sessionGeneration,planId,revision,schemaVersion,currentJson,previousJson,updatedAt,expiresAt,lastOperationId,lastOperationHash) VALUES (?,?,?,0,1,NULL,NULL,?,?,NULL,NULL)")
    .bind(row.tokenHash, row.sessionGeneration, row.planId, now, row.expiresAt).run();
  return { token, row };
}

export async function readSession(db: D1Database, token: string | null, now: number, planId?: string): Promise<SessionRow | null> {
  if (token === null || !/^[a-f0-9]{64}$/.test(token)) return null;
  return db.prepare("SELECT * FROM plan_sessions WHERE tokenHash = ? AND expiresAt > ? AND (? IS NULL OR planId = ?)")
    .bind(await hash(token), now, planId ?? null, planId ?? null).first<SessionRow>();
}

export async function commitSession(db: D1Database, base: SessionRow, next: { currentJson: string; previousJson: string | null }, operationId: string, operationHash: string, now: number): Promise<SessionRow | null> {
  const result = await db.prepare(`UPDATE plan_sessions SET currentJson=?, previousJson=?, revision=revision+1, updatedAt=?, expiresAt=?, lastOperationId=?, lastOperationHash=?
    WHERE tokenHash=? AND sessionGeneration=? AND planId=? AND revision=? AND schemaVersion=? AND schemaVersion=1 AND expiresAt>? AND revision<9007199254740991 RETURNING *`)
    .bind(next.currentJson, next.previousJson, now, now+sessionLifetime, operationId, operationHash,
      base.tokenHash, base.sessionGeneration, base.planId, base.revision, base.schemaVersion, now).run<SessionRow>();
  if (result.meta.changes === 0) return null;
  if (result.meta.changes !== 1 || result.results.length !== 1) throw new Error("Unexpected D1 CAS result");
  return result.results[0];
}

export async function deleteSession(db: D1Database, base: SessionRow, now: number): Promise<boolean> {
  const result = await db.prepare("DELETE FROM plan_sessions WHERE tokenHash=? AND sessionGeneration=? AND planId=? AND expiresAt>?")
    .bind(base.tokenHash, base.sessionGeneration, base.planId, now).run();
  return result.meta.changes === 1;
}

export async function expireSessions(db: D1Database, now: number): Promise<number> {
  const result = await db.prepare("DELETE FROM plan_sessions WHERE expiresAt<=?").bind(now).run();
  return result.meta.changes;
}
