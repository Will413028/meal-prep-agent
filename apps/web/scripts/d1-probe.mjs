// Synthetic local binding smoke. No remote database or product persistence.
import assert from "node:assert/strict";
import { Miniflare } from "miniflare";

const worker = new Miniflare({
  telemetry: { enabled: false },
  workers: [{ config: {
    name: "meal-prep-d1-probe",
    compatibilityDate: "2026-09-28",
    manifest: { mainModule: "probe.mjs", modules: {
      "probe.mjs": { type: "esm", contents: "export default { fetch() { return new Response('synthetic probe'); } }" },
    } },
    env: { DB: { type: "d1", id: "meal-prep-synthetic-probe" } },
  } }],
});
try {
  const database = await worker.getD1Database("DB");
  await database.exec("CREATE TABLE probe (id INTEGER PRIMARY KEY, marker TEXT NOT NULL)");
  await database.prepare("INSERT INTO probe (id, marker) VALUES (?, ?)").bind(1, "synthetic").run();
  assert.deepEqual(await database.prepare("SELECT id, marker FROM probe WHERE id = ?").bind(1).first(), { id: 1, marker: "synthetic" });
  assert.equal(await database.prepare("SELECT marker FROM probe WHERE id = ?").bind(2).first(), null);
  console.log("Local D1 binding: prepared write/read and missing-row checks passed (synthetic, ephemeral).");
} finally {
  await worker.dispose();
}
