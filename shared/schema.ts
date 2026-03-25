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
};

export type Product = {
  id: string;
  name: string;
  type: "RETAIL" | "RESTAURANT";
  isComposite: boolean;
  availableAsIngredient: boolean;
  attributes: ProductAttributes | null;
  createdAt: string | null;
};

export type Variant = {
  id: string;
  productId: string;
  sku: string | null;
  name: string;
  basePrice: number;
  directInventoryId: string | null;
};

export type ModifierGroup = {
  id: string;
  name: string;
  minSelections: number;
  maxSelections: number;
};

export type ProductModifierGroup = {
  productId: string;
  modifierGroupId: string;
  scaleFactors: ModifierScaleFactors | null;
};

export type Modifier = {
  id: string;
  modifierGroupId: string;
  name: string;
  baseUpcharge: number;
  inventoryItemId: string | null;
  quantityPerUse: number | null;
};

export type InventoryItem = {
  id: string;
  name: string;
  unitOfMeasure: string;
  currentQuantity: number;
  lowStockThreshold: number | null;
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
};

export type Employee = {
  id: string;
  name: string;
  role: string;
  payRate: number;
  pin: string;
};

export type TimePunch = {
  id: string;
  employeeId: string;
  timeIn: number;
  timeOut: number | null;
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
};
