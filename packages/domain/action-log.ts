/**
 * Who did what, in a log the app cannot rewrite.
 *
 * **Append-only in the strict sense: there is no update, no delete, and no soft-delete field.**
 * A log the application can edit is a log that proves nothing, so the shape deliberately gives
 * it nowhere to write a correction — a mistake is followed by another row, never by an edit.
 *
 * Inventory movements are *not* here. They are Feature 15's `inventoryLedger` rows, which carry
 * quantities and a resulting balance; this records decisions.
 */
export type ActorKind = "EMPLOYEE" | "AGENT" | "SYSTEM";

export const ACTIONS = {
  PRICE_CHANGED: "PRICE_CHANGED",
  MENU_APPLIED: "MENU_APPLIED",
  SALE_VOIDED: "SALE_VOIDED",
  SETTING_CHANGED: "SETTING_CHANGED",
  BACKUP_RESTORED: "BACKUP_RESTORED",
  DEMO_CLEARED: "DEMO_CLEARED",
  DRAWER_CLOSED: "DRAWER_CLOSED",
} as const;

export type Action = typeof ACTIONS[keyof typeof ACTIONS];

export type ActionLogEntry = {
  id: string;
  at: number;
  actorKind: ActorKind;
  /** Employee id, agent token id, or null for SYSTEM. */
  actorId: string | null;
  action: Action;
  targetType: string;
  targetId: string | null;
  /** Human readable, and complete on its own: "Latte / Large $5.00 → $5.50". */
  summary: string;
  /** Anything a human summary cannot carry. Null rather than an empty object. */
  detail: Record<string, unknown> | null;
};

export type ActionLogInput = Omit<ActionLogEntry, "id" | "at"> & { id?: string; at?: number };

const money = (cents: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);

/**
 * The summary for a price change, with both prices in it.
 *
 * Both, because "price changed" is not an answer to "what was it before?" — and that is the
 * only question anyone asks a log after the fact.
 */
export function priceChangeSummary(name: string, fromCents: number, toCents: number): string {
  return `${name} ${money(fromCents)} → ${money(toCents)}`;
}

/** Fill in what every entry needs. Callers supply the facts, not the bookkeeping. */
export function actionLogEntry(input: ActionLogInput, now: number, uid: () => string): ActionLogEntry {
  return {
    id: input.id ?? uid(),
    at: input.at ?? now,
    actorKind: input.actorKind,
    actorId: input.actorId ?? null,
    action: input.action,
    targetType: input.targetType,
    targetId: input.targetId ?? null,
    summary: input.summary,
    detail: input.detail ?? null,
  };
}
