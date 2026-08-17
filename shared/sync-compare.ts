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

/**
 * The conflict policy, written down.
 *
 * It used to live only in the shape of an `if`: `adminUpdatedAt` was read out of the row,
 * written into `syncRecords`, and never compared to anything, so admin won unconditionally
 * and silently. That may be the right rule — it is certainly the intended one — but a
 * policy that exists only as control flow is a policy that gets reversed by accident during
 * the next refactor.
 */
export const ADMIN_OWNED_TABLES = [
  "products", "variants", "modifierGroups", "productModifierGroups",
  "modifiers", "inventoryItems", "billOfMaterials",
  "invoices", "invoiceLineItems",
] as const;

/**
 * True for the tables the admin console owns. The menu, the recipes and the supplier
 * invoices are authored in the back office; a POS device consumes them and does not get to
 * edit them out from under it. Sales, by contrast, are authored on the device.
 */
export function isAdminOwned(tableName: string): boolean {
  return (ADMIN_OWNED_TABLES as readonly string[]).includes(tableName);
}

export type Resolution = {
  winner: "admin" | "pos" | "equal";
  /** Why — carried so a log line or a test can state the rule, not just the outcome. */
  reason: string;
};

export type SyncSide = {
  data?: Record<string, unknown> | null;
  updatedAt?: number | null;
  deletedAt?: number | null;
};

/**
 * Who wins for a record that has an admin counterpart.
 *
 * **Admin wins even when the POS edit is newer**, deliberately: the back office is the
 * source of truth for these tables, and a device that disagrees is out of date rather than
 * ahead. The one thing that is *not* a conflict is agreement — if the fields sync owns
 * already match, nothing needs pushing, which is the whole of Feature 8's convergence.
 */
export function resolveConflict(tableName: string, pos: SyncSide, admin: SyncSide | null): Resolution {
  if (!admin) {
    return { winner: "pos", reason: "no admin record for this row; the device's copy is all there is" };
  }
  if (sameSyncedFields(tableName, pos.data, admin.data) && sameDeletedState(pos.deletedAt, admin.deletedAt)) {
    return { winner: "equal", reason: "every field sync owns already agrees" };
  }
  if (isAdminOwned(tableName)) {
    return { winner: "admin", reason: "the admin console owns this table; devices consume it" };
  }
  return resolveByRecency(pos, admin);
}

/**
 * Who owns a sale: the `admin_sales` row.
 *
 * A sale is **authored on the device** and *lands* server-side as a row. The `sales` sync
 * group is transport, not storage — the JSON blob in `syncRecords` is sync bookkeeping (the
 * `lastSyncedAt` window depends on it), never the authoritative record. Feature 8 T4 found
 * that nothing promoted the blob into a row, so every server-side report — `sales-summary`,
 * `product-mix`, `menu-margins` — was blind to every sale that arrived by sync. Feature 26
 * T2 is the promotion; this constant is the decision it implements.
 *
 * The corollary matters as much as the rule: **sales are device-authored, so admin-wins must
 * never apply to them.** The back office does not author sales and has no newer truth about
 * one; last-write-wins on `updatedAt` is correct for this table and `SALES_TABLE` is
 * deliberately absent from ADMIN_OWNED_TABLES above. `isAdminOwned("sales")` returning true
 * would let a stale server copy overwrite a real transaction — which is why there is a test
 * asserting it never does.
 */
export const SALES_TABLE = "sales";

/** Where the authoritative sale lives, for anything that needs to say so out loud. */
export const SALES_OWNER = "admin_sales" as const;

/**
 * The fallback for tables with no admin counterpart: last write wins on `updatedAt`.
 *
 * Ties go to the incoming record, which is what the existing `>=` did — a device that
 * re-pushes an identical timestamp is not in conflict with itself.
 */
export function resolveByRecency(pos: SyncSide, other: SyncSide): Resolution {
  const posAt = pos.updatedAt ?? 0;
  const otherAt = other.updatedAt ?? 0;
  return posAt >= otherAt
    ? { winner: "pos", reason: `device edit is newer or equal (${posAt} >= ${otherAt})` }
    : { winner: "admin", reason: `stored record is newer (${otherAt} > ${posAt})` };
}
