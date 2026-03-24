export type Product = {
  id: string;
  name: string;
  type: string;
  isComposite: boolean;
  availableAsIngredient: boolean;
  attributes: string | null;
  createdAt: string | null;
};

export type Variant = {
  id: string;
  productId: string;
  sku: string | null;
  name: string;
  basePrice: number;
  directInventoryId: string | null;
  config: string | null;
};

export type ModifierGroup = {
  id: string;
  name: string;
  minSelections: number;
  maxSelections: number;
  selectionRules: string | null;
};

export type Modifier = {
  id: string;
  modifierGroupId: string;
  name: string;
  baseUpcharge: number;
  scaleFactor: string | null;
  pricingLogic: string | null;
  inventoryItemId: string | null;
  quantityPerUse: number | null;
};

export type InventoryItem = {
  id: string;
  name: string;
  unitOfMeasure: string;
  currentQuantity: number;
  trackingConfig: string | null;
};

export type BillOfMaterials = {
  id: string;
  sourceType: string;
  sourceId: string;
  inventoryItemId: string;
  sourceProductId: string | null;
  quantityDeducted: number;
  scaleFactorMatrix: string | null;
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
  linesJson: string;
};
