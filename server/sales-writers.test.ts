import { test } from "node:test";
import assert from "node:assert/strict";

/**
 * Sales have one owner: the admin_sales row (SALES_OWNER, shared/sync-compare.ts).
 *
 * Feature 8 T4 found — and this file used to assert — that a POS sale which synced was
 * stored only as a syncRecords blob, so `listSales()` and every report built on it were
 * blind to it. Feature 26 T2 lands the row. These tests are the same investigation,
 * re-pointed at the behaviour that replaced it.
 *
 * Needs a real Postgres — see server/sync-convergence.test.ts for the one-liner.
 */
const DATABASE_URL = process.env.DATABASE_URL;

const SALE = {
  id: "twow_s1",
  createdAt: 1_700_000_000_000,
  subtotalCents: 400,
  taxCents: 33,
  totalCents: 433,
  comboDiscountCents: 0,
  paymentMethod: "Cash",
  status: "completed",
  customerName: "",
  linesJson: [{ variantId: "v1", productId: "p1", productName: "Latte", variantName: "Small", qty: 1, unitPrice: 400 }],
  closedAt: null,
  updatedAt: 1_700_000_000_000,
  deletedAt: null,
};

test("a synced POS sale lands as a row, so server reporting can see it", async t => {
  if (!DATABASE_URL) {
    t.skip("set DATABASE_URL to a throwaway Postgres to run the sales-writer tests");
    return;
  }

  const { initDb } = await import("./init-db");
  const { db, pool } = await import("./db");
  const { storage, adminStorage } = await import("./storage");
  const { adminSales, syncRecords } = await import("./schema");
  const { eq, and } = await import("drizzle-orm");
  await initDb();

  const syncSale = (client: { id: number }, over: Record<string, unknown> = {}) =>
    storage.processSyncChanges(client.id, ["sales"], [{
      tableName: "sales",
      recordId: SALE.id,
      data: { ...SALE, ...over } as unknown as Record<string, unknown>,
      updatedAt: (over.updatedAt as number) ?? SALE.updatedAt,
      deletedAt: (over.deletedAt as number | null) ?? null,
    }], 0);

  try {
    const client = await storage.getOrCreateClient("two-writer-test", "Two Writer Test");
    await db.delete(adminSales).where(eq(adminSales.id, SALE.id));
    await db.delete(syncRecords).where(
      and(eq(syncRecords.clientId, client.id), eq(syncRecords.tableName, "sales")),
    );

    // The device syncs the sale, exactly as client/src/lib/sync.ts pushes it.
    await syncSale(client);

    const visible = (await adminStorage.listSales()) as Array<{ id: string; totalCents: number }>;
    const landed = visible.filter(sale => sale.id === SALE.id);
    assert.equal(landed.length, 1, "the sale is a real row now, not only a sync blob");
    assert.equal(landed[0].totalCents, 433, "with the money it was rung for");

    // The blob is still there, because that is what lastSyncedAt windows read.
    const blob = await db.select().from(syncRecords).where(
      and(eq(syncRecords.clientId, client.id), eq(syncRecords.tableName, "sales"), eq(syncRecords.recordId, SALE.id)),
    );
    assert.equal(blob.length, 1, "the blob stays as sync bookkeeping");

    // Syncing the same sale again must not duplicate the revenue.
    await syncSale(client);
    const afterTwice = (await adminStorage.listSales()) as Array<{ id: string }>;
    assert.equal(
      afterTwice.filter(sale => sale.id === SALE.id).length,
      1,
      "createSale is idempotent on id: one sale, one row, however many times it syncs",
    );

    // A sale the device voided must not come back to life as a live row.
    await syncSale(client, { deletedAt: 1_700_000_500_000, updatedAt: 1_700_000_500_000 });
    const afterDelete = (await adminStorage.listSales()) as Array<{ id: string }>;
    assert.equal(
      afterDelete.some(sale => sale.id === SALE.id),
      false,
      "listSales excludes it once the device says it is deleted",
    );
    const row = await db.select().from(adminSales).where(eq(adminSales.id, SALE.id));
    assert.equal(row.length, 1, "soft-deleted, not destroyed — the books keep the record");
    assert.equal(row[0].deletedAt, 1_700_000_500_000);
  } finally {
    await db.delete(adminSales).where(eq(adminSales.id, SALE.id));
    await pool.end();
  }
});
