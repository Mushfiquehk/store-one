import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_DAY_START_HOUR, canOpenSession, dayStartHour, openSession, sessionForSale,
  sessionWindow, tradingDayStart, type DrawerSession,
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
