// An inventory item is bought in one unit and consumed in another: an invoice quotes
// cents per PURCHASE unit ("$4.50 per gallon"), while recipes deduct STOCKING units
// ("12 oz of milk"). `inventoryItems.unitsPerPurchase` is how many stocking units come
// in one purchase unit, and this is the only place the two are reconciled.
//
// ponytail: one conversion factor per item, entered by the operator. No unit algebra,
// no dimension checking. If pack sizes start drifting per delivery, the upgrade is a
// factor per invoice line, not a units library.

/**
 * Cents per stocking unit, from an invoice's cents per purchase unit.
 *
 * An unset, zero or negative factor means the operator has not told us the pack size
 * yet: the price passes through unconverted rather than becoming Infinity or 0 in a
 * money field. That is the same "unknown, not free" rule the costing reports follow.
 */
export function costPerStockUnit(
  unitPriceCents: number,
  unitsPerPurchase: number | null | undefined,
): number {
  if (!unitsPerPurchase || unitsPerPurchase <= 0 || !Number.isFinite(unitsPerPurchase)) {
    return unitPriceCents;
  }
  return unitPriceCents / unitsPerPurchase;
}

/**
 * Stocking units received, from a quantity counted in purchase units.
 *
 * The other half of the same conversion: an invoice line says "1" and means one gallon,
 * while stock is counted in ounces. Same guard as above — an unset factor receives the
 * quantity as typed, which is exactly today's behaviour.
 */
export function stockUnitsReceived(
  quantity: number,
  unitsPerPurchase: number | null | undefined,
): number {
  if (!unitsPerPurchase || unitsPerPurchase <= 0 || !Number.isFinite(unitsPerPurchase)) {
    return quantity;
  }
  return quantity * unitsPerPurchase;
}

/**
 * Money at stocking-unit scale. A cent is a coarse unit here — milk at $4.50 a gallon is
 * 3.5c an ounce — so this keeps up to four decimal places rather than rounding a real
 * cost to $0.04 and losing the difference between 3.5c and 4c across ten thousand ounces.
 */
export function formatCostPerStockUnit(cents: number): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 4,
  }).format(cents / 100);
}
