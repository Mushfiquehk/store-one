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

export type GridProduct = { attributes?: { tags?: string[] } | null };

const tagsOf = (product: GridProduct): string[] => product.attributes?.tags || [];

/**
 * `All` first — so the default hides nothing — then each tag, then `Uncategorised` when
 * something needs a home. Uncategorised is only offered when it would contain something:
 * an empty category is a dead button.
 */
export function menuCategories(products: GridProduct[]): string[] {
  const tags: string[] = [];
  for (const product of products) {
    for (const tag of tagsOf(product)) if (!tags.includes(tag)) tags.push(tag);
  }
  const categories = [ALL_CATEGORY, ...tags];
  if (products.some(p => tagsOf(p).length === 0)) categories.push(UNCATEGORISED);
  return categories;
}

/** The products a category contains. `All` is everything; nothing is ever unreachable. */
export function productsInCategory<T extends GridProduct>(products: T[], category: string): T[] {
  if (category === ALL_CATEGORY) return products;
  if (category === UNCATEGORISED) return products.filter(p => tagsOf(p).length === 0);
  return products.filter(p => tagsOf(p).includes(category));
}
