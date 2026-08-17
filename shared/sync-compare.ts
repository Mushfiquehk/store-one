/**
 * Is a POS record and an admin row the same record?
 *
 * The comparison this replaces was `JSON.stringify(pos) === JSON.stringify(admin)`, which
 * is sensitive to key order and to the exact set of keys — while the two sides are built
 * by entirely different machinery. A Drizzle row carries every column in schema order; a
 * Dexie record carries whatever the writer put in it, and a record that arrived from the
 * server came back out of a Postgres `jsonb` column, which does not preserve key order at
 * all. Every mismatch made the server push the admin version back, so the same rows moved
 * back and forth on every sync, forever.
 *
 * The fix is a value comparison over an explicit list of the fields sync is responsible
 * for. Explicit rather than deep-equal-over-whatever-is-present, so that a server-only
 * column — `createdAt` today, `locationId` when Feature 3 lands — can never count as a
 * difference. A field this list forgets is a field sync stops noticing, so adding a synced
 * column means adding it here.
 */
export const SYNCED_FIELDS: Record<string, string[]> = {
  products: ["id", "name", "type", "isComposite", "availableAsIngredient", "attributes"],
  variants: ["id", "productId", "sku", "name", "basePrice", "directInventoryId"],
  modifierGroups: ["id", "name", "minSelections", "maxSelections"],
  modifiers: ["id", "modifierGroupId", "name", "baseUpcharge", "inventoryItemId", "quantityPerUse"],
  productModifierGroups: ["productId", "modifierGroupId", "scaleFactors"],
  inventoryItems: [
    "id", "name", "unitOfMeasure", "currentQuantity", "lowStockThreshold",
    "lastPurchasePrice", "purchaseUnit", "unitsPerPurchase",
  ],
  billOfMaterials: [
    "id", "sourceType", "sourceId", "inventoryItemId", "sourceProductId",
    "quantityDeducted", "scaleFactorMatrix", "overrideModifierGroupId",
  ],
  invoices: ["id", "supplierName", "invoiceNumber", "date", "status", "notes"],
  invoiceLineItems: ["id", "invoiceId", "inventoryItemId", "description", "quantity", "unitPriceCents"],
};

/**
 * Dexie and Postgres disagree about empty values often enough that this is where the next
 * false mismatch would come from: an absent optional field on one side and a NOT NULL
 * default on the other are the same fact about the record.
 */
function normalize(value: unknown): unknown {
  if (value === undefined) return null;
  if (value === null) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (Array.isArray(value)) return value.map(normalize);
  if (typeof value === "object") {
    // Key order is exactly what broke the old comparison, so sort before comparing.
    const entries = Object.entries(value as Record<string, unknown>)
      .map(([k, v]) => [k, normalize(v)] as const)
      .filter(([, v]) => v !== null)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return entries.map(([k, v]) => `${k}:${JSON.stringify(v)}`).join("|");
  }
  return value;
}

const sameValue = (a: unknown, b: unknown): boolean =>
  JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));

/**
 * True when every field sync owns has the same value on both sides. A table with no field
 * list returns false — sync cannot claim two records agree on fields it was never told
 * about, and false is the existing behaviour (push the admin version).
 */
export function sameSyncedFields(
  tableName: string,
  pos: Record<string, unknown> | null | undefined,
  admin: Record<string, unknown> | null | undefined,
): boolean {
  const fields = SYNCED_FIELDS[tableName];
  if (!fields || !pos || !admin) return false;
  return fields.every(field => sameValue(pos[field], admin[field]));
}

/** The same rule for the soft-delete flag, which is compared separately from the data. */
export function sameDeletedState(pos: unknown, admin: unknown): boolean {
  return (pos ?? null) === null ? (admin ?? null) === null : (admin ?? null) !== null;
}
