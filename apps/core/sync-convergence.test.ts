import { test } from "node:test";
import assert from "node:assert/strict";

/**
 * The load-bearing check for Feature 8: sync twice with nothing changed in between and the
 * second round must move nothing. Before T1 this failed for every menu record, forever.
 *
 * This one needs a real Postgres, because the thing under test is `processSyncChanges`
 * talking to real tables — a stub would only prove that a stub converges. Point
 * `DATABASE_URL` at a throwaway database and it runs; without one it skips loudly rather
 * than passing quietly:
 *
 *   docker run -d -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=cornerpos -p 5433:5432 postgres:16-alpine
 *   DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5433/cornerpos npm test
 */
const DATABASE_URL = process.env.DATABASE_URL;

async function connect() {
  const { initDb } = await import("./init-db");
  const { db, pool } = await import("./db");
  const { storage } = await import("./storage");
  const schema = await import("./schema");
  await initDb();
  return { db, pool, storage, schema };
}

// One product, as the admin console owns it.
const ADMIN_PRODUCT = {
  id: "conv_p1",
  name: "Latte",
  type: "RESTAURANT",
  isComposite: false,
  availableAsIngredient: false,
  attributes: { tags: ["espresso"] },
  createdAt: "2026-03-01T00:00:00.000Z",
  updatedAt: 1_700_000_000_000,
  deletedAt: null,
};

// The same product as a device holds it: same values, key order shuffled the way a
// jsonb round-trip shuffles them, and without the server-only column.
const POS_PRODUCT: Record<string, unknown> = {
  attributes: { tags: ["espresso"] },
  availableAsIngredient: false,
  deletedAt: null,
  id: "conv_p1",
  isComposite: false,
  name: "Latte",
  type: "RESTAURANT",
  updatedAt: 1_700_000_000_000,
};

const change = (data: Record<string, unknown>, over: Record<string, unknown> = {}) => ({
  tableName: "products",
  recordId: "conv_p1",
  data,
  updatedAt: (data.updatedAt as number) ?? 0,
  deletedAt: (data.deletedAt as number | null) ?? null,
  ...over,
});

test("sync reaches a fixed point, moves one record when one changes, and handles a delete", async t => {
  if (!DATABASE_URL) {
    t.skip("set DATABASE_URL to a throwaway Postgres to run the convergence test");
    return;
  }

  const { db, pool, storage, schema } = await connect();
  const { adminProducts, syncRecords } = schema;
  const { eq, and } = await import("drizzle-orm");

  try {
    // A clean slate for this test's rows only — and re-runnable, which matters more than it
    // sounds: the client row cannot be deleted while its sync_records reference it, so the
    // client is reused and only its records for this table are cleared.
    await db.delete(adminProducts).where(eq(adminProducts.id, ADMIN_PRODUCT.id));
    await db.insert(adminProducts).values(ADMIN_PRODUCT);
    const client = await storage.getOrCreateClient("conv-test", "Convergence Test");
    await db.delete(syncRecords).where(
      and(eq(syncRecords.clientId, client.id), eq(syncRecords.tableName, "products")),
    );

    // Round one: the device pushes the record it holds.
    const first = await storage.processSyncChanges(client.id, ["products"], [change(POS_PRODUCT)], 0);

    // Round two: nothing changed in between. This is the assertion the whole feature is for.
    const second = await storage.processSyncChanges(
      client.id,
      ["products"],
      [change(POS_PRODUCT)],
      first.syncedAt,
    );
    assert.deepEqual(
      second.serverChanges,
      [],
      "a second sync with no changes must push nothing back — this failed for every menu record before T1",
    );

    // One field changes on the device. Admin owns products, so the admin row is what comes
    // back — but exactly one record moves, not the table.
    await db.insert(adminProducts).values({ ...ADMIN_PRODUCT, id: "conv_p2", name: "Cortado" })
      .onConflictDoNothing();
    const edited = { ...POS_PRODUCT, name: "Renamed on the till", updatedAt: 1_700_000_999_999 };
    const third = await storage.processSyncChanges(
      client.id,
      ["products"],
      [change(edited)],
      second.syncedAt,
    );
    assert.equal(third.serverChanges.length, 1, "one record changed, so one record moves");
    assert.equal(third.serverChanges[0].recordId, "conv_p1");
    assert.equal(
      (third.serverChanges[0].data as Record<string, unknown>).name,
      "Latte",
      "admin owns the menu, so the admin name wins over the newer till edit",
    );

    // And once the device has accepted that, sync is quiet again.
    const fourth = await storage.processSyncChanges(
      client.id,
      ["products"],
      [change(POS_PRODUCT)],
      third.syncedAt,
    );
    assert.deepEqual(fourth.serverChanges, [], "back to a fixed point after a real conflict");

    // The delete path: deletedAt takes part in the comparison, and a soft-delete on both
    // sides is agreement even though the timestamps differ.
    await db.update(adminProducts)
      .set({ deletedAt: 1_700_000_500_000, updatedAt: 1_700_000_500_000 })
      .where(eq(adminProducts.id, ADMIN_PRODUCT.id));
    const deletedOnDevice = { ...POS_PRODUCT, deletedAt: 1_700_000_400_000, updatedAt: 1_700_000_400_000 };
    const fifth = await storage.processSyncChanges(
      client.id,
      ["products"],
      [change(deletedOnDevice)],
      fourth.syncedAt,
    );
    assert.deepEqual(
      fifth.serverChanges,
      [],
      "both sides agree the row is deleted; different timestamps are not a conflict",
    );
  } finally {
    await db.delete(adminProducts).where(eq(adminProducts.id, ADMIN_PRODUCT.id));
    await db.delete(adminProducts).where(eq(adminProducts.id, "conv_p2"));
    await pool.end();
  }
});
