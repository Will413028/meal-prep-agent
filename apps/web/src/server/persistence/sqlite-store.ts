import { DatabaseSync } from "node:sqlite";
import { lstatSync } from "node:fs";
import { sessionLifetime, type SessionRow, type SessionStore } from "./sessions";

const columns = ["tokenHash","sessionGeneration","planId","revision","schemaVersion","currentJson","previousJson","updatedAt","expiresAt","lastOperationId","lastOperationHash"];

function validate(db: DatabaseSync): void {
  const version = db.prepare("PRAGMA user_version").get() as {user_version:number};
  if (version.user_version !== 1) throw new Error("Unsupported session database version");
  const actual = (db.prepare("PRAGMA table_info(plan_sessions)").all() as {name:string}[]).map(row=>row.name);
  if (actual.length !== columns.length || actual.some((name,index)=>name!==columns[index])) throw new Error("Unsupported session table layout");
  if ((db.prepare("PRAGMA quick_check").get() as {quick_check:string}).quick_check !== "ok") throw new Error("Session database integrity check failed");
}

export class SQLiteSessionStore implements SessionStore {
  private db: DatabaseSync;
  private identity: {dev:number; ino:number};
  private path: string;

  constructor(path: string) {
    this.path=path;
    const file=lstatSync(path);
    if (!file.isFile()) throw new Error("Session database must be a regular existing file");
    this.identity={dev:file.dev,ino:file.ino};
    const verified=new DatabaseSync(path,{readOnly:true});
    try {validate(verified);} finally {verified.close();}
    this.assertAvailable();
    this.db = new DatabaseSync(path,{timeout:250});
    try {
      this.db.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA trusted_schema=OFF;");
      this.assertAvailable();
      validate(this.db);
      this.purgeExpired(Date.now());
    } catch (error) {this.db.close();throw error;}
  }

  close(): void { this.db.close(); }

  private assertAvailable(): void {
    const file=lstatSync(this.path);
    if (!file.isFile() || file.dev!==this.identity.dev || file.ino!==this.identity.ino) throw new Error("Session database file changed");
  }

  async insert(row: SessionRow): Promise<void> {
    this.assertAvailable();
    this.db.prepare(`INSERT INTO plan_sessions (${columns.join(",")}) VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(
      row.tokenHash,row.sessionGeneration,row.planId,row.revision,row.schemaVersion,row.currentJson,row.previousJson,
      row.updatedAt,row.expiresAt,row.lastOperationId,row.lastOperationHash);
  }

  async find(tokenHash: string, now: number, planId?: string): Promise<SessionRow | null> {
    this.assertAvailable();
    const row = planId === undefined
      ? this.db.prepare("SELECT * FROM plan_sessions WHERE tokenHash=? AND expiresAt>?").get(tokenHash,now)
      : this.db.prepare("SELECT * FROM plan_sessions WHERE tokenHash=? AND expiresAt>? AND planId=?").get(tokenHash,now,planId);
    return row ? row as SessionRow : null;
  }

  async compareAndSwap(base: SessionRow, next: {currentJson: string; previousJson: string | null}, operationId: string, operationHash: string, now: number): Promise<SessionRow | null> {
    this.assertAvailable();
    const row = this.db.prepare(`UPDATE plan_sessions SET currentJson=?, previousJson=?, revision=revision+1, updatedAt=?, expiresAt=?, lastOperationId=?, lastOperationHash=?
      WHERE tokenHash=? AND sessionGeneration=? AND planId=? AND revision=? AND schemaVersion=? AND schemaVersion=1 AND expiresAt>? AND revision<9007199254740991 RETURNING *`)
      .get(next.currentJson,next.previousJson,now,now+sessionLifetime,operationId,operationHash,
        base.tokenHash,base.sessionGeneration,base.planId,base.revision,base.schemaVersion,now);
    return row ? row as SessionRow : null;
  }

  async remove(base: SessionRow, now: number): Promise<boolean> {
    this.assertAvailable();
    const result=this.db.prepare("DELETE FROM plan_sessions WHERE tokenHash=? AND sessionGeneration=? AND planId=? AND expiresAt>?")
      .run(base.tokenHash,base.sessionGeneration,base.planId,now);
    return result.changes===1;
  }

  async purge(now: number): Promise<number> {
    return this.purgeExpired(now);
  }

  private purgeExpired(now: number): number {
    this.assertAvailable();
    return Number(this.db.prepare("DELETE FROM plan_sessions WHERE expiresAt<=?").run(now).changes);
  }

  health(): boolean {
    this.assertAvailable();
    this.db.prepare("SELECT 1 FROM plan_sessions LIMIT 1").get();
    return true;
  }
}
