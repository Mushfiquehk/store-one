/**
 * The drawer session: what was in the till when it opened, what was counted when it closed,
 * and the difference.
 *
 * This is the one place the system touches physical reality and can be wrong out loud. A
 * mis-set tax rate, a void that walked out with the cash, a sale rung on the wrong item — the
 * drawer count is how a small operator finds out the same evening rather than from an
 * accountant months later.
 */
export type DrawerSession = {
  id: string;
  openedAt: number;
  openedByEmployeeId: string | null;
  openingFloatCents: number;
  closedAt: number | null;
  closedByEmployeeId: string | null;
  /** What was physically counted. Null while the session is open. */
  countedCents: number | null;
  /** What the sales say should be there. Written at close, so it cannot drift afterwards. */
  expectedCents: number | null;
  /** counted − expected: negative is short. Null while open. */
  varianceCents: number | null;
  note: string;
  updatedAt: number;
  deletedAt: number | null;
};

/**
 * When the trading day starts, in local hours.
 *
 * Default 4am, not midnight: a bar closing at 1am is still working last night's drawer, and a
 * day boundary that cuts through service puts half a shift in the wrong session.
 */
export const DAY_START_HOUR_KEY = "day.startHour";
export const DEFAULT_DAY_START_HOUR = 4;

export function dayStartHour(value: unknown): number {
  // Not Number(value): Number(null) is 0, which would silently move the trading day to
  // midnight for every store that has never set this. Same trap as Number("") in money.ts.
  const hour =
    typeof value === "number" ? value
    : typeof value === "string" && value.trim() !== "" ? Number(value)
    : NaN;
  return Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : DEFAULT_DAY_START_HOUR;
}

/** The open session, if there is one. There is at most one per device by construction. */
export function openSession(sessions: DrawerSession[]): DrawerSession | null {
  return sessions.find(s => s.closedAt == null && s.deletedAt == null) ?? null;
}

/**
 * Whether a session may be opened, and why not.
 *
 * Two overlapping sessions make every sale ambiguous about which drawer it belongs to, so a
 * second open is an error rather than a second row.
 */
export function canOpenSession(sessions: DrawerSession[]): { ok: true } | { ok: false; reason: string } {
  const open = openSession(sessions);
  return open
    ? { ok: false, reason: `A drawer session is already open (since ${new Date(open.openedAt).toLocaleString()})` }
    : { ok: true };
}

/**
 * The session a sale belongs to: the one whose window covers its timestamp.
 *
 * Sales are never blocked on a session being open — a till that refuses to sell because nobody
 * clicked "open drawer" is a till that gets worked around, and then the data is worse. An
 * unattached sale is claimed by the session covering it when one is opened later, which is why
 * this is derived from timestamps rather than stamped on the sale.
 */
export function sessionForSale(sessions: DrawerSession[], saleAt: number): DrawerSession | null {
  const candidates = sessions
    .filter(s => s.deletedAt == null && s.openedAt <= saleAt)
    .filter(s => s.closedAt == null || s.closedAt >= saleAt)
    .sort((a, b) => b.openedAt - a.openedAt);
  return candidates[0] ?? null;
}

/**
 * The sales window a session covers: from when it opened until it closed, or until now.
 *
 * `day.startHour` is what makes an unopened-but-expected session sensible — see
 * `tradingDayStart` — but an actual session's window is its own timestamps, because that is
 * when the cash was physically in the drawer.
 */
export function sessionWindow(session: DrawerSession, now: number): { since: number; until: number } {
  return { since: session.openedAt, until: session.closedAt ?? now };
}

/** The start of the trading day containing `at`, given the operator's start hour. */
export function tradingDayStart(at: number, startHour: number): number {
  const d = new Date(at);
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), startHour, 0, 0, 0);
  // Before the start hour, the trading day is still yesterday's.
  if (at < start.getTime()) start.setDate(start.getDate() - 1);
  return start.getTime();
}
