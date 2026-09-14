import "fake-indexeddb/auto";
import { test } from "node:test";
import assert from "node:assert/strict";
import Dexie from "dexie";

/**
 * Feature 36 T1, against a real IndexedDB.
 *
 * The rules themselves are unit-tested in packages/domain/migrations.test.ts.
 * What this file checks is the part only a database can answer: that the
 * upgrade is wired to the right tables and actually runs when a till that has
 * been sitting at an older version is opened.
 *
 * fake-indexeddb is a devDependency for exactly this. A Dexie upgrade is the one
 * kind of code that cannot be reviewed into correctness — either it ran against
 * old rows or it did not.
 */

const DB_NAME = "cornerpos";

/**
 * A till as it was before version 21: rows missing every field the two upgrades
 * since then have added. Seeded at 20 rather than 21 on purpose — Dexie only runs
 * the versions above the one a database is already at, so seeding at 21 would
 * declare Feature 28's channel stamp already applied and quietly skip it.
 */
async function seedOldDatabase() {
  const old = new Dexie(DB_NAME);
  old.version(20).stores({
    inventoryItems: "id, name, updatedAt",
    sales: "id, createdAt, updatedAt, employeeId",
  });
  await old.open();

  await old.table("inventoryItems").bulkPut([
    // Written before Feature 11 existed: neither field is there at all.
    { id: "inv_old", name: "Tomatoes", unitOfMeasure: "oz", currentQuantity: 100, updatedAt: 1, deletedAt: null },
    // A form submitted empty — a case that contains zero units.
    { id: "inv_zero", name: "Oil", unitOfMeasure: "oz", currentQuantity: 10, unitsPerPurchase: 0, purchaseUnit: "", updatedAt: 1, deletedAt: null },
    // Already correct, and must come through untouched.
    { id: "inv_ok", name: "Flour", unitOfMeasure: "oz", currentQuantity: 50, unitsPerPurchase: 128, purchaseUnit: "bag", updatedAt: 1, deletedAt: null },
  ]);

  await old.table("sales").bulkPut([
    // linesJson as a JSON string, which is what version 3 was written to fix.
    { id: "s_string", createdAt: 1, totalCents: 500, linesJson: JSON.stringify([{ variantId: "v1", qty: 2 }]), updatedAt: 1, deletedAt: null },
    // Unreadable. Empty is the honest answer; the totals are their own columns.
    { id: "s_broken", createdAt: 2, totalCents: 700, linesJson: "{not json", updatedAt: 1, deletedAt: null },
    { id: "s_array", createdAt: 3, totalCents: 900, linesJson: [{ variantId: "v2", qty: 1 }], updatedAt: 1, deletedAt: null },
  ]);

  old.close();
}

test("a till sitting at an older version upgrades its rows to the one declaration", async () => {
  await Dexie.delete(DB_NAME);
  await seedOldDatabase();

  // Opening the real PosDatabase is what runs the upgrade.
  const { db } = await import("./db");
  await db.open();

  const items = await db.inventoryItems.toArray();
  assert.equal(items.length, 3);
  for (const item of items) {
    assert.equal(
      typeof item.unitsPerPurchase, "number",
      `${item.id} carries no numeric unitsPerPurchase — the cost of everything made from it is wrong`,
    );
    assert.ok(item.unitsPerPurchase > 0, `${item.id} has a non-positive purchase factor`);
    assert.ok(
      item.purchaseUnit === null || typeof item.purchaseUnit === "string",
      `${item.id} has a purchaseUnit that is neither a label nor null`,
    );
  }

  const byId = new Map(items.map(i => [i.id, i]));
  assert.equal(byId.get("inv_old")!.unitsPerPurchase, 1, "a pre-Feature-11 row did not get the default");
  assert.equal(byId.get("inv_old")!.purchaseUnit, null);
  assert.equal(byId.get("inv_zero")!.unitsPerPurchase, 1, "a zero factor was obeyed rather than corrected");
  assert.equal(byId.get("inv_zero")!.purchaseUnit, null, "an empty label stayed an empty string");
  // The correct row is left exactly alone.
  assert.equal(byId.get("inv_ok")!.unitsPerPurchase, 128);
  assert.equal(byId.get("inv_ok")!.purchaseUnit, "bag");

  const sales = await db.sales.toArray();
  assert.equal(sales.length, 3);
  for (const sale of sales) {
    assert.ok(Array.isArray(sale.linesJson), `${sale.id} still carries linesJson as ${typeof sale.linesJson}`);
  }

  const salesById = new Map(sales.map(s => [s.id, s]));
  assert.deepEqual(salesById.get("s_string")!.linesJson, [{ variantId: "v1", qty: 2 }]);
  assert.deepEqual(salesById.get("s_broken")!.linesJson, []);
  assert.equal(salesById.get("s_broken")!.totalCents, 700, "unreadable lines cost the sale its total");
  assert.deepEqual(salesById.get("s_array")!.linesJson, [{ variantId: "v2", qty: 1 }]);

  // Feature 28 T2's stamp, applied on the way through by version 21. A till that
  // has been closed since before either feature gets both upgrades in one open.
  for (const sale of sales) assert.equal(sale.channelKey, "pos", `${sale.id} came through with no channel`);

  db.close();
});
