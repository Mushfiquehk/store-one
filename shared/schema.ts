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
