import { test } from "node:test";
import assert from "node:assert/strict";
import { createApiHandlers, type ApiAdminStorage, type StoreSetting } from "./api-handlers";
import { DEFAULT_TENDER_METHODS, SECRET_SETTING_FIELDS, SECRET_SET_MARKER, TENDER_METHODS_KEY, tenderMethods } from "./schema";

// A storage stub backed by a Map. Only the settings methods are real; everything
// else throws, so a test that accidentally reaches another entity fails loudly.
function stubStore(): ApiAdminStorage {
  const settings = new Map<string, StoreSetting>();
  return new Proxy({
    // Exposed so a test can assert on what was *stored* — the API deliberately
    // never returns a secret, so there is no other way to check it survived a save.
    __settings: settings,
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

const call = (h: ReturnType<typeof createApiHandlers>, method: string, path: string, body?: unknown, query?: Record<string, string>) =>
  h.handle({ method, path, params: {}, query, body });

// A store whose only real method is listSales, for the report endpoints.
function salesStore(sales: unknown[]): ApiAdminStorage {
  return new Proxy({ async listSales() { return sales; } } as Record<string, unknown>, {
    get(target: Record<string, unknown>, prop: string) {
      if (prop in target) return target[prop];
      return () => { throw new Error(`unexpected storage call: ${prop}`); };
    },
  }) as unknown as ApiAdminStorage;
}

const line = { variantId: "v1", productId: "p1", productName: "Latte", variantName: "Small", qty: 1, unitPrice: 425 };
const twoDays = [
  { createdAt: new Date(2026, 2, 1, 9).getTime(), totalCents: 425, taxCents: 25, linesJson: [line] },
  { createdAt: new Date(2026, 2, 5, 9).getTime(), totalCents: 900, taxCents: 50, linesJson: [line, line] },
];

test("?since= actually narrows sales-summary rather than being ignored", async () => {
  const h = createApiHandlers(salesStore(twoDays));

  const all = (await call(h, "GET", "/api/reports/sales-summary")).data as { totalSales: number; totalRevenueCents: number };
  assert.deepEqual([all.totalSales, all.totalRevenueCents], [2, 1325]);

  const since = String(new Date(2026, 2, 3).getTime());
  const windowed = (await call(h, "GET", "/api/reports/sales-summary", undefined, { since })).data as { totalSales: number; totalRevenueCents: number };
  assert.deepEqual([windowed.totalSales, windowed.totalRevenueCents], [1, 900]);
});

test("?granularity= reaches the series, and the series sums to the scalars", async () => {
  const h = createApiHandlers(salesStore(twoDays));

  const daily = (await call(h, "GET", "/api/reports/sales-summary", undefined, { granularity: "daily" })).data as { series: Array<{ revenueCents: number }> };
  assert.equal(daily.series.length, 2);

  const monthly = (await call(h, "GET", "/api/reports/sales-summary", undefined, { granularity: "monthly" })).data as { series: Array<{ revenueCents: number }>; totalRevenueCents: number };
  assert.equal(monthly.series.length, 1);
  assert.equal(monthly.series[0].revenueCents, monthly.totalRevenueCents);
});

test("?since= narrows product-mix too", async () => {
  const h = createApiHandlers(salesStore(twoDays));

  const all = (await call(h, "GET", "/api/reports/product-mix")).data as Array<{ quantity: number }>;
  assert.equal(all[0].quantity, 3);

  const since = String(new Date(2026, 2, 3).getTime());
  const windowed = (await call(h, "GET", "/api/reports/product-mix", undefined, { since })).data as Array<{ quantity: number }>;
  assert.equal(windowed[0].quantity, 2);
});

test("an unparseable window is ignored rather than reading as 'no sales'", async () => {
  const h = createApiHandlers(salesStore(twoDays));
  const junk = (await call(h, "GET", "/api/reports/sales-summary", undefined, { since: "yesterday" })).data as { totalSales: number };
  assert.equal(junk.totalSales, 2);
});

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

const storedValue = (store: ApiAdminStorage, key: string) =>
  (store as unknown as { __settings: Map<string, StoreSetting> }).__settings.get(key)!.value as Record<string, unknown>;

test("a stored credential is never in a settings response, and survives a redacted save", async () => {
  const store = stubStore();
  const h = createApiHandlers(store);
  const config = { host: "smtp.example.com", user: "owner@example.com", password: "s3cret" };

  assert.equal((await call(h, "PUT", "/api/settings/emailConfig", { value: config })).status, 200);

  const one = (await call(h, "GET", "/api/settings/emailConfig")).data as { value: Record<string, unknown> };
  const all = (await call(h, "GET", "/api/settings")).data;
  for (const body of [one, all]) {
    assert.ok(!JSON.stringify(body).includes("s3cret"), `plaintext leaked: ${JSON.stringify(body)}`);
  }
  assert.equal(one.value.password, SECRET_SET_MARKER);
  assert.equal(one.value.host, "smtp.example.com", "non-secret fields still read back");

  // Saving the redacted object back must not blank the password.
  await call(h, "PUT", "/api/settings/emailConfig", { value: { ...one.value, user: "new@example.com" } });
  assert.equal(storedValue(store, "emailConfig").password, "s3cret");
  assert.equal(storedValue(store, "emailConfig").user, "new@example.com");

  // An actual new value replaces it.
  await call(h, "PUT", "/api/settings/emailConfig", { value: { ...config, password: "next" } });
  assert.equal(storedValue(store, "emailConfig").password, "next");
});

test("every secret field in the map is redacted, not just emailConfig's", async () => {
  for (const [key, fields] of Object.entries(SECRET_SETTING_FIELDS)) {
    const h = createApiHandlers(stubStore());
    const value = Object.fromEntries(fields.map(f => [f, `plain-${f}`]));
    await call(h, "PUT", `/api/settings/${key}`, { value });
    const body = JSON.stringify((await call(h, "GET", "/api/settings")).data);
    for (const f of fields) {
      assert.ok(!body.includes(`plain-${f}`), `${key}.${f} leaked from GET /api/settings`);
    }
  }
});

test("PUT without a value is rejected", async () => {
  const h = createApiHandlers(stubStore());
  assert.equal((await call(h, "PUT", "/api/settings/foo", {})).status, 400);
});

test("a till cannot be saved into accepting nothing", async () => {
  const store = stubStore();
  const h = createApiHandlers(store);

  assert.equal((await call(h, "PUT", `/api/settings/${TENDER_METHODS_KEY}`, { value: ["Cash"] })).status, 200);

  // The one input that bricks a till. Rejected at the API, not left to the UI.
  for (const bad of [[], ["", "Card"], "Cash", null, [1, 2]]) {
    const r = await call(h, "PUT", `/api/settings/${TENDER_METHODS_KEY}`, { value: bad });
    assert.equal(r.status, 400, `expected 400 for ${JSON.stringify(bad)}`);
  }
  // ...and the rejection left the working value in place.
  assert.deepEqual((await call(h, "GET", `/api/settings/${TENDER_METHODS_KEY}`)).data, {
    value: ["Cash"],
    updatedAt: 1,
  });

  // An unset or unusable setting reads as the default rather than as "accepts nothing".
  assert.deepEqual(tenderMethods(null), DEFAULT_TENDER_METHODS);
  assert.deepEqual(tenderMethods([]), DEFAULT_TENDER_METHODS);
  assert.deepEqual(tenderMethods(["Card"]), ["Card"]);
});
