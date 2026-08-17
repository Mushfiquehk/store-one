import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_DAY_START_HOUR, canOpenSession, dayStartHour, expectedCash, openSession, sessionForSale,
  sessionWindow, tradingDayStart, type CashMovement, type DrawerSale, type DrawerSession,
} from "./drawer";

const session = (over: Partial<DrawerSession> = {}): DrawerSession => ({
  id: "ds1",
  openedAt: new Date(2026, 2, 2, 7).getTime(),
  openedByEmployeeId: "emp_ana",
  openingFloatCents: 20_000,
  closedAt: null,
  closedByEmployeeId: null,
  countedCents: null,
  expectedCents: null,
  varianceCents: null,
  note: "",
  updatedAt: 1,
  deletedAt: null,
  ...over,
});

test("a session opens and closes as one row, with both timestamps", () => {
  const open = session();
  assert.equal(openSession([open])?.id, "ds1");

  const closed = { ...open, closedAt: new Date(2026, 2, 2, 23).getTime(), countedCents: 51_250 };
  assert.equal(openSession([closed]), null, "a closed session is not open");
  assert.ok(closed.openedAt < closed.closedAt!, "one row, two timestamps");
});

test("a second open while one is live is rejected, not a second row", () => {
  // Two overlapping sessions make every sale ambiguous about which drawer it belongs to.
  assert.deepEqual(canOpenSession([]), { ok: true });
  const blocked = canOpenSession([session()]);
  assert.equal(blocked.ok, false);
  assert.match((blocked as { reason: string }).reason, /already open/);

  // Once closed, the next one may open.
  assert.deepEqual(canOpenSession([session({ closedAt: Date.now() })]), { ok: true });
});

test("a sale rung at 1am belongs to the session that opened the previous morning", () => {
  // The plan's check. A bar closing after midnight is still working last night's drawer.
  const lastNight = session({ id: "ds_night", openedAt: new Date(2026, 2, 2, 16).getTime() });
  const oneAm = new Date(2026, 2, 3, 1).getTime();

  assert.equal(sessionForSale([lastNight], oneAm)?.id, "ds_night");

  // And once this morning's session opens, the 1am sale still belongs to the older one.
  const thisMorning = session({ id: "ds_morning", openedAt: new Date(2026, 2, 3, 7).getTime() });
  assert.equal(sessionForSale([lastNight, thisMorning], oneAm)?.id, "ds_night");
  assert.equal(sessionForSale([lastNight, thisMorning], new Date(2026, 2, 3, 9).getTime())?.id, "ds_morning");
});

test("a sale rung with no session open is unattached, and claimed later", () => {
  const saleAt = new Date(2026, 2, 2, 8).getTime();
  assert.equal(sessionForSale([], saleAt), null, "selling is never blocked on a session");

  // Opening a session that covers it — a closed one whose window contains the sale — claims it.
  const covering = session({ openedAt: new Date(2026, 2, 2, 7).getTime(), closedAt: new Date(2026, 2, 2, 23).getTime() });
  assert.equal(sessionForSale([covering], saleAt)?.id, "ds1");
});

test("a sale after a session closed belongs to no session rather than the closed one", () => {
  const closed = session({ closedAt: new Date(2026, 2, 2, 23).getTime() });
  assert.equal(sessionForSale([closed], new Date(2026, 2, 3, 2).getTime()), null);
});

test("a session's window is its own timestamps, running to now while open", () => {
  const now = new Date(2026, 2, 2, 15).getTime();
  const open = session();
  assert.deepEqual(sessionWindow(open, now), { since: open.openedAt, until: now });

  const closed = session({ closedAt: new Date(2026, 2, 2, 23).getTime() });
  assert.deepEqual(sessionWindow(closed, now), { since: closed.openedAt, until: closed.closedAt! });
});

test("the trading day starts at the operator's hour, not midnight", () => {
  const startHour = 4;
  const oneAm = new Date(2026, 2, 3, 1).getTime();
  const nineAm = new Date(2026, 2, 3, 9).getTime();

  // 1am belongs to the day that began at 4am *yesterday*.
  assert.equal(tradingDayStart(oneAm, startHour), new Date(2026, 2, 2, 4).getTime());
  assert.equal(tradingDayStart(nineAm, startHour), new Date(2026, 2, 3, 4).getTime());

  // Midnight would have split that night in two.
  assert.notEqual(tradingDayStart(oneAm, startHour), tradingDayStart(oneAm, 0));
});

test("a nonsense start hour falls back to the default rather than shifting the day", () => {
  assert.equal(dayStartHour(6), 6);
  assert.equal(dayStartHour(0), 0, "midnight is a real answer if the operator wants it");
  for (const bad of [undefined, null, "morning", -1, 24, 4.5]) {
    assert.equal(dayStartHour(bad), DEFAULT_DAY_START_HOUR, `expected default for ${JSON.stringify(bad)}`);
  }
});

const cashSale = (at: number, over: Partial<DrawerSale> = {}): DrawerSale => ({
  createdAt: at,
  paymentMethod: "Cash",
  totalCents: 1000,
  tenderedCents: 1000,
  changeCents: 0,
  ...over,
});

const movement = (over: Partial<CashMovement>): CashMovement => ({
  id: "m1",
  sessionId: "ds1",
  at: new Date(2026, 2, 2, 10).getTime(),
  kind: "PAID_OUT",
  amountCents: 0,
  reason: "Supplier COD",
  note: "",
  employeeId: null,
  updatedAt: 1,
  deletedAt: null,
  ...over,
});

test("the expected figure is the plan's arithmetic, twice over", () => {
  // $200 float, three cash sales totalling $47.50 — one of them $12 tendered against $10.75 —
  // and a $30 paid-out. Expect $217.50.
  const open = session({ openingFloatCents: 20_000 });
  const t = (h: number) => new Date(2026, 2, 2, h).getTime();
  const sales = [
    cashSale(t(9), { totalCents: 2_000, tenderedCents: 2_000, changeCents: 0 }),
    cashSale(t(10), { totalCents: 1_675, tenderedCents: 1_675, changeCents: 0 }),
    cashSale(t(11), { totalCents: 1_075, tenderedCents: 1_200, changeCents: 125 }),
  ];
  const movements = [movement({ kind: "PAID_OUT", amountCents: 3_000, at: t(12) })];

  const first = expectedCash(open, sales, movements, t(13));
  assert.equal(first.expectedCents, 21_750, "$217.50");
  assert.equal(first.basis, "TENDER");
  assert.equal(first.cashSales, 3);

  // The same rows twice: a figure that moves between two reads of the same evening is not
  // something an operator can be asked to explain.
  const second = expectedCash(open, sales, movements, t(13));
  assert.deepEqual(second, first);
});

test("a sale with no tender recorded falls back to its total and says so", () => {
  const open = session({ openingFloatCents: 10_000 });
  const t = (h: number) => new Date(2026, 2, 2, h).getTime();

  const exact = expectedCash(open, [cashSale(t(9), { totalCents: 500, tenderedCents: 500 })], [], t(10));
  assert.equal(exact.basis, "TENDER");

  // Pre-Feature-16 rows: totals stand in, and the whole figure is flagged rather than quietly
  // mixing an exact basis with an approximate one.
  const approx = expectedCash(open, [
    cashSale(t(9), { totalCents: 500, tenderedCents: 500 }),
    cashSale(t(9), { totalCents: 700, tenderedCents: null, changeCents: null }),
  ], [], t(10));
  assert.equal(approx.basis, "SALE_TOTALS");
  assert.equal(approx.expectedCents, 11_200, "float plus both sales");
});

test("card sales, test orders and out-of-window rows are not in the drawer", () => {
  const open = session({ openingFloatCents: 5_000 });
  const t = (h: number) => new Date(2026, 2, 2, h).getTime();

  const result = expectedCash(open, [
    cashSale(t(9), { totalCents: 1_000 }),
    cashSale(t(9), { paymentMethod: "Card", totalCents: 9_999 }),
    cashSale(t(9), { totalCents: 5_555, isTestOrder: true }),
    cashSale(new Date(2026, 2, 1, 9).getTime(), { totalCents: 4_444 }),
  ], [], t(10));

  assert.equal(result.cashSales, 1);
  assert.equal(result.expectedCents, 6_000, "only the cash sale inside the window");
});

test("paid in adds, paid out subtracts, and a deleted movement does neither", () => {
  const open = session({ openingFloatCents: 10_000 });
  const t = (h: number) => new Date(2026, 2, 2, h).getTime();

  const result = expectedCash(open, [], [
    movement({ id: "in", kind: "PAID_IN", amountCents: 2_500, reason: "Float top-up", at: t(9) }),
    movement({ id: "out", kind: "PAID_OUT", amountCents: 1_000, at: t(10) }),
    movement({ id: "gone", kind: "PAID_OUT", amountCents: 9_999, at: t(10), deletedAt: t(11) }),
  ], t(12));

  assert.equal(result.paidInCents, 2_500);
  assert.equal(result.paidOutCents, 1_000);
  assert.equal(result.expectedCents, 11_500);
});

test("an amount is always positive: the kind carries the direction", () => {
  // No row can be ambiguous about its sign, so a paid-out cannot accidentally add.
  const open = session({ openingFloatCents: 3_000 });
  const out = movement({ kind: "PAID_OUT", amountCents: 3_000, at: open.openedAt + 60_000 });
  assert.ok(out.amountCents > 0, "stored positive, whichever way it moved");
  assert.equal(expectedCash(open, [], [out], open.openedAt + 120_000).expectedCents, 0, "the float went out the door");
});
