/**
 * Money is stored in cents everywhere in this app and typed in dollars by operators.
 * This is the one place that conversion happens, because a wage or a price parsed by
 * `Number(x) * 100` silently accepts "" as 0 — and a $0.00 wage that looks deliberate is
 * worse than a blank one.
 */

/** Cents from a dollars string, or null when the input is not a usable amount. */
export function parseDollarsToCents(input: string): number | null {
  const trimmed = input.trim().replace(/^\$/, "").replace(/,/g, "");
  if (trimmed === "") return null;
  const dollars = Number(trimmed);
  if (!Number.isFinite(dollars) || dollars < 0) return null;
  return Math.round(dollars * 100);
}

/** Dollars for an input field: "1850" cents becomes "18.50", and null becomes "". */
export function centsToDollarsInput(cents: number | null | undefined): string {
  if (cents == null) return "";
  return (cents / 100).toFixed(2);
}
