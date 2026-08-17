/**
 * What a menu item costs to make, and what that leaves.
 *
 * The hard part — walking the recipe through modifiers, scale factors and composite
 * sub-products — is `computeInventoryDeductions`. This prices the map it returns. Do not
 * write a second BOM traversal; if this file grows one, it was built wrong.
 *
 * `lastPurchasePrice` is per *stocking* unit (Feature 11), which is the unit BOM
 * quantities are in, so a line cost is a plain multiplication.
 */
import { computeInventoryDeductions, type DepletionData } from "./depletion";

export type CostedIngredient = {
  name: string;
  /** Stocking units consumed. Always positive here, whatever sign the ledger uses. */
  quantity: number;
  lastPurchasePrice: number | null;
};

export type Cost = {
  /** What the *priced* ingredients add up to. A floor, not the answer, when anything is unknown. */
  costCents: number;
  /**
   * Ingredients with no recorded price. Non-empty means `costCents` is incomplete — an
   * unpriced ingredient is unknown, never free. Zero cost renders as 100% margin, which
   * is the most flattering possible lie about a menu.
   */
  unknownIngredients: string[];
};

/** Sum priced ingredients, naming the ones that have no price rather than dropping them. */
export function sumIngredientCosts(ingredients: CostedIngredient[]): Cost {
  let costCents = 0;
  const unknownIngredients: string[] = [];

  for (const ing of ingredients) {
    if (ing.lastPurchasePrice == null) {
      if (!unknownIngredients.includes(ing.name)) unknownIngredients.push(ing.name);
      continue;
    }
    costCents += ing.quantity * ing.lastPurchasePrice;
  }

  return { costCents: Math.round(costCents), unknownIngredients };
}

export type CostingData = DepletionData & {
  inventoryItems: { id: string; name: string; lastPurchasePrice: number | null }[];
};

/** What one of this variant costs to make, at recorded ingredient prices. */
export function costVariant(variantId: string, data: CostingData): Cost {
  const deltas = computeInventoryDeductions([{ variantId, qty: 1 }], data);

  const ingredients: CostedIngredient[] = [];
  deltas.forEach((delta, inventoryItemId) => {
    const item = data.inventoryItems.find(i => i.id === inventoryItemId);
    // An id the catalogue does not know is unpriceable, and saying so beats ignoring it.
    if (!item) {
      ingredients.push({ name: inventoryItemId, quantity: Math.abs(delta), lastPurchasePrice: null });
      return;
    }
    ingredients.push({ name: item.name, quantity: Math.abs(delta), lastPurchasePrice: item.lastPurchasePrice });
  });

  return sumIngredientCosts(ingredients);
}

/**
 * Margin as a percentage of price, or null when it cannot honestly be stated — an
 * unknown cost or a giveaway price. Never clamped: an item priced below what it costs
 * reports a negative margin, which is the whole point of costing a menu.
 */
export function marginPct(priceCents: number, cost: Cost): number | null {
  if (cost.unknownIngredients.length > 0 || priceCents <= 0) return null;
  return ((priceCents - cost.costCents) / priceCents) * 100;
}
