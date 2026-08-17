import { test } from "node:test";
import assert from "node:assert/strict";

/**
 * Feature 8 T4 is an investigation: what actually happens when the same sale arrives by
 * both of the paths that write sales? This pins the answer, so the re-plumbing that follows
 * changes an observed behaviour rather than an assumed one.
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

test("a synced POS sale never reaches admin_sales, and server reporting cannot see it", async t => {
  if (!DATABASE_URL) {
    t.skip("set DATABASE_URL to a throwaway Postgres to run the sales-writer investigation");
    return;
  }

  const { initDb } = await import("./init-db");
  const { db, pool } = await import("./db");
  const { storage, adminStorage } = await import("./storage");
  const { adminSales, syncRecords } = await import("./schema");
  const { eq, and } = await import("drizzle-orm");
  await initDb();

  try {
    const client = await storage.getOrCreateClient("two-writer-test", "Two Writer Test");
    await db.delete(adminSales).where(eq(adminSales.id, SALE.id));
    await db.delete(syncRecords).where(
      and(eq(syncRecords.clientId, client.id), eq(syncRecords.tableName, "sales")),
    );

    // Path 1: the device syncs the sale, exactly as client/src/lib/sync.ts pushes it.
    await storage.processSyncChanges(client.id, ["sales"], [{
      tableName: "sales",
      recordId: SALE.id,
      data: SALE as unknown as Record<string, unknown>,
      updatedAt: SALE.updatedAt,
      deletedAt: null,
    }], 0);

    const stored = await db.select().from(syncRecords).where(
      and(eq(syncRecords.clientId, client.id), eq(syncRecords.tableName, "sales")),
    );
    assert.equal(stored.length, 1, "the sale is stored as a sync blob");

    // ...and this is the finding: it is nowhere `listSales()` looks, which is admin_sales.
    // Every server-side report — sales-summary, product-mix, menu-margins — reads that table.
    const visible = (await adminStorage.listSales()) as Array<{ id: string }>;
    assert.equal(
      visible.some(s => s.id === SALE.id),
      false,
      "a synced POS sale is invisible to every server-side report",
    );

    // Path 2: the same sale through createSale (POST /api/admin/sales, Feature 7 T2).
    await adminStorage.createSale(SALE as unknown as Record<string, unknown>);
    const afterBoth = (await adminStorage.listSales()) as Array<{ id: string }>;
    assert.equal(
      afterBoth.filter(s => s.id === SALE.id).length,
      1,
      "arriving by both paths yields one admin_sales row plus one orphaned sync blob — not a double count today, but two copies with no owner",
    );

    // The two copies are not connected in either direction: writing one does not touch the other.
    const blobStillThere = await db.select().from(syncRecords).where(
      and(eq(syncRecords.clientId, client.id), eq(syncRecords.tableName, "sales"), eq(syncRecords.recordId, SALE.id)),
    );
    assert.equal(blobStillThere.length, 1, "createSale does not reconcile the sync blob");
  } finally {
    await db.delete(adminSales).where(eq(adminSales.id, SALE.id));
    await pool.end();
  }
});
