import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { productMix, salesSeries, salesSummary, type ReportSale } from "./reports";

// Local time on purpose — the functions bucket by the operator's trading day, so the
// fixtures have to be built the same way or the test asserts the timezone, not the logic.
const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).getTime();

const latte = { variantId: "v_latte_s", productId: "p_latte", productName: "Latte", variantName: "Small" };
const cookie = { variantId: "v_cookie", productId: "p_cookie", productName: "Cookie", variantName: "Each" };

const twoSales: ReportSale[] = [
  {
    createdAt: at(2026, 3, 1, 9),
    totalCents: 1050,
    taxCents: 50,
    linesJson: [{ ...latte, qty: 2, unitPrice: 425 }, { ...cookie, qty: 1, unitPrice: 150 }],
  },
  {
    createdAt: at(2026, 3, 1, 14),
    totalCents: 425,
    taxCents: 25,
    linesJson: [{ ...latte, qty: 1, unitPrice: 425 }],
  },
];

test("productMix totals quantity and revenue per variant, revenue first", () => {
  const mix = productMix(twoSales);
  assert.deepEqual(mix.map(r => [r.variantId, r.quantity, r.revenueCents]), [
    ["v_latte_s", 3, 1275],
    ["v_cookie", 1, 150],
  ]);
});

test("a sale with no lines is skipped rather than throwing", () => {
  assert.deepEqual(productMix([{ createdAt: at(2026, 3, 1), totalCents: 100 }]), []);
});

test("linesJson still works when it arrives as a JSON string", () => {
  const wire: ReportSale[] = [{ createdAt: at(2026, 3, 1), totalCents: 425, linesJson: JSON.stringify([{ ...latte, qty: 1, unitPrice: 425 }]) }];
  assert.equal(productMix(wire)[0].quantity, 1);
});

test("salesSeries puts sales on either side of midnight in different daily buckets", () => {
  const spanning: ReportSale[] = [
    { createdAt: at(2026, 3, 1, 23), totalCents: 500 },
    { createdAt: at(2026, 3, 2, 1), totalCents: 700 },
  ];
  const daily = salesSeries(spanning, { granularity: "daily" });
  assert.equal(daily.length, 2);
  assert.deepEqual(daily.map(b => b.revenueCents), [500, 700]);
  assert.deepEqual(daily.map(b => b.label), ["Mar 01", "Mar 02"]);
});

test("hourly buckets by the operator's clock, and transactions count rows not units", () => {
  const hourly = salesSeries(twoSales, { granularity: "hourly" });
  assert.deepEqual(hourly.map(b => [b.label, b.revenueCents, b.transactions]), [
    ["09:00", 1050, 1],
    ["14:00", 425, 1],
  ]);
});

test("monthly collapses a month into one bucket", () => {
  const monthly = salesSeries(twoSales, { granularity: "monthly" });
  assert.deepEqual(monthly.map(b => [b.label, b.revenueCents, b.transactions]), [["Mar 2026", 1475, 2]]);
});

test("the window excludes sales outside it, in both directions", () => {
  const windowed = salesSeries(twoSales, { granularity: "daily", since: at(2026, 3, 1, 10) });
  assert.deepEqual(windowed.map(b => b.revenueCents), [425]);
  assert.equal(salesSummary(twoSales, { until: at(2026, 3, 1, 10) }).totalSales, 1);
});

test("fill emits the days the shop was closed, so a chart cannot draw over a gap", () => {
  const withGap: ReportSale[] = [
    { createdAt: at(2026, 3, 1, 10), totalCents: 500 },
    { createdAt: at(2026, 3, 4, 10), totalCents: 700 },
  ];
  const filled = salesSeries(withGap, { granularity: "daily", since: at(2026, 3, 1, 0), until: at(2026, 3, 4, 23), fill: true });
  assert.deepEqual(filled.map(b => [b.label, b.revenueCents]), [
    ["Mar 01", 500],
    ["Mar 02", 0],
    ["Mar 03", 0],
    ["Mar 04", 700],
  ]);

  // Without fill, Mar 01 and Mar 04 sit next to each other and the gap disappears.
  const sparse = salesSeries(withGap, { granularity: "daily", since: at(2026, 3, 1, 0) });
  assert.deepEqual(sparse.map(b => b.label), ["Mar 01", "Mar 04"]);
});

test("fill never invents revenue, only buckets", () => {
  const filled = salesSeries(twoSales, { granularity: "daily", since: at(2026, 3, 1, 0), until: at(2026, 3, 5), fill: true });
  const total = filled.reduce((sum, b) => sum + b.revenueCents, 0);
  assert.equal(total, 1475);
  assert.equal(filled.reduce((sum, b) => sum + b.transactions, 0), 2);
});

test("fill steps by calendar month, not by 30 days", () => {
  const filled = salesSeries([], { granularity: "monthly", since: at(2026, 1, 15, 0), until: at(2026, 4, 2), fill: true });
  assert.deepEqual(filled.map(b => b.label), ["Jan 2026", "Feb 2026", "Mar 2026", "Apr 2026"]);
});

test("fill without a since does nothing rather than guessing a start", () => {
  assert.deepEqual(salesSeries([], { granularity: "daily", fill: true }), []);
});

test("an empty store reports nothing, not zeros dressed as data", () => {
  assert.deepEqual(salesSeries([], { granularity: "daily" }), []);
  assert.deepEqual(productMix([]), []);
  assert.deepEqual(salesSummary([]), {
    totalSales: 0,
    totalRevenueCents: 0,
    totalTaxCents: 0,
    averageOrderCents: 0,
  });
});

// The handler tests in api-handlers.test.ts pass `query` straight to handle(), so they pin
// the contract but could never have caught the real bug: both servers built an ApiRequest
// with no `query` at all, and every window on these endpoints was silently discarded.
// Hitting the report routes for real needs Postgres, so this guards the one line each
// adapter has to keep — cheap, and it fails the moment the field is dropped again.
test("both servers forward the query string to the shared handlers", () => {
  const express = readFileSync(new URL("../server/routes.ts", import.meta.url), "utf8");
  assert.match(express, /query: req\.query/, "server/routes.ts stopped forwarding req.query");

  const local = readFileSync(new URL("../client/src/lib/local-server.ts", import.meta.url), "utf8");
  assert.match(local, /URLSearchParams/, "local-server.ts stopped parsing the query string");
  assert.match(local, /^\s*query,$/m, "local-server.ts stopped passing query into ApiRequest");
});

// One line, and it is what stops this regressing the next time someone needs a chart to
// look good in a screenshot. The Reports page fabricated two of its three tabs for as long
// as it existed, and nothing on screen said so.
test("the Reports page contains no random numbers", () => {
  const page = readFileSync(new URL("../client/src/pages/reports.tsx", import.meta.url), "utf8");
  assert.ok(!page.includes("Math.random"), "Math.random is back in reports.tsx");
  // Labour percent divides by revenue, so it is the figure most likely to be quietly
  // re-derived on the page instead of coming from the tested function.
  assert.ok(page.includes("laborPct("), "labour percent must come from shared/labor.ts");
});

test("averageOrderCents does not divide by zero", () => {
  assert.equal(salesSummary([]).averageOrderCents, 0);
  assert.equal(salesSummary(twoSales).averageOrderCents, Math.round(1475 / 2));
});
