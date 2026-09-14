import { test, after } from "node:test";
import assert from "node:assert/strict";

/**
 * Feature 28 T1: the channel registry, against a real Postgres.
 *
 * The rules themselves are unit-tested in packages/domain/channels.test.ts with
 * no database in sight. What this file checks is the part that only a real
 * database can answer: that a fresh one comes up with the till's channel already
 * in it, and that the handlers refuse to remove it.
 *
 *   docker run -d -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=cornerpos -p 5433:5432 postgres:16-alpine
 *   DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5433/cornerpos npm test
 */
const DATABASE_URL = process.env.DATABASE_URL;

/**
 * The pg pool is a module-level singleton, so it is closed once for the file
 * rather than once per test — the first `pool.end()` would otherwise leave every
 * later test in the file talking to a pool that has already been shut.
 */
let openPool: { end: () => Promise<void> } | null = null;
after(async () => { await openPool?.end(); });

async function connect() {
  const { initDb } = await import("./init-db");
  const { pool } = await import("./db");
  openPool = pool;
  const { createApiHandlers } = await import("../../packages/domain/api-handlers");
  const { channelStorage } = await import("./storage");
  await initDb();
  // Only the channel half of the adapter is needed here; the handlers reach for
  // nothing else on these five routes.
  const handlers = createApiHandlers({
    listChannels: () => channelStorage.list(),
    getChannel: (key: string) => channelStorage.get(key),
    createChannel: (d: Record<string, unknown>) => channelStorage.create(d),
    updateChannel: (key: string, d: Record<string, unknown>) => channelStorage.update(key, d),
    deleteChannel: (key: string) => channelStorage.delete(key),
  } as never);
  const call = (method: string, path: string, body?: unknown, params: Record<string, string> = {}) =>
    handlers.handle({ method, path, params, body });
  return { call, channelStorage };
}

test("a fresh database has the till's channel, and nothing can delete it", async t => {
  if (!DATABASE_URL) {
    t.skip("set DATABASE_URL to a throwaway Postgres to run the channel registry test");
    return;
  }
  const { call } = await connect();
  {
    const listed = await call("GET", "/api/admin/channels");
    assert.equal(listed.status, 200);
    const rows = listed.data as { key: string; kind: string; active: boolean }[];

    const pos = rows.find(r => r.key === "pos");
    assert.ok(pos, "a fresh database has no 'pos' channel — initDb did not seed it");
    assert.equal(pos.kind, "pos");
    assert.equal(pos.active, true);

    // Deleting it is refused by the rule, not by a foreign key that happens to
    // be in the way: the message has to say why.
    const deleted = await call("DELETE", "/api/admin/channels/pos", undefined, { key: "pos" });
    assert.equal(deleted.status, 409);
    assert.match((deleted.data as { error: string }).error, /cannot be deleted/);

    // And it is still there afterwards.
    const after = await call("GET", "/api/admin/channels/pos", undefined, { key: "pos" });
    assert.equal(after.status, 200);

    // Nor can it be deactivated or re-kinded.
    const off = await call("PUT", "/api/admin/channels/pos", { active: false }, { key: "pos" });
    assert.equal(off.status, 400);
    assert.match((off.data as { error: string }).error, /cannot be deactivated/);
  }
});

test("a storefront channel can be added, edited, and withdrawn", async t => {
  if (!DATABASE_URL) {
    t.skip("set DATABASE_URL to a throwaway Postgres to run the channel registry test");
    return;
  }
  const { call, channelStorage } = await connect();
  const key = `t${Date.now().toString(36)}`;
  {
    const created = await call("POST", "/api/admin/channels", { key, name: "The shop", kind: "storefront" });
    assert.equal(created.status, 200, JSON.stringify(created.data));
    assert.equal((created.data as { active: boolean }).active, true);

    // A second create on the same key would silently rewrite a live channel.
    const dupe = await call("POST", "/api/admin/channels", { key, name: "Other", kind: "storefront" });
    assert.equal(dupe.status, 409);

    const renamed = await call("PUT", `/api/admin/channels/${key}`, { name: "Renamed" }, { key });
    assert.equal(renamed.status, 200);
    assert.equal((renamed.data as { name: string }).name, "Renamed");

    // A key is the identity. An edit carrying a different one is refused rather
    // than quietly applied or quietly ignored.
    const moved = await call("PUT", `/api/admin/channels/${key}`, { key: "somewhere-else" }, { key });
    assert.equal(moved.status, 400);
    assert.match((moved.data as { error: string }).error, /cannot be changed/);

    const gone = await call("DELETE", `/api/admin/channels/${key}`, undefined, { key });
    assert.equal(gone.status, 200);
    assert.equal(await channelStorage.get(key), null, "a deleted channel still reads back");

    // Withdrawn, not erased: the row survives for the sales that name it.
    const listedWithDeleted = await call("GET", "/api/admin/channels");
    assert.ok(
      !(listedWithDeleted.data as { key: string }[]).some(r => r.key === key),
      "a withdrawn channel is still listed",
    );
  }
});
