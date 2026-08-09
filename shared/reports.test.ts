import { test } from "node:test";
import assert from "node:assert/strict";
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

test("averageOrderCents does not divide by zero", () => {
  assert.equal(salesSummary([]).averageOrderCents, 0);
  assert.equal(salesSummary(twoSales).averageOrderCents, Math.round(1475 / 2));
});
