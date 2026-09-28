import type { D1Database } from "@cloudflare/workers-types";
import { sessionLifetime, type SessionRow, type SessionStore } from "./sessions";

// Kept for migration parity tests. Production no longer binds D1.
export class D1SessionStore implements SessionStore {
  constructor(private db: D1Database) {}

  async insert(row: SessionRow): Promise<void> {
    await this.db.prepare("INSERT INTO plan_sessions (tokenHash,sessionGeneration,planId,revision,schemaVersion,currentJson,previousJson,updatedAt,expiresAt,lastOperationId,lastOperationHash) VALUES (?,?,?,0,1,NULL,NULL,?,?,NULL,NULL)")
      .bind(row.tokenHash,row.sessionGeneration,row.planId,row.updatedAt,row.expiresAt).run();
  }

  find(tokenHash: string, now: number, planId?: string): Promise<SessionRow | null> {
    return this.db.prepare("SELECT * FROM plan_sessions WHERE tokenHash = ? AND expiresAt > ? AND (? IS NULL OR planId = ?)")
      .bind(tokenHash,now,planId ?? null,planId ?? null).first<SessionRow>();
  }

  async compareAndSwap(base: SessionRow, next: {currentJson: string; previousJson: string | null}, operationId: string, operationHash: string, now: number): Promise<SessionRow | null> {
    const result = await this.db.prepare(`UPDATE plan_sessions SET currentJson=?, previousJson=?, revision=revision+1, updatedAt=?, expiresAt=?, lastOperationId=?, lastOperationHash=?
      WHERE tokenHash=? AND sessionGeneration=? AND planId=? AND revision=? AND schemaVersion=? AND schemaVersion=1 AND expiresAt>? AND revision<9007199254740991 RETURNING *`)
      .bind(next.currentJson,next.previousJson,now,now+sessionLifetime,operationId,operationHash,
        base.tokenHash,base.sessionGeneration,base.planId,base.revision,base.schemaVersion,now).run<SessionRow>();
    if (result.meta.changes === 0) return null;
    if (result.meta.changes !== 1 || result.results.length !== 1) throw new Error("Unexpected D1 CAS result");
    return result.results[0];
  }

  async remove(base: SessionRow, now: number): Promise<boolean> {
    const result = await this.db.prepare("DELETE FROM plan_sessions WHERE tokenHash=? AND sessionGeneration=? AND planId=? AND expiresAt>?")
      .bind(base.tokenHash,base.sessionGeneration,base.planId,now).run();
    return result.meta.changes === 1;
  }

  async purge(now: number): Promise<number> {
    const result = await this.db.prepare("DELETE FROM plan_sessions WHERE expiresAt<=?").bind(now).run();
    return result.meta.changes;
  }
}
