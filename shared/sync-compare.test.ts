import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ADMIN_OWNED_TABLES, SYNCED_FIELDS, isAdminOwned, resolveByRecency, resolveConflict,
  sameDeletedState, sameSyncedFields,
} from "./sync-compare";

// An admin row as Drizzle returns it: every column, in schema-definition order, including
// the server-only createdAt.
const adminProduct = {
  id: "p1",
  name: "Latte",
  type: "RESTAURANT",
  isComposite: true,
  availableAsIngredient: false,
  attributes: { tags: ["espresso", "hot"] },
  createdAt: "2026-03-01T00:00:00.000Z",
  updatedAt: 1_700_000_000_000,
  deletedAt: null,
};

test("the old comparison fails on records that are the same record", () => {
  // This is the bug, reproduced. The POS side is the same product as it comes back out of
  // Postgres jsonb and through Dexie: identical values, different key order, and without
  // the server-only column. JSON.stringify says these differ, so the server pushed the
  // admin version back — every menu record, to every client, on every sync, forever.
  const posProduct = {
    type: "RESTAURANT",
    name: "Latte",
    id: "p1",
    attributes: { tags: ["espresso", "hot"] },
    availableAsIngredient: false,
    isComposite: true,
    updatedAt: 1_700_000_000_000,
    deletedAt: null,
  };

  assert.notEqual(JSON.stringify(posProduct), JSON.stringify(adminProduct), "the old test");
  assert.ok(sameSyncedFields("products", posProduct, adminProduct), "the new one");
});

test("a server-only column is never a difference", () => {
  // createdAt today; locationId on ten tables when Feature 3 lands. Neither is something a
  // POS device is expected to know, so neither may make sync think it has work to do.
  const pos = { ...adminProduct } as Record<string, unknown>;
  delete pos.createdAt;
  assert.ok(sameSyncedFields("products", pos, adminProduct));
  assert.ok(sameSyncedFields("products", pos, { ...adminProduct, createdAt: "2020-01-01T00:00:00.000Z" }));
});

test("an absent optional field equals a null one", () => {
  // The concrete case: purchaseUnit and unitsPerPurchase are optional in the Dexie
  // interface but NOT NULL server-side, so a row written before the v10 upgrade has no
  // such keys at all.
  const admin = {
    id: "i1", name: "Whole Milk", unitOfMeasure: "oz", currentQuantity: 128,
    lowStockThreshold: null, lastPurchasePrice: 3, purchaseUnit: null, unitsPerPurchase: 1,
  };
  const pos = { id: "i1", name: "Whole Milk", unitOfMeasure: "oz", currentQuantity: 128, lastPurchasePrice: 3, unitsPerPurchase: 1 };

  assert.ok(sameSyncedFields("inventoryItems", pos, admin));
});

test("a real difference is still a difference", () => {
  assert.equal(sameSyncedFields("products", { ...adminProduct, name: "Flat White" }, adminProduct), false);
  assert.equal(sameSyncedFields("products", { ...adminProduct, isComposite: false }, adminProduct), false);
  assert.equal(
    sameSyncedFields("products", { ...adminProduct, attributes: { tags: ["espresso"] } }, adminProduct),
    false,
    "a changed nested value must not be normalised away",
  );
  assert.equal(
    sameSyncedFields("variants", { id: "v1", basePrice: 425 }, { id: "v1", basePrice: 450 }),
    false,
  );
});

test("nested objects compare by value, not by key order", () => {
  const a = { productId: "p1", modifierGroupId: "g1", scaleFactors: { small: 1, large: 2 } };
  const b = { productId: "p1", modifierGroupId: "g1", scaleFactors: { large: 2, small: 1 } };
  assert.ok(sameSyncedFields("productModifierGroups", a, b));
});

test("a table sync was never told about does not claim agreement", () => {
  // Better to push the admin row than to declare two records equal on fields nobody listed.
  assert.equal(sameSyncedFields("somethingNew", { id: "x" }, { id: "x" }), false);
  assert.equal(sameSyncedFields("products", null, adminProduct), false);
});

test("every synced table names a field list, and every list has an identity", () => {
  for (const [table, fields] of Object.entries(SYNCED_FIELDS)) {
    assert.ok(fields.length > 0, `${table} has no fields`);
    assert.ok(
      fields.includes("id") || table === "productModifierGroups",
      `${table} must compare an identity`,
    );
    assert.ok(!fields.includes("createdAt"), `${table} must not compare a server-only column`);
    assert.ok(!fields.includes("updatedAt"), `${table} compares data, not timestamps`);
  }
});

test("deleted state compares as a flag, not as an equal timestamp", () => {
  // Two devices can soft-delete the same row at different milliseconds; that is agreement,
  // not a conflict.
  assert.ok(sameDeletedState(null, null));
  assert.ok(sameDeletedState(undefined, null));
  assert.ok(sameDeletedState(1700, 1800));
  assert.equal(sameDeletedState(null, 1800), false);
  assert.equal(sameDeletedState(1700, null), false);
});


test("an admin-owned table resolves to admin even when the device edit is newer", () => {
  // The rule that was previously invisible: adminUpdatedAt was read and never compared.
  const pos = { data: { id: "p1", name: "Renamed on the till" }, updatedAt: 9_000, deletedAt: null };
  const admin = { data: { id: "p1", name: "Latte" }, updatedAt: 1_000, deletedAt: null };

  const result = resolveConflict("products", pos, admin);
  assert.equal(result.winner, "admin");
  assert.match(result.reason, /owns this table/);
});

test("agreement is not a conflict, which is the whole point of the feature", () => {
  const row = { id: "p1", name: "Latte", type: "RESTAURANT", isComposite: false, availableAsIngredient: false, attributes: null };
  const result = resolveConflict("products", { data: { ...row }, updatedAt: 5 }, { data: { ...row, createdAt: "x" }, updatedAt: 9 });
  assert.equal(result.winner, "equal", "nothing to push");
});

test("a table with no admin counterpart is last-write-wins, and says so", () => {
  const newer = resolveConflict("sales", { data: { id: "s1", totalCents: 500 }, updatedAt: 200 }, { data: { id: "s1", totalCents: 400 }, updatedAt: 100 });
  assert.equal(newer.winner, "pos");
  assert.match(newer.reason, /newer or equal/);

  const older = resolveConflict("sales", { data: { id: "s1", totalCents: 500 }, updatedAt: 50 }, { data: { id: "s1", totalCents: 400 }, updatedAt: 100 });
  assert.equal(older.winner, "admin", "the stored record stands");
});

test("a missing updatedAt is the oldest thing in the system, not the newest", () => {
  // The bug this pins: sync.ts stamped a record with no updatedAt as Date.now(), so the
  // oldest data in the system won every last-write-wins comparison.
  assert.equal(resolveByRecency({ updatedAt: undefined }, { updatedAt: 1 }).winner, "admin");
  assert.equal(resolveByRecency({ updatedAt: null }, { updatedAt: 1 }).winner, "admin");
  assert.equal(resolveByRecency({ updatedAt: 0 }, { updatedAt: 0 }).winner, "pos", "a tie goes to the incoming record");
});

test("a row with no admin counterpart keeps the device's copy", () => {
  const result = resolveConflict("products", { data: { id: "p_new" }, updatedAt: 5 }, null);
  assert.equal(result.winner, "pos");
});

test("the admin-owned list is the one the client also uses", () => {
  assert.ok(isAdminOwned("products"));
  assert.ok(isAdminOwned("invoiceLineItems"));
  assert.equal(isAdminOwned("sales"), false, "sales are authored on the device");
  // Every admin-owned table must have a field list, or resolveConflict can never see agreement.
  for (const table of ADMIN_OWNED_TABLES) {
    assert.ok(SYNCED_FIELDS[table], `${table} has no field list`);
  }
});
