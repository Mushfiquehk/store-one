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
import { taxCentsFor, taxRatePct } from "./schema";

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
   * False when nothing was costed at all — no recipe, no direct inventory link. Zero
   * ingredients is not a zero cost: it renders as a 100% margin, which is the same lie as
   * an unpriced ingredient. The seeded menu attaches BOM rows to a product's small variant
   * only, so this is the common case, not a corner one.
   */
  hasRecipe: boolean;
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

  return { costCents: Math.round(costCents), unknownIngredients, hasRecipe: ingredients.length > 0 };
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
  if (!cost.hasRecipe || cost.unknownIngredients.length > 0 || priceCents <= 0) return null;
  return ((priceCents - cost.costCents) / priceCents) * 100;
}

export type MarginVariant = {
  id: string;
  name: string;
  productId: string;
  basePrice: number;
  directInventoryId: string | null;
};

export type MenuMarginRow = {
  variantId: string;
  productName: string;
  variantName: string;
  priceCents: number;
  /** The priced part of the recipe. Meaningless on its own when `costKnown` is false. */
  costCents: number;
  marginCents: number;
  marginPct: number | null;
  costKnown: boolean;
  unknownIngredients: string[];
  /** Units sold in the window. */
  quantity: number;
  /** Margin × units sold: what this row actually contributed over the window. */
  contributionCents: number;
};

/**
 * One row per variant, worst margin first.
 *
 * Worst-first because the rows an operator needs are the bad ones, and a report that
 * opens on the best sellers buries them. Volume rides along because a terrible margin on
 * an item that sells twice a month matters less than a mediocre one on the top seller,
 * and per-unit margin alone cannot show that — so equal margins are ranked by volume, and
 * `contributionCents` is there for anyone who wants to sort by money instead.
 *
 * Rows whose cost is unknown sort last: they are a data-entry task, not a pricing finding,
 * and ranking them as if their cost were zero would put the most flattering rows on top.
 */
export type MarginData = Omit<CostingData, "variants" | "products"> & {
  variants: MarginVariant[];
  products: { id: string; name: string }[];
};

export function menuMargins(
  data: MarginData,
  volumes: { variantId: string; quantity: number }[] = [],
): MenuMarginRow[] {
  const soldByVariant = new Map(volumes.map(v => [v.variantId, v.quantity]));

  const rows = data.variants.map(variant => {
    const cost = costVariant(variant.id, data);
    const costKnown = cost.hasRecipe && cost.unknownIngredients.length === 0;
    const priceCents = variant.basePrice;
    // Not clamped: an item priced below its ingredients is exactly what this is for.
    const marginCents = priceCents - cost.costCents;
    const quantity = soldByVariant.get(variant.id) ?? 0;

    return {
      variantId: variant.id,
      productName: data.products.find(p => p.id === variant.productId)?.name ?? "",
      variantName: variant.name,
      priceCents,
      costCents: cost.costCents,
      marginCents: costKnown ? marginCents : 0,
      marginPct: marginPct(priceCents, cost),
      costKnown,
      unknownIngredients: cost.unknownIngredients,
      quantity,
      // `|| 0` normalises -0, which a zero-volume loss-making row would otherwise carry.
      contributionCents: costKnown ? marginCents * quantity || 0 : 0,
    };
  });

  return rows.sort((a, b) => {
    if (a.costKnown !== b.costKnown) return a.costKnown ? -1 : 1;
    const pctA = a.marginPct ?? 0;
    const pctB = b.marginPct ?? 0;
    if (pctA !== pctB) return pctA - pctB;
    return b.quantity - a.quantity;
  });
}

export type TaxLine = {
  /** What this line actually costs the customer, after any per-line pricing. */
  amountCents: number;
  /** True for a line no tax applies to — groceries, gift cards, whatever the operator marks. */
  exempt: boolean;
};

export type CartTax = {
  taxCents: number;
  /** The base tax was charged on, after discounts. Contains the tax itself when inclusive. */
  taxableCents: number;
  /** What was excluded, so a receipt can show it rather than implying it was taxed. */
  exemptCents: number;
  /** What the lines come to after the discount — before tax is added, when it is added. */
  subtotalCents: number;
  /** What the customer pays. Equal to the subtotal when prices already include tax. */
  totalCents: number;
  inclusive: boolean;
};

export type TaxOptions = {
  ratePct: number;
  /** Cart-level discount, spread across the whole cart. */
  discountCents?: number;
  /** True when menu prices already contain the tax, so it is extracted rather than added. */
  inclusive?: boolean;
};

/**
 * Tax for a cart, in one place — including the total, so no caller has to decide whether to
 * add the tax on.
 *
 * Three rules, each a liability if got wrong:
 *
 * 1. **Only taxable lines are in the base.** One taxable $10 item and one exempt $10 item at
 *    10% is $1.00 of tax, not $2.00.
 * 2. **A discount reduces the taxable base proportionally.** Tax applies to what the customer
 *    pays. Feature 5 T3 owns the order of operations; this follows it.
 * 3. **Inclusive prices have the tax extracted, not added**: `total × rate / (100 + rate)`.
 *    A $10.00 inclusive price at 10% is a $10.00 total containing 91 cents of tax — not
 *    $11.00. Tax is computed once over the base, so the total never gains a stray cent no
 *    matter how many lines the cart has.
 */
export function taxOnCart(lines: TaxLine[], options: TaxOptions): CartTax {
  const { ratePct, discountCents = 0, inclusive = false } = options;
  const grossCents = lines.reduce((total, line) => total + line.amountCents, 0);
  const taxableGross = lines.reduce((total, line) => total + (line.exempt ? 0 : line.amountCents), 0);

  if (grossCents <= 0) {
    return { taxCents: 0, taxableCents: 0, exemptCents: 0, subtotalCents: 0, totalCents: 0, inclusive };
  }

  const subtotalCents = Math.max(0, grossCents - discountCents);
  // The discount is spread across the whole cart, so the taxable share of it is proportional.
  const taxableCents = Math.round(taxableGross * (subtotalCents / grossCents));
  const exemptCents = subtotalCents - taxableCents;

  const rate = taxRatePct(ratePct);
  const taxCents = inclusive
    ? Math.round((taxableCents * rate) / (100 + rate))
    : taxCentsFor(taxableCents, rate);

  return {
    taxCents,
    taxableCents,
    exemptCents,
    subtotalCents,
    totalCents: inclusive ? subtotalCents : subtotalCents + taxCents,
    inclusive,
  };
}
