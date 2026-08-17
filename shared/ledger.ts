/**
 * Why a quantity changed. `currentQuantity` stays the source of truth for what is on
 * hand; these rows explain how it got there, so "where did forty ounces of milk go on
 * Tuesday" has an answer.
 *
 * ponytail: append-only rows, no event sourcing and no rebuild-from-log. The column is
 * still authoritative; if the two ever disagree, a physical count is what fixes it.
 */
export type LedgerReason = "SALE" | "VOID" | "RECEIVE" | "WASTE" | "COUNT" | "MANUAL";

export type InventoryLedgerEntry = {
  id: string;
  inventoryItemId: string;
  delta: number;
  quantityAfter: number;
  reason: LedgerReason;
  /** What caused it — the sale, invoice or count. Null for a bare manual edit. */
  refType: string | null;
  refId: string | null;
  note: string;
  employeeId: string | null;
  createdAt: number;
  updatedAt: number;
};

export type LedgerContext = {
  reason: LedgerReason;
  refType?: string | null;
  refId?: string | null;
  note?: string;
  employeeId?: string | null;
  createdAt: number;
  newId: (inventoryItemId: string) => string;
};

/**
 * The rows to append and the quantities to write, for a set of deltas. Pure — the caller
 * does the writing, inside whatever transaction it owns.
 *
 * An item the caller did not supply a quantity for is skipped rather than created: a
 * ledger row about an item that does not exist explains nothing.
 *
 * ponytail: quantities still clamp at zero here, exactly as both adjusters did before.
 * Feature 15 T3 is where the clamp comes off and an over-draw becomes visible — this
 * task moves the clamp into one place so that change is one line.
 */
export function ledgerRows(
  deltas: Map<string, number> | Record<string, number>,
  quantityBefore: Record<string, number>,
  ctx: LedgerContext,
): { rows: InventoryLedgerEntry[]; quantityAfter: Record<string, number> } {
  const entries: Array<[string, number]> = [];
  if (deltas instanceof Map) deltas.forEach((delta, id) => entries.push([id, delta]));
  else for (const [id, delta] of Object.entries(deltas)) entries.push([id, delta]);
  const rows: InventoryLedgerEntry[] = [];
  const quantityAfter: Record<string, number> = {};

  for (const [inventoryItemId, delta] of entries) {
    const before = quantityBefore[inventoryItemId];
    if (before === undefined) continue;
    const after = Math.max(0, before + delta);
    quantityAfter[inventoryItemId] = after;
    rows.push({
      id: ctx.newId(inventoryItemId),
      inventoryItemId,
      delta,
      quantityAfter: after,
      reason: ctx.reason,
      refType: ctx.refType ?? null,
      refId: ctx.refId ?? null,
      note: ctx.note ?? "",
      employeeId: ctx.employeeId ?? null,
      createdAt: ctx.createdAt,
      updatedAt: ctx.createdAt,
    });
  }

  return { rows, quantityAfter };
}
