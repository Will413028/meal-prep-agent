import { hash, hex } from "../session-identity";

export type SessionRow = {
  tokenHash: string; sessionGeneration: string; planId: string; revision: number;
  schemaVersion: number; currentJson: string | null; previousJson: string | null;
  updatedAt: number; expiresAt: number; lastOperationId: string | null; lastOperationHash: string | null;
};
export const sessionLifetime = 30 * 24 * 60 * 60 * 1000;

export interface SessionStore {
  insert(row: SessionRow): Promise<void>;
  find(tokenHash: string, now: number, planId?: string): Promise<SessionRow | null>;
  compareAndSwap(base: SessionRow, next: {currentJson: string; previousJson: string | null}, operationId: string, operationHash: string, now: number): Promise<SessionRow | null>;
  remove(base: SessionRow, now: number): Promise<boolean>;
  purge(now: number): Promise<number>;
}

export async function createSession(store: SessionStore, now: number): Promise<{ token: string; row: SessionRow }> {
  const token = hex(crypto.getRandomValues(new Uint8Array(32)));
  const row: SessionRow = {
    tokenHash: await hash(token), sessionGeneration: crypto.randomUUID(), planId: crypto.randomUUID(),
    revision: 0, schemaVersion: 1, currentJson: null, previousJson: null,
    updatedAt: now, expiresAt: now + sessionLifetime, lastOperationId: null, lastOperationHash: null,
  };
  await store.insert(row);
  return { token, row };
}

export async function readSession(store: SessionStore, token: string | null, now: number, planId?: string): Promise<SessionRow | null> {
  if (token === null || !/^[a-f0-9]{64}$/.test(token)) return null;
  return store.find(await hash(token),now,planId);
}

export async function commitSession(store: SessionStore, base: SessionRow, next: { currentJson: string; previousJson: string | null }, operationId: string, operationHash: string, now: number): Promise<SessionRow | null> {
  return store.compareAndSwap(base,next,operationId,operationHash,now);
}

export async function deleteSession(store: SessionStore, base: SessionRow, now: number): Promise<boolean> {
  return store.remove(base,now);
}

export async function expireSessions(store: SessionStore, now: number): Promise<number> {
  return store.purge(now);
}
