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

/**
 * The grid's own order: the arrangement an operator dragged, then name for anything that has
 * never been positioned. Products with no `sortOrder` sort last rather than first, so a newly
 * added item lands at the end of its category instead of in the middle of the layout.
 */
export function sortProducts<T extends GridProduct & { name: string; sortOrder?: number | null }>(products: T[]): T[] {
  return [...products].sort((a, b) => {
    const aOrder = a.sortOrder ?? Number.MAX_SAFE_INTEGER;
    const bOrder = b.sortOrder ?? Number.MAX_SAFE_INTEGER;
    if (aOrder !== bOrder) return aOrder - bOrder;
    return a.name.localeCompare(b.name);
  });
}

/**
 * Moving one product to another's position: the rows to write, and nothing else.
 *
 * Every product in the list gets a contiguous `sortOrder`, which is what stops an arrangement
 * from degrading into ties after a few moves — but only the rows whose position actually
 * changed are returned, so a drop writes two or three records rather than the whole menu.
 */
export function reorderProducts<T extends GridProduct & { id: string; name: string; sortOrder?: number | null }>(
  products: T[],
  movedId: string,
  targetId: string,
): Array<{ id: string; sortOrder: number }> {
  if (movedId === targetId) return [];

  const ordered = sortProducts(products);
  const from = ordered.findIndex(p => p.id === movedId);
  const to = ordered.findIndex(p => p.id === targetId);
  if (from === -1 || to === -1) return [];

  const moved = ordered[from];
  ordered.splice(from, 1);
  ordered.splice(to, 0, moved);

  return ordered
    .map((product, index) => ({ id: product.id, sortOrder: index, was: product.sortOrder }))
    .filter(row => row.was !== row.sortOrder)
    .map(({ id, sortOrder }) => ({ id, sortOrder }));
}
