import { test } from "node:test";
import assert from "node:assert/strict";
import { createApiHandlers, type ApiAdminStorage, type StoreSetting } from "./api-handlers";

// A storage stub backed by a Map. Only the settings methods are real; everything
// else throws, so a test that accidentally reaches another entity fails loudly.
function stubStore(): ApiAdminStorage {
  const settings = new Map<string, StoreSetting>();
  return new Proxy({
    async listSettings() { return [...settings.values()]; },
    async getSetting(key: string) { return settings.get(key) ?? null; },
    async setSetting(key: string, value: unknown) {
      const row = { key, value, updatedAt: (settings.get(key)?.updatedAt ?? 0) + 1 };
      settings.set(key, row);
      return row;
    },
  }, {
    get(target: Record<string, unknown>, prop: string) {
      if (prop in target) return target[prop];
      return () => { throw new Error(`unexpected storage call: ${prop}`); };
    },
  }) as unknown as ApiAdminStorage;
}

const call = (h: ReturnType<typeof createApiHandlers>, method: string, path: string, body?: unknown) =>
  h.handle({ method, path, params: {}, body });

test("settings round-trip: set, read, overwrite", async () => {
  const h = createApiHandlers(stubStore());

  assert.deepEqual((await call(h, "GET", "/api/settings")).data, { settings: {} });

  const set = await call(h, "PUT", "/api/settings/tax.ratePct", { value: 8.25 });
  assert.equal(set.status, 200);

  const read = await call(h, "GET", "/api/settings/tax.ratePct");
  assert.equal((read.data as { value: unknown }).value, 8.25);
  const firstUpdatedAt = (read.data as { updatedAt: number }).updatedAt;

  await call(h, "PUT", "/api/settings/tax.ratePct", { value: 6 });
  const after = await call(h, "GET", "/api/settings/tax.ratePct");
  assert.equal((after.data as { value: unknown }).value, 6);
  assert.ok((after.data as { updatedAt: number }).updatedAt > firstUpdatedAt, "updatedAt must move");

  // Overwrite must replace, not accumulate.
  assert.deepEqual((await call(h, "GET", "/api/settings")).data, { settings: { "tax.ratePct": 6 } });
});

test("a missing setting reads as null rather than 404", async () => {
  const h = createApiHandlers(stubStore());
  const r = await call(h, "GET", "/api/settings/nope");
  assert.equal(r.status, 200);
  assert.deepEqual(r.data, { value: null, updatedAt: null });
});

test("keys are validated before becoming a primary key", async () => {
  const h = createApiHandlers(stubStore());
  // camelCase is in use today (hoursOfOperation, emailConfig) and must pass.
  assert.equal((await call(h, "PUT", "/api/settings/hoursOfOperation", { value: 1 })).status, 200);

  for (const bad of ["bad key", "x".repeat(65), "drop;table"]) {
    assert.equal((await call(h, "GET", `/api/settings/${bad}`)).status, 400, `expected 400 for ${bad}`);
  }
  // A slash or an empty key never reaches the handler — the router does not match it.
  for (const bad of ["a/b", ""]) {
    assert.notEqual((await call(h, "GET", `/api/settings/${bad}`)).status, 200, `expected non-200 for ${bad}`);
  }
});

test("PUT without a value is rejected", async () => {
  const h = createApiHandlers(stubStore());
  assert.equal((await call(h, "PUT", "/api/settings/foo", {})).status, 400);
});
