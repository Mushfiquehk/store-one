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
