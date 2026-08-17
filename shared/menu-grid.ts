/**
 * Which categories the till shows, and what is in one.
 *
 * The bug this exists to prevent: the category bar was built from tags only, and the code
 * that showed *everything* ran only when no tag existed anywhere. Every real store has at
 * least one tagged product, so that branch was dead — and a product with no tags appeared
 * under no category at all. An operator added an item, could not find it on the till, and had
 * no way to tell whether it had even saved.
 */
export const ALL_CATEGORY = "__all__";
export const UNCATEGORISED = "__uncategorised__";

export type GridProduct = {
  category?: string | null;
  attributes?: { tags?: string[] } | null;
};

const tagsOf = (product: GridProduct): string[] => product.attributes?.tags || [];

/**
 * A product's category: its own field, falling back to its first tag.
 *
 * The fallback is what makes this migration free — a row written before products had a
 * category keeps appearing exactly where it did, and nothing has to be re-tagged.
 */
export function categoryOf(product: GridProduct): string | null {
  if (product.category != null && product.category !== "") return product.category;
  return tagsOf(product)[0] ?? null;
}

/**
 * `All` first — so the default hides nothing — then each tag, then `Uncategorised` when
 * something needs a home. Uncategorised is only offered when it would contain something:
 * an empty category is a dead button.
 */
export function menuCategories(products: GridProduct[], configured: string[] = []): string[] {
  // The operator's order first, including categories that are currently empty — an empty
  // category is where things should go, and hiding it hides that.
  const ordered = configured.filter((c, i) => c.trim() !== "" && configured.indexOf(c) === i);

  // Then anything products claim that the list has not been told about, so a category is never
  // the reason a product cannot be found.
  for (const product of products) {
    const category = categoryOf(product);
    if (category != null && !ordered.includes(category)) ordered.push(category);
  }

  const categories = [ALL_CATEGORY, ...ordered];
  if (products.some(p => categoryOf(p) == null)) categories.push(UNCATEGORISED);
  return categories;
}

/** The products a category contains. `All` is everything; nothing is ever unreachable. */
export function productsInCategory<T extends GridProduct>(products: T[], category: string): T[] {
  if (category === ALL_CATEGORY) return products;
  if (category === UNCATEGORISED) return products.filter(p => categoryOf(p) == null);
  return products.filter(p => categoryOf(p) === category);
}

/**
 * Renaming a category: the new list, plus the products that have to be rewritten.
 *
 * One function so the two halves cannot drift apart — a rename that updates the setting and
 * forgets the products silently empties a category and makes every item in it uncategorised,
 * which is the failure this returns the product ids to prevent.
 */
export function renameCategory<T extends GridProduct & { id: string }>(
  configured: string[],
  products: T[],
  from: string,
  to: string,
): { categories: string[]; productIds: string[] } {
  const target = to.trim();
  if (!target || target === from) return { categories: configured, productIds: [] };

  const categories = configured.map(c => (c === from ? target : c))
    .filter((c, i, list) => list.indexOf(c) === i);

  return {
    categories,
    productIds: products.filter(p => categoryOf(p) === from).map(p => p.id),
  };
}
