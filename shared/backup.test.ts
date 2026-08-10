import { test } from "node:test";
import assert from "node:assert/strict";
import { planRestore, describeRestore, redactSettingsRows, mergeRestoredSettings } from "./backup";
import { SECRET_SET_MARKER } from "./schema";

const TABLES = ["products", "variants", "sales", "combos", "invoices"];

test("a snapshot missing a table leaves that table alone", () => {
  // The bug this exists to prevent: restore cleared all ten tables, then wrote back
  // only the keys that were present. A menu-only snapshot deleted the sales history.
  const plan = planRestore({ products: [{ id: "p1" }] }, TABLES);
  assert.deepEqual(plan.errors, []);
  assert.deepEqual(plan.restore, ["products"]);
  assert.ok(plan.untouched.includes("sales"), "sales must not be cleared");
  assert.ok(plan.untouched.includes("combos"));
});

test("an explicit empty array means 'no rows' and does clear", () => {
  const plan = planRestore({ products: [{ id: "p1" }], sales: [] }, TABLES);
  assert.deepEqual(plan.errors, []);
  assert.deepEqual(plan.restore, ["products", "sales"]);
  assert.ok(!plan.untouched.includes("sales"));
});

test("'sales: []' and a missing sales key must behave differently", () => {
  const withEmpty = planRestore({ sales: [] }, TABLES);
  const without = planRestore({ products: [] }, TABLES);
  assert.ok(withEmpty.restore.includes("sales"));
  assert.ok(!without.restore.includes("sales"));
});

test("a snapshot that is not an object is rejected before anything is cleared", () => {
  for (const bad of [null, undefined, 42, "snapshot", [1, 2, 3]]) {
    const plan = planRestore(bad, TABLES);
    assert.ok(plan.errors.length > 0, `expected rejection for ${JSON.stringify(bad)}`);
    assert.deepEqual(plan.restore, [], "nothing may be restored from an invalid snapshot");
  }
});

test("unknown table keys abort the whole restore", () => {
  const plan = planRestore({ products: [], mystery: [] }, TABLES);
  assert.ok(plan.errors.some(e => e.includes("mystery")));
  // Partial understanding must not clear the tables it did parse.
  assert.deepEqual(plan.restore, []);
});

test("non-array values abort the restore", () => {
  const plan = planRestore({ products: { id: "p1" } }, TABLES);
  assert.ok(plan.errors.length > 0);
  assert.deepEqual(plan.restore, []);
});

test("an empty snapshot restores nothing rather than wiping everything", () => {
  const plan = planRestore({}, TABLES);
  assert.ok(plan.errors.length > 0);
  assert.deepEqual(plan.restore, []);
});

test("the confirmation names the row counts about to be replaced", () => {
  const plan = planRestore({ products: [], sales: [] }, TABLES);
  const msg = describeRestore(plan, { products: 38, sales: 412 });
  assert.match(msg, /412 sales/);
  assert.match(msg, /38 products/);
  // Largest first, so the scariest number leads.
  assert.ok(msg.indexOf("412 sales") < msg.indexOf("38 products"));
});

test("the confirmation is honest when there is nothing to lose", () => {
  const plan = planRestore({ products: [] }, TABLES);
  assert.match(describeRestore(plan, { products: 0 }), /no data to replace/);
});

test("a snapshot carries no credential, and restoring one does not wipe the live value", () => {
  const stored = [
    { key: "emailConfig", value: { host: "smtp.example.com", user: "owner@example.com", password: "s3cret" }, updatedAt: 5 },
    { key: "tax.ratePct", value: 8.25, updatedAt: 5 },
  ];

  const snapshot = redactSettingsRows(stored);
  assert.ok(!JSON.stringify(snapshot).includes("s3cret"), "credential left the device");
  // Everything else in the settings table still travels.
  assert.equal((snapshot[1] as { value: unknown }).value, 8.25);
  assert.deepEqual((snapshot[0] as { value: Record<string, unknown> }).value.host, "smtp.example.com");
  assert.equal((snapshot[0] as { value: Record<string, unknown> }).value.password, SECRET_SET_MARKER);
  assert.equal((snapshot[0] as { updatedAt: number }).updatedAt, 5, "the row is otherwise intact");

  // Restoring that snapshot onto a device with a working password keeps it.
  const merged = mergeRestoredSettings(snapshot, [
    { key: "emailConfig", value: { host: "old.example.com", password: "device-pw" }, updatedAt: 9 },
  ]);
  const email = (merged[0] as { value: Record<string, unknown> }).value;
  assert.equal(email.password, "device-pw");
  assert.equal(email.host, "smtp.example.com", "non-secret fields are still restored");

  // A device with no password stored ends up with no password, not the marker.
  const fresh = (mergeRestoredSettings(snapshot, [])[0] as { value: Record<string, unknown> }).value;
  assert.ok(!("password" in fresh), `marker survived restore: ${JSON.stringify(fresh)}`);
});

test("rows that are not settings rows pass through untouched", () => {
  const junk = [null, 42, { value: "no key" }];
  assert.deepEqual(redactSettingsRows(junk), junk);
  assert.deepEqual(mergeRestoredSettings(junk, junk), junk);
});
