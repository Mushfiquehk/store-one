/**
 * The one depletion walk. It was written twice — `server/bom-engine.ts` for test orders
 * and `client/src/pages/pos.tsx` for real sales — and the two had already drifted, with
 * only the copy nobody tested running on actual money.
 *
 * Pure: it takes preloaded data and returns the deltas. Applying them (and recording
 * why) belongs to the caller. Imports nothing from `server/` or `client/`, so both
 * paths can use it.
 */

// Structural, not the Drizzle row and not the Dexie row — both satisfy these, and the
// function only ever reads these fields.
export type DepletionProduct = { id: string };
export type DepletionVariant = { id: string; name: string; productId: string; directInventoryId: string | null };
export type DepletionModifier = { id: string; modifierGroupId: string; inventoryItemId: string | null; quantityPerUse: number | null };
export type DepletionBomEntry = {
  sourceType: string;
  sourceId: string;
  inventoryItemId: string;
  sourceProductId: string | null;
  quantityDeducted: number;
  scaleFactorMatrix: Record<string, number> | null;
  overrideModifierGroupId: string | null;
};

export type DepletionLine = {
  variantId: string;
  qty: number;
  modifiers?: { modifierId: string; qty: number }[];
};

export type DepletionData = {
  products: DepletionProduct[];
  variants: DepletionVariant[];
  modifiers: DepletionModifier[];
  bomEntries: DepletionBomEntry[];
};

/** Negative deltas per inventory item for a set of sold lines. */
export function computeInventoryDeductions(
  lineItems: DepletionLine[],
  data: DepletionData,
): Map<string, number> {
  const deltas = new Map<string, number>();

  function addDelta(inventoryItemId: string, amount: number) {
    // A BOM row pointing at nothing deducts from nothing. The server copy had a bare
    // `else` here, which booked a phantom deduction against the empty-string key.
    if (!inventoryItemId) return;
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
      }).filter(Boolean),
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
          const sfm = entry.scaleFactorMatrix;
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
            const sfm = entry.scaleFactorMatrix;
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
