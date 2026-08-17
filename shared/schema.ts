export type ProductAttributes = {
  tags?: string[];
  tax_exempt?: boolean;
};

export type ModifierScaleFactors = Record<string, Record<string, number>>;

export type ScaleFactorMatrix = Record<string, number>;

export type SaleLine = {
  variantId: string;
  productId: string;
  productName: string;
  variantName: string;
  qty: number;
  modifiers: {
    modifierId: string;
    name: string;
    qty: number;
    unitPrice: number;
  }[];
  unitPrice: number;
  comboId: string | null;
  comboName: string | null;
  originalPriceCents: number;
  finalPriceCents: number;
};

export type SyncCategory = "menu" | "ingredients" | "sales" | "invoices";

export const SYNC_CATEGORY_TABLES: Record<SyncCategory, string[]> = {
  menu: ["products", "variants", "modifierGroups", "productModifierGroups", "modifiers", "combos", "comboItems", "productGroups", "productGroupItems"],
  ingredients: ["inventoryItems", "billOfMaterials"],
  sales: ["sales"],
  invoices: ["invoices", "invoiceLineItems"],
};

// What a store accepts is configuration, not an integration status: a plain setting
// and a string on the sale. Most operators take cards on a terminal from their bank,
// which is a supported setup rather than a missing feature.
export const TENDER_METHODS_KEY = "payments.methods";
export const DEFAULT_TENDER_METHODS = ["Cash", "Card"];

const isTenderList = (v: unknown): v is string[] =>
  Array.isArray(v) && v.length > 0 && v.every(m => typeof m === "string" && m.trim().length > 0);

/**
 * Per-key validation for settings writes. Returns an error string, or null when the
 * value is acceptable. Saving no payment methods is the one input here that bricks a
 * till, so it is rejected at the API rather than trusted to the UI that sent it.
 */
export function validateSetting(key: string, value: unknown): string | null {
  if (key === MENU_CATEGORIES_KEY) {
    if (!Array.isArray(value)) return "menu.categories must be a list of category names";
    if (value.some(c => typeof c !== "string" || !c.trim())) return "A category name cannot be blank";
    if (new Set(value).size !== value.length) return "Category names must be unique";
    return null;
  }
  if (key === TAX_INCLUSIVE_KEY) {
    return typeof value === "boolean" ? null : "tax.inclusive must be true or false";
  }
  if (key === TAX_RATE_KEY) {
    // A negative rate is a refund per item, and 8.25 typed as 825 charges eight times the bill.
    const rate = typeof value === "number" ? value : NaN;
    if (!Number.isFinite(rate) || rate < 0) return "Tax rate must be a percentage of zero or more";
    if (rate > 100) return "Tax rate must be a percentage, not a multiplier (0-100)";
    return null;
  }
  if (key !== TENDER_METHODS_KEY) return null;
  if (Array.isArray(value) && value.length === 0) return "A store must accept at least one payment method";
  return isTenderList(value) ? null : "payments.methods must be a non-empty list of method names";
}

/** The accepted methods, falling back to the default for an unset or unusable value. */
export function tenderMethods(value: unknown): string[] {
  return isTenderList(value) ? value : [...DEFAULT_TENDER_METHODS];
}

// The tax rate the operator set, in percent. One key, shared by the till and the server's
// order path — if the two ever read different keys they charge different amounts.
// The till's category bar, in the operator's order.
//
// A setting rather than a Set over products, deliberately: an order has to be chosen, an empty
// category has to be able to exist so the operator can see where things should go, and renaming
// one has to be a single write rather than an edit to every product that happens to mention it.
export const MENU_CATEGORIES_KEY = "menu.categories";

export const TAX_RATE_KEY = "tax.ratePct";

/**
 * **Zero, not 8.25.** A store with no configured rate charging 8.25% is the same class of
 * error as a zero cost rendering a 100% margin: a plausible wrong number nobody checks.
 * Zero is visibly unconfigured, and charging no tax is a question an operator answers on
 * their first day rather than a liability they discover at the end of the quarter.
 */
export const DEFAULT_TAX_RATE_PCT = 0;

/**
 * Whether menu prices already contain the tax.
 *
 * VAT and GST jurisdictions price this way — the shelf price is what the customer pays and
 * the tax is *extracted* from it rather than added. A POS that cannot express that is
 * unusable outside North America. Default false, which is every existing store's behaviour.
 */
export const TAX_INCLUSIVE_KEY = "tax.inclusive";

/** The stored rate, or zero for anything unset or unusable. */
export function taxRatePct(value: unknown): number {
  const rate = typeof value === "number" ? value : Number(value);
  return Number.isFinite(rate) && rate >= 0 ? rate : DEFAULT_TAX_RATE_PCT;
}

/** Tax on a subtotal, rounded once. The one place the arithmetic lives. */
export function taxCentsFor(subtotalCents: number, ratePct: number): number {
  return Math.round((subtotalCents * taxRatePct(ratePct)) / 100);
}

/**
 * Change owed, computed in one place and never negative — an under-tender is a blocked
 * confirm, not a negative change handed back to the customer.
 */
export function changeDueCents(totalCents: number, tenderedCents: number): number {
  return Math.max(0, tenderedCents - totalCents);
}

// The notes a customer actually hands over. US denominations; the till is not a
// currency system, and an operator can always type the amount.
const NOTE_CENTS = [500, 1000, 2000, 5000];

/** Exact total first, then the next note up at each denomination. */
export function tenderSuggestions(totalCents: number): number[] {
  const all = [totalCents, ...NOTE_CENTS.map(n => Math.ceil(totalCents / n) * n)];
  return all
    .filter((v, i) => v >= totalCents && all.indexOf(v) === i)
    .sort((a, b) => a - b)
    .slice(0, 4);
}

// A secret is write-only through the API: settable, never readable back. One map,
// applied at every exit (settings responses, backup snapshots), so a new credential
// is one line here rather than a new leak.
// ponytail: no secrets manager, no encryption at rest — today's leak is that we hand
// the value out. Encrypt at rest when the database itself becomes the threat model.
export const SECRET_SETTING_FIELDS: Record<string, string[]> = {
  emailConfig: ["password"],
};

// Deliberately not a run of asterisks: a client must not be able to save the marker
// back as if it were the value.
export const SECRET_SET_MARKER = "__SET__";

const asRecord = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;

/** Replace a setting's secret fields with the marker, or null when nothing is stored. */
export function redactSetting(key: string, value: unknown): unknown {
  const fields = SECRET_SETTING_FIELDS[key];
  const obj = fields ? asRecord(value) : null;
  if (!obj) return value;
  const out = { ...obj };
  for (const f of fields) {
    if (f in out) out[f] = out[f] ? SECRET_SET_MARKER : null;
  }
  return out;
}

/**
 * Merge an incoming setting over what is stored: a secret field that arrives as the
 * marker — or not at all — keeps the stored value. Without this the first save from a
 * redacted form blanks the credential.
 */
export function mergeSettingSecrets(key: string, incoming: unknown, stored: unknown): unknown {
  const fields = SECRET_SETTING_FIELDS[key];
  const obj = fields ? asRecord(incoming) : null;
  if (!obj) return incoming;
  const prev = asRecord(stored) ?? {};
  const out = { ...obj };
  for (const f of fields) {
    if (out[f] !== undefined && out[f] !== SECRET_SET_MARKER) continue;
    if (prev[f] !== undefined) out[f] = prev[f];
    else delete out[f];
  }
  return out;
}

export type SyncRecord = {
  tableName: string;
  recordId: string;
  data: Record<string, unknown>;
  updatedAt: number;
  deletedAt: number | null;
};

export type Product = {
  id: string;
  name: string;
  /**
   * Where this product sits on the till. Optional: a row written before Feature 25 T2 has
   * none, and `categoryOf()` in shared/menu-grid.ts falls back to its first tag so nothing
   * has to be re-tagged.
   */
  category?: string | null;
  type: "RETAIL" | "RESTAURANT";
  isComposite: boolean;
  availableAsIngredient: boolean;
  attributes: ProductAttributes | null;
  createdAt: string | null;
  updatedAt: number;
  deletedAt: number | null;
};

export type Variant = {
  id: string;
  productId: string;
  sku: string | null;
  name: string;
  basePrice: number;
  directInventoryId: string | null;
  updatedAt: number;
  deletedAt: number | null;
};

export type ModifierGroup = {
  id: string;
  name: string;
  minSelections: number;
  maxSelections: number;
  updatedAt: number;
  deletedAt: number | null;
};

export type ProductModifierGroup = {
  productId: string;
  modifierGroupId: string;
  scaleFactors: ModifierScaleFactors | null;
  updatedAt: number;
  deletedAt: number | null;
};

export type Modifier = {
  id: string;
  modifierGroupId: string;
  name: string;
  baseUpcharge: number;
  inventoryItemId: string | null;
  quantityPerUse: number | null;
  updatedAt: number;
  deletedAt: number | null;
};

export type InventoryItem = {
  id: string;
  name: string;
  unitOfMeasure: string;
  currentQuantity: number;
  lowStockThreshold: number | null;
  /** Cost of one *stocking* unit — the unit BOM quantities are in. */
  lastPurchasePrice: number | null;
  /** Label for the unit the item is bought in ("bag", "case"). Null when unknown. */
  purchaseUnit: string | null;
  /** How many stocking units come in one purchase unit. 1 means bought and stocked the same way. */
  unitsPerPurchase: number;
  updatedAt: number;
  deletedAt: number | null;
};

export type Invoice = {
  id: string;
  supplierName: string;
  invoiceNumber: string;
  date: string;
  status: string;
  notes: string;
  updatedAt: number;
  deletedAt: number | null;
};

export type InvoiceLineItem = {
  id: string;
  invoiceId: string;
  inventoryItemId: string;
  description: string;
  quantity: number;
  unitPriceCents: number;
  updatedAt: number;
  deletedAt: number | null;
};

export type BomEntry = {
  id: string;
  sourceType: string;
  sourceId: string;
  inventoryItemId: string;
  sourceProductId: string | null;
  quantityDeducted: number;
  scaleFactorMatrix: ScaleFactorMatrix | null;
  overrideModifierGroupId: string | null;
  updatedAt: number;
  deletedAt: number | null;
};

export type Employee = {
  id: string;
  name: string;
  role: string;
  payRate: number;
  pin: string;
  email: string;
  updatedAt: number;
  deletedAt: number | null;
};

export type TimePunch = {
  id: string;
  employeeId: string;
  timeIn: number;
  timeOut: number | null;
  updatedAt: number;
  deletedAt: number | null;
};

export type Sale = {
  id: string;
  createdAt: number;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  paymentMethod: string;
  // Null only on sales recorded before the till asked. A new sale always carries both,
  // because the day's cash expectation is a sum over tenderedCents.
  tenderedCents: number | null;
  changeCents: number | null;
  /**
   * The rate and mode this sale was actually charged at. Null on rows written before the till
   * recorded them — never backfilled, because a guess about what an old sale charged is worse
   * than an honest gap. A receipt reads these, not the current setting, so a reprint after a
   * rate change still shows what the customer paid.
   */
  taxRatePct: number | null;
  taxInclusive: boolean | null;
  status: string;
  linesJson: SaleLine[];
  customerName: string;
  closedAt: number | null;
  comboDiscountCents: number;
  updatedAt: number;
  deletedAt: number | null;
};

export type PricingStrategy = "FIXED" | "DISCOUNT_VALUE" | "DISCOUNT_PERCENT";

export type Combo = {
  id: string;
  name: string;
  pricingStrategy: PricingStrategy;
  fixedPriceCents: number | null;
  discountValueCents: number | null;
  discountPercent: number | null;
  active: boolean;
  updatedAt: number;
  deletedAt: number | null;
};

export type ComboItemType = "PRODUCT" | "VARIANT" | "PRODUCT_GROUP";

export type ComboItem = {
  id: string;
  comboId: string;
  itemType: ComboItemType;
  itemId: string;
  updatedAt: number;
  deletedAt: number | null;
};

export type ProductGroup = {
  id: string;
  name: string;
  updatedAt: number;
  deletedAt: number | null;
};

export type ProductGroupItem = {
  id: string;
  productGroupId: string;
  itemType: "PRODUCT" | "VARIANT";
  itemId: string;
  updatedAt: number;
  deletedAt: number | null;
};

export type ScheduleShift = {
  id: string;
  employeeId: string;
  weekStart: string;
  dayOfWeek: number;
  startMinutes: number;
  endMinutes: number;
  updatedAt: number;
  deletedAt: number | null;
};
