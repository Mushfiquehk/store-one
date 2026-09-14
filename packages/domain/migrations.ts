import type { SaleLine } from "./schema";

/**
 * Normalisation rules for rows written before the field they are missing existed.
 *
 * They live here rather than inside a Dexie upgrade callback for two reasons: a
 * rule that decides what a stored row means is domain logic, and a rule buried in
 * an `upgrade(async tx => …)` can only be tested by standing up an IndexedDB.
 * The upgrade in apps/pos/src/lib/db.ts calls these; so can a restore path, which
 * reads rows from a backup file that predates the same fields.
 */

/**
 * How many stocking units come in one purchase unit.
 *
 * **1, and it is not a guess.** It is the statement "bought and stocked the same
 * way" — true of every item nobody has said otherwise about — and it is the
 * server column's own default (`units_per_purchase DOUBLE PRECISION NOT NULL
 * DEFAULT 1`).
 *
 * Absent is the dangerous value, not 1. Feature 11's finding was that a missing
 * factor makes every cost wrong: `costPerStockUnit` passes the price through
 * unconverted when it cannot read one, so an item bought by the case has been
 * costed as though it were bought by the unit.
 *
 * Zero, negative and non-finite are treated the same as absent. A case that
 * contains zero units is not a fact about the world; it is a form somebody
 * submitted empty.
 */
export function normalisedUnitsPerPurchase(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 1;
}

/**
 * The label for the unit an item is bought in. Null means unknown, which is a
 * real answer — an empty string would render as a blank next to a quantity and
 * read as a unit whose name is nothing.
 */
export function normalisedPurchaseUnit(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * A sale's lines, which have historically been stored as a JSON string as well as
 * an array — apps/pos/src/lib/db.ts's version 3 upgrade normalised exactly that,
 * and anything arriving since from a restore or an older device would have
 * slipped past it.
 *
 * Unparseable becomes empty rather than being guessed at. A sale's totals are its
 * own columns, so a report reading lines gets nothing rather than nonsense, and
 * the money still adds up.
 */
export function normalisedSaleLines(value: unknown): SaleLine[] {
  if (Array.isArray(value)) return value as SaleLine[];
  if (typeof value === "string") {
    try {
      const parsed: unknown = JSON.parse(value);
      return Array.isArray(parsed) ? (parsed as SaleLine[]) : [];
    } catch {
      return [];
    }
  }
  return [];
}
