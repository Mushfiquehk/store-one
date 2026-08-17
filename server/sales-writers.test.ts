import { after, test } from "node:test";
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
  const { db } = await import("./db");
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
  }
});

test("sales that only ever existed as blobs are promoted once, and the total then holds", async t => {
  if (!DATABASE_URL) {
    t.skip("set DATABASE_URL to a throwaway Postgres to run the sales-writer tests");
    return;
  }

  const { initDb } = await import("./init-db");
  const { db } = await import("./db");
  const { storage, adminStorage } = await import("./storage");
  const { backfillSyncedSales } = await import("./backfill-sales");
  const { adminSales, syncRecords } = await import("./schema");
  const { eq, and, inArray } = await import("drizzle-orm");
  await initDb();

  const OLD = { ...SALE, id: "twow_old1" };
  const VOIDED = { ...SALE, id: "twow_old2", totalCents: 900 };
  const ids = [OLD.id, VOIDED.id];

  const revenue = async () =>
    ((await adminStorage.listSales()) as Array<{ id: string; totalCents: number }>)
      .filter(s => ids.includes(s.id))
      .reduce((total, s) => total + s.totalCents, 0);

  try {
    const client = await storage.getOrCreateClient("backfill-test", "Backfill Test");
    await db.delete(adminSales).where(inArray(adminSales.id, ids));
    await db.delete(syncRecords).where(
      and(eq(syncRecords.clientId, client.id), eq(syncRecords.tableName, "sales")),
    );

    // An install from before Feature 26: real sales, blob only, nothing in admin_sales.
    await db.insert(syncRecords).values([
      { clientId: client.id, tableName: "sales", recordId: OLD.id, data: OLD, updatedAt: OLD.updatedAt, deletedAt: null },
      { clientId: client.id, tableName: "sales", recordId: VOIDED.id, data: VOIDED, updatedAt: VOIDED.updatedAt, deletedAt: 1_700_000_600_000 },
    ]);
    assert.equal(await revenue(), 0, "before the backfill this revenue is invisible");

    // The count is global (other blobs may be lying around), so assert on these two rows.
    const first = await backfillSyncedSales();
    assert.ok(first.promoted >= 2, `expected these two to be promoted, saw ${first.promoted}`);
    const promotedRows = await db.select().from(adminSales).where(inArray(adminSales.id, ids));
    assert.equal(promotedRows.length, 2, "both blob-only sales are rows now");
    assert.equal(await revenue(), 433, "the live sale is counted; the voided one is not");

    const voidedRow = await db.select().from(adminSales).where(eq(adminSales.id, VOIDED.id));
    assert.equal(voidedRow.length, 1, "a voided sale is promoted as a soft-deleted row, not dropped");
    assert.equal(voidedRow[0].deletedAt, 1_700_000_600_000);

    // The check from the plan: same revenue after a restart. Running it again promotes nothing.
    const second = await backfillSyncedSales();
    assert.equal(second.promoted, 0, "idempotent — a second boot moves nothing");
    assert.equal(await revenue(), 433, "and the number does not drift");
  } finally {
    await db.delete(adminSales).where(inArray(adminSales.id, ids));
  }
});

// Both tests share the module-level pool in ./db, so it is closed once here rather than by
// whichever test happens to finish first — that left the second one talking to a dead pool.
after(async () => {
  if (!DATABASE_URL) return;
  const { pool } = await import("./db");
  await pool.end();
});

test("a test order is a visible sale and not revenue", async t => {
  if (!DATABASE_URL) {
    t.skip("set DATABASE_URL to a throwaway Postgres to run the sales-writer tests");
    return;
  }

  const { initDb } = await import("./init-db");
  const { db } = await import("./db");
  const { adminStorage } = await import("./storage");
  const { adminSales } = await import("./schema");
  const { eq } = await import("drizzle-orm");
  const { salesSummary } = await import("../shared/reports");
  await initDb();

  const TEST_ORDER = { ...SALE, id: "twow_test1", totalCents: 5_000, isTestOrder: true };

  try {
    await db.delete(adminSales).where(eq(adminSales.id, TEST_ORDER.id));
    await adminStorage.createSale(TEST_ORDER as unknown as Record<string, unknown>);

    const rows = (await adminStorage.listSales()) as Array<{ id: string; isTestOrder: boolean }>;
    const mine = rows.filter(s => s.id === TEST_ORDER.id);
    assert.equal(mine.length, 1, "visible as a sale — it did happen, and it moved stock");
    assert.equal(mine[0].isTestOrder, true, "and it is marked as what it is");

    // The plan's check: visible, but not revenue. Every report goes through realSales().
    const summary = salesSummary(rows.filter(s => s.id === TEST_ORDER.id));
    assert.equal(summary.totalRevenueCents, 0, "a recipe check is not money the business took");
    assert.equal(summary.totalSales, 0);
  } finally {
    await db.delete(adminSales).where(eq(adminSales.id, TEST_ORDER.id));
  }
});

test("a sale carries the cashier, and no cashier reads back as null rather than blank", async t => {
  if (!DATABASE_URL) {
    t.skip("set DATABASE_URL to a throwaway Postgres to run the sales-writer tests");
    return;
  }

  const { initDb } = await import("./init-db");
  const { db } = await import("./db");
  const { adminStorage } = await import("./storage");
  const { adminSales } = await import("./schema");
  const { eq, inArray } = await import("drizzle-orm");
  await initDb();

  const rung = { ...SALE, id: "twow_attrib1", employeeId: "emp_ana" };
  const unattributed = { ...SALE, id: "twow_attrib2" };
  const ids = [rung.id, unattributed.id];

  try {
    await db.delete(adminSales).where(inArray(adminSales.id, ids));
    await adminStorage.createSale(rung as unknown as Record<string, unknown>);
    await adminStorage.createSale(unattributed as unknown as Record<string, unknown>);

    const rows = (await adminStorage.listSales()) as Array<{ id: string; employeeId: string | null }>;
    const byId = Object.fromEntries(rows.filter(r => ids.includes(r.id)).map(r => [r.id, r]));

    assert.equal(byId[rung.id].employeeId, "emp_ana", "the cashier is on the sale");
    // Null, not "": Feature 12's void attribution and Feature 14's per-employee view both branch
    // on this, and an empty string is a cashier whose name is nothing.
    assert.equal(byId[unattributed.id].employeeId, null);
    assert.equal(rows.filter(r => ids.includes(r.id)).length, 2, "and both render");
  } finally {
    await db.delete(adminSales).where(inArray(adminSales.id, ids));
  }
});
