import { db } from "./db";
import {
  adminProducts, adminVariants, adminModifiers, adminInventoryItems,
  adminBillOfMaterials, adminProductModifierGroups, adminSales,
} from "./schema";
import { eq, isNull } from "drizzle-orm";

export type LineItemInput = {
  variantId: string;
  qty: number;
  modifiers?: { modifierId: string; qty: number }[];
};

export type ComboInput = {
  name: string;
  pricingStrategy: "FIXED" | "DISCOUNT_VALUE" | "DISCOUNT_PERCENT";
  fixedPriceCents?: number;
  discountValueCents?: number;
  discountPercent?: number;
  lineIndices: number[];
};

export type InventoryEffect = {
  inventoryItemId: string;
  inventoryItemName: string;
  unitOfMeasure: string;
  quantityBefore: number;
  quantityAfter: number;
  delta: number;
  lowStockThreshold: number | null;
  belowThreshold: boolean;
};

export type LinePricing = {
  variantId: string;
  productId: string;
  productName: string;
  variantName: string;
  qty: number;
  unitPriceCents: number;
  originalPriceCents: number;
  finalPriceCents: number;
  comboName: string | null;
  modifiers: { modifierId: string; name: string; qty: number; unitPrice: number }[];
  lineTotalCents: number;
};

export type TestOrderResult = {
  sale: {
    id: string;
    createdAt: number;
    subtotalCents: number;
    taxCents: number;
    totalCents: number;
    comboDiscountCents: number;
    paymentMethod: string;
    status: string;
    customerName: string;
    linesJson: unknown[];
  };
  linesPricing: LinePricing[];
  inventoryEffects: InventoryEffect[];
  warnings: string[];
};

type Product = typeof adminProducts.$inferSelect;
type Variant = typeof adminVariants.$inferSelect;
type Modifier = typeof adminModifiers.$inferSelect;
type InventoryItem = typeof adminInventoryItems.$inferSelect;
type BomEntry = typeof adminBillOfMaterials.$inferSelect;
type Pmg = typeof adminProductModifierGroups.$inferSelect;

async function loadAllData() {
  const [products, variants, modifiers, inventoryItems, bomEntries, pmgs] = await Promise.all([
    db.select().from(adminProducts).where(isNull(adminProducts.deletedAt)),
    db.select().from(adminVariants).where(isNull(adminVariants.deletedAt)),
    db.select().from(adminModifiers).where(isNull(adminModifiers.deletedAt)),
    db.select().from(adminInventoryItems).where(isNull(adminInventoryItems.deletedAt)),
    db.select().from(adminBillOfMaterials).where(isNull(adminBillOfMaterials.deletedAt)),
    db.select().from(adminProductModifierGroups).where(isNull(adminProductModifierGroups.deletedAt)),
  ]);
  return { products, variants, modifiers, inventoryItems, bomEntries, pmgs };
}

function getModifierPrice(
  mod: Modifier, variantId: string,
  variants: Variant[], pmgs: Pmg[]
): number {
  const variant = variants.find(v => v.id === variantId);
  if (variant) {
    const pmg = pmgs.find(p => p.productId === variant.productId && p.modifierGroupId === mod.modifierGroupId);
    if (pmg?.scaleFactors) {
      const sf = pmg.scaleFactors as Record<string, Record<string, number>>;
      const modSf = sf[mod.id];
      if (modSf) {
        if (modSf[variant.name] !== undefined) return Math.round(modSf[variant.name]);
        if (modSf[variant.id] !== undefined) return Math.round(modSf[variant.id]);
      }
    }
  }
  return mod.baseUpcharge;
}

function validateSubRecipeChain(
  sourceProductId: string,
  context: string,
  errors: string[],
  data: { products: Product[]; variants: Variant[]; inventoryItems: InventoryItem[]; bomEntries: BomEntry[] },
  inventoryItemIds: Set<string>,
  ancestors: Set<string>,
  depth: number
): void {
  if (depth > 5) {
    errors.push(`${context}: sub-recipe chain exceeds maximum depth (5) at product '${sourceProductId}'`);
    return;
  }
  if (ancestors.has(sourceProductId)) {
    errors.push(`${context}: circular sub-recipe reference detected at product '${sourceProductId}'`);
    return;
  }
  const product = data.products.find(p => p.id === sourceProductId);
  if (!product) {
    errors.push(`${context}: BOM sub-recipe references missing product '${sourceProductId}'`);
    return;
  }
  const subVariants = data.variants.filter(v => v.productId === sourceProductId);
  if (subVariants.length === 0) {
    errors.push(`${context}: sub-recipe product '${sourceProductId}' has no variants`);
    return;
  }
  const defaultVariant = subVariants[0];
  const pathAncestors = new Set(ancestors);
  pathAncestors.add(sourceProductId);
  const subBom = data.bomEntries.filter(b => b.sourceType === "VARIANT" && b.sourceId === defaultVariant.id);
  for (const entry of subBom) {
    if (entry.sourceProductId) {
      validateSubRecipeChain(entry.sourceProductId, context, errors, data, inventoryItemIds, pathAncestors, depth + 1);
    } else if (!inventoryItemIds.has(entry.inventoryItemId)) {
      errors.push(`${context}: sub-recipe BOM references missing inventory item '${entry.inventoryItemId}'`);
    }
  }
}

export function validateLineItems(
  lineItems: LineItemInput[],
  data: { products: Product[]; variants: Variant[]; modifiers: Modifier[]; inventoryItems: InventoryItem[]; bomEntries: BomEntry[] }
): string[] {
  const errors: string[] = [];
  const inventoryItemIds = new Set(data.inventoryItems.map(i => i.id));

  for (let i = 0; i < lineItems.length; i++) {
    const line = lineItems[i];
    const variant = data.variants.find(v => v.id === line.variantId);
    if (!variant) {
      errors.push(`Line ${i}: variant '${line.variantId}' not found`);
      continue;
    }
    const product = data.products.find(p => p.id === variant.productId);
    if (!product) {
      errors.push(`Line ${i}: product for variant '${line.variantId}' not found`);
    }
    if (line.qty < 1) {
      errors.push(`Line ${i}: qty must be >= 1`);
    }

    if (variant.directInventoryId && !inventoryItemIds.has(variant.directInventoryId)) {
      errors.push(`Line ${i}: variant '${line.variantId}' references missing inventory item '${variant.directInventoryId}'`);
    }

    const variantBom = data.bomEntries.filter(b => b.sourceType === "VARIANT" && b.sourceId === line.variantId);
    for (const bom of variantBom) {
      if (bom.sourceProductId) {
        validateSubRecipeChain(bom.sourceProductId, `Line ${i}`, errors, data, inventoryItemIds, new Set(), 0);
      } else if (!inventoryItemIds.has(bom.inventoryItemId)) {
        errors.push(`Line ${i}: BOM entry references missing inventory item '${bom.inventoryItemId}'`);
      }
    }

    if (line.modifiers) {
      for (const sel of line.modifiers) {
        const mod = data.modifiers.find(m => m.id === sel.modifierId);
        if (!mod) {
          errors.push(`Line ${i}: modifier '${sel.modifierId}' not found`);
          continue;
        }
        if (mod.inventoryItemId && !inventoryItemIds.has(mod.inventoryItemId)) {
          errors.push(`Line ${i}: modifier '${sel.modifierId}' references missing inventory item '${mod.inventoryItemId}'`);
        }
        const modBom = data.bomEntries.filter(b => b.sourceType === "MODIFIER" && b.sourceId === sel.modifierId);
        for (const bom of modBom) {
          if (bom.sourceProductId) {
            validateSubRecipeChain(bom.sourceProductId, `Line ${i} modifier '${sel.modifierId}'`, errors, data, inventoryItemIds, new Set(), 0);
          } else if (!inventoryItemIds.has(bom.inventoryItemId)) {
            errors.push(`Line ${i}: modifier BOM entry references missing inventory item '${bom.inventoryItemId}'`);
          }
        }
      }
    }
  }
  return errors;
}

export function computeInventoryDeductions(
  lineItems: LineItemInput[],
  data: {
    products: Product[]; variants: Variant[]; modifiers: Modifier[];
    inventoryItems: InventoryItem[]; bomEntries: BomEntry[];
  }
): Map<string, number> {
  const deltas = new Map<string, number>();

  function addDelta(inventoryItemId: string, amount: number) {
    deltas.set(inventoryItemId, (deltas.get(inventoryItemId) || 0) + amount);
  }

  function resolveSubRecipe(sourceProductId: string, multiplier: number, depth: number, ancestors: Set<string>) {
    if (depth > 5 || ancestors.has(sourceProductId)) return;
    const subProduct = data.products.find(p => p.id === sourceProductId);
    if (!subProduct) return;
    const subVariants = data.variants.filter(v => v.productId === sourceProductId);
    const defaultVariant = subVariants[0];
    if (!defaultVariant) return;
    const pathAncestors = new Set(ancestors);
    pathAncestors.add(sourceProductId);
    const subBom = data.bomEntries.filter(b => b.sourceType === "VARIANT" && b.sourceId === defaultVariant.id);
    subBom.forEach(subEntry => {
      if (subEntry.sourceProductId) {
        resolveSubRecipe(subEntry.sourceProductId, subEntry.quantityDeducted * multiplier, depth + 1, pathAncestors);
      } else {
        addDelta(subEntry.inventoryItemId, -(subEntry.quantityDeducted * multiplier));
      }
    });
  }

  for (const line of lineItems) {
    const variant = data.variants.find(v => v.id === line.variantId);
    if (!variant) continue;

    const bomEntries = data.bomEntries.filter(b => b.sourceType === "VARIANT" && b.sourceId === line.variantId);
    const selectedModGroupIds = new Set(
      (line.modifiers || []).map(sel => {
        const mod = data.modifiers.find(m => m.id === sel.modifierId);
        return mod?.modifierGroupId;
      }).filter(Boolean)
    );

    if (bomEntries.length === 0) {
      if (variant.directInventoryId) {
        addDelta(variant.directInventoryId, -line.qty);
      }
    } else {
      bomEntries.forEach(entry => {
        if (entry.overrideModifierGroupId && selectedModGroupIds.has(entry.overrideModifierGroupId)) {
          return;
        }
        let qty = entry.quantityDeducted * line.qty;
        if (entry.scaleFactorMatrix) {
          const sfm = entry.scaleFactorMatrix as Record<string, number>;
          const scale = sfm[variant.id] ?? sfm[variant.name] ?? 1;
          qty = entry.quantityDeducted * scale * line.qty;
        }
        if (entry.sourceProductId) {
          resolveSubRecipe(entry.sourceProductId, qty, 0, new Set());
        } else {
          addDelta(entry.inventoryItemId, -qty);
        }
      });
    }

    (line.modifiers || []).forEach(sel => {
      const modBomEntries = data.bomEntries.filter(b => b.sourceType === "MODIFIER" && b.sourceId === sel.modifierId);
      if (modBomEntries.length > 0) {
        modBomEntries.forEach(entry => {
          let qty = entry.quantityDeducted * sel.qty * line.qty;
          if (entry.scaleFactorMatrix) {
            const sfm = entry.scaleFactorMatrix as Record<string, number>;
            const scale = sfm[variant.id] ?? sfm[variant.name] ?? 1;
            qty = entry.quantityDeducted * scale * sel.qty * line.qty;
          }
          if (entry.sourceProductId) {
            resolveSubRecipe(entry.sourceProductId, qty, 0, new Set());
          } else {
            addDelta(entry.inventoryItemId, -qty);
          }
        });
      } else {
        const mod = data.modifiers.find(m => m.id === sel.modifierId);
        if (mod?.inventoryItemId && mod.quantityPerUse) {
          addDelta(mod.inventoryItemId, -(mod.quantityPerUse * sel.qty * line.qty));
        }
      }
    });
  }

  return deltas;
}

function applyComboDiscounts(
  linesPricing: LinePricing[],
  combos: ComboInput[]
): number {
  let totalDiscount = 0;

  for (const combo of combos) {
    const comboLines = combo.lineIndices
      .filter(idx => idx >= 0 && idx < linesPricing.length)
      .map(idx => linesPricing[idx]);

    if (comboLines.length === 0) continue;

    const originalTotal = comboLines.reduce((sum, l) => sum + l.originalPriceCents * l.qty, 0);
    let discount = 0;

    if (combo.pricingStrategy === "FIXED" && combo.fixedPriceCents != null) {
      discount = originalTotal - combo.fixedPriceCents;
    } else if (combo.pricingStrategy === "DISCOUNT_VALUE" && combo.discountValueCents != null) {
      discount = combo.discountValueCents;
    } else if (combo.pricingStrategy === "DISCOUNT_PERCENT" && combo.discountPercent != null) {
      discount = Math.round(originalTotal * Math.min(combo.discountPercent, 100) / 100);
    }

    discount = Math.max(0, Math.min(discount, originalTotal));
    totalDiscount += discount;

    for (const line of comboLines) {
      if (originalTotal > 0) {
        const ratio = (line.originalPriceCents * line.qty) / originalTotal;
        line.finalPriceCents = Math.round(line.originalPriceCents - (discount * ratio / line.qty));
        line.comboName = combo.name;
        line.lineTotalCents = line.finalPriceCents * line.qty;
      }
    }
  }

  return totalDiscount;
}

export async function processTestOrder(
  lineItems: LineItemInput[],
  options: { dryRun?: boolean; taxRatePct?: number; customerName?: string; combos?: ComboInput[] } = {}
): Promise<TestOrderResult> {
  const { dryRun = false, taxRatePct = 0, customerName = "", combos: comboInputs = [] } = options;
  const data = await loadAllData();

  const errors = validateLineItems(lineItems, data);
  if (errors.length > 0) {
    throw new Error(`Validation failed: ${errors.join("; ")}`);
  }

  const linesPricing: LinePricing[] = [];
  for (const line of lineItems) {
    const variant = data.variants.find(v => v.id === line.variantId)!;
    const product = data.products.find(p => p.id === variant.productId)!;
    const modDetails = (line.modifiers || []).map(sel => {
      const mod = data.modifiers.find(m => m.id === sel.modifierId)!;
      const unitPrice = getModifierPrice(mod, line.variantId, data.variants, data.pmgs);
      return { modifierId: sel.modifierId, name: mod.name, qty: sel.qty, unitPrice };
    });
    const modTotal = modDetails.reduce((s, m) => s + m.unitPrice * m.qty, 0);
    const unitPriceCents = variant.basePrice + modTotal;
    linesPricing.push({
      variantId: line.variantId,
      productId: product.id,
      productName: product.name,
      variantName: variant.name,
      qty: line.qty,
      unitPriceCents,
      originalPriceCents: unitPriceCents,
      finalPriceCents: unitPriceCents,
      comboName: null,
      modifiers: modDetails,
      lineTotalCents: unitPriceCents * line.qty,
    });
  }

  const comboDiscountCents = applyComboDiscounts(linesPricing, comboInputs);

  const subtotalBeforeCombo = linesPricing.reduce((s, l) => s + l.originalPriceCents * l.qty, 0);
  const subtotalCents = Math.max(0, subtotalBeforeCombo - comboDiscountCents);
  const taxCents = Math.round((subtotalCents * taxRatePct) / 100);
  const totalCents = subtotalCents + taxCents;

  const inventoryDeltas = computeInventoryDeductions(lineItems, data);

  const inventoryEffects: InventoryEffect[] = [];
  const warnings: string[] = [];

  for (const [itemId, delta] of inventoryDeltas) {
    const item = data.inventoryItems.find(i => i.id === itemId);
    if (!item) {
      errors.push(`Inventory item '${itemId}' referenced in BOM but not found`);
      continue;
    }
    const quantityBefore = item.currentQuantity;
    const quantityAfter = Math.max(0, quantityBefore + delta);
    const belowThreshold = item.lowStockThreshold != null && quantityAfter < item.lowStockThreshold;
    if (belowThreshold) {
      warnings.push(`'${item.name}' will drop below low-stock threshold (${quantityAfter} < ${item.lowStockThreshold})`);
    }
    if (quantityAfter <= 0 && quantityBefore > 0) {
      warnings.push(`'${item.name}' will be depleted (${quantityBefore} → ${quantityAfter})`);
    }
    inventoryEffects.push({
      inventoryItemId: itemId,
      inventoryItemName: item.name,
      unitOfMeasure: item.unitOfMeasure,
      quantityBefore,
      quantityAfter,
      delta,
      lowStockThreshold: item.lowStockThreshold,
      belowThreshold,
    });
  }

  const now = Date.now();
  const saleId = `sale_test_${Math.random().toString(16).slice(2)}_${now}`;

  const linesJson = linesPricing.map(l => ({
    variantId: l.variantId,
    productId: l.productId,
    productName: l.productName,
    variantName: l.variantName,
    qty: l.qty,
    modifiers: l.modifiers,
    unitPrice: l.unitPriceCents,
    comboId: null,
    comboName: l.comboName,
    originalPriceCents: l.originalPriceCents,
    finalPriceCents: l.finalPriceCents,
  }));

  const sale = {
    id: saleId,
    createdAt: now,
    subtotalCents,
    taxCents,
    totalCents,
    comboDiscountCents,
    paymentMethod: "test",
    status: "completed",
    customerName,
    linesJson,
  };

  if (dryRun) {
    await db.transaction(async (tx) => {
      await tx.insert(adminSales).values({
        ...sale,
        closedAt: null,
        updatedAt: now,
        deletedAt: null,
      });

      for (const effect of inventoryEffects) {
        await tx.update(adminInventoryItems)
          .set({ currentQuantity: effect.quantityAfter, updatedAt: now })
          .where(eq(adminInventoryItems.id, effect.inventoryItemId));
      }

      throw new RollbackSignal();
    }).catch(err => {
      if (err instanceof RollbackSignal) return;
      throw err;
    });
  } else {
    await db.transaction(async (tx) => {
      await tx.insert(adminSales).values({
        ...sale,
        closedAt: null,
        updatedAt: now,
        deletedAt: null,
      });

      for (const effect of inventoryEffects) {
        await tx.update(adminInventoryItems)
          .set({ currentQuantity: effect.quantityAfter, updatedAt: now })
          .where(eq(adminInventoryItems.id, effect.inventoryItemId));
      }
    });
  }

  return { sale, linesPricing, inventoryEffects, warnings };
}

class RollbackSignal extends Error {
  constructor() {
    super("DryRunRollback");
    this.name = "RollbackSignal";
  }
}
