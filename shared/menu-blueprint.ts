import { z } from "zod";
import type { Modifier, ModifierGroup, Product, ProductModifierGroup, Variant } from "./schema";

/**
 * A declarative description of a menu — the request body of POST /api/admin/menu/apply.
 *
 * Entities reference each other by name, never by id: a model writing this from an
 * operator's spoken menu should not have to run ID bookkeeping in its head. Names are
 * matched case-insensitively after trimming, which is what makes apply idempotent.
 */

const entityName = z.string().trim().min(1, "must not be empty");
const cents = z.number().int("must be whole cents").nonnegative("must not be negative");

const modifierSchema = z.object({
  name: entityName,
  baseUpcharge: cents.default(0),
});

const modifierGroupSchema = z
  .object({
    name: entityName,
    minSelections: z.number().int().nonnegative().default(0),
    maxSelections: z.number().int().nonnegative().default(1),
    modifiers: z.array(modifierSchema).default([]),
  })
  .refine((g) => g.minSelections <= g.maxSelections, {
    message: "minSelections must not exceed maxSelections",
    path: ["minSelections"],
  });

const variantSchema = z.object({
  name: entityName,
  basePrice: cents,
  sku: z.string().trim().min(1).nullish(),
});

const productSchema = z.object({
  name: entityName,
  type: z.enum(["RETAIL", "RESTAURANT"]).default("RESTAURANT"),
  variants: z.array(variantSchema).default([]),
  // Group names only. Resolved against the blueprint *and* against groups that already
  // exist in the system — that lookup needs current state, so it lives in planMenuApply (T2).
  modifierGroups: z.array(entityName).default([]),
});

/** Names match case-insensitively after trimming, so duplicates within one payload are unresolvable. */
function duplicates(names: string[]): string[] {
  const seen = new Set<string>();
  return names.filter((n) => {
    const key = n.trim().toLowerCase();
    const isDupe = seen.has(key);
    seen.add(key);
    return isDupe;
  });
}

export const menuBlueprintSchema = z
  .object({
    dryRun: z.boolean().default(false),
    modifierGroups: z.array(modifierGroupSchema).default([]),
    products: z.array(productSchema).default([]),
  })
  .superRefine((bp, ctx) => {
    const report = (path: (string | number)[], dupes: string[], what: string) => {
      for (const name of dupes) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path,
          message: `duplicate ${what} name "${name}" — names must be unique`,
        });
      }
    };

    report(["modifierGroups"], duplicates(bp.modifierGroups.map((g) => g.name)), "modifier group");
    report(["products"], duplicates(bp.products.map((p) => p.name)), "product");

    bp.modifierGroups.forEach((g, i) =>
      report(["modifierGroups", i, "modifiers"], duplicates(g.modifiers.map((m) => m.name)), "modifier"),
    );
    bp.products.forEach((p, i) => {
      report(["products", i, "variants"], duplicates(p.variants.map((v) => v.name)), "variant");
      report(["products", i, "modifierGroups"], duplicates(p.modifierGroups), "modifier group reference");
    });
  });

export type MenuBlueprint = z.infer<typeof menuBlueprintSchema>;
export type BlueprintProduct = MenuBlueprint["products"][number];
export type BlueprintVariant = BlueprintProduct["variants"][number];
export type BlueprintModifierGroup = MenuBlueprint["modifierGroups"][number];
export type BlueprintModifier = BlueprintModifierGroup["modifiers"][number];

/** One human-readable validation failure: `products.0.name: must not be empty`. */
export type BlueprintError = { path: string; message: string };

/**
 * Parse a request body. Returns every problem at once — an agent gets one round trip to
 * fix all its mistakes rather than discovering them one failed call at a time.
 */
export function parseMenuBlueprint(
  input: unknown,
): { ok: true; blueprint: MenuBlueprint } | { ok: false; errors: BlueprintError[] } {
  const result = menuBlueprintSchema.safeParse(input);
  if (result.success) return { ok: true, blueprint: result.data };
  return {
    ok: false,
    errors: result.error.issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message,
    })),
  };
}

/* ------------------------------------------------------------------ *
 * The diff planner: blueprint + current state -> the list of changes.
 * Pure. No storage calls, no id generation, no clock — so the dry-run
 * preview cannot drift from what applying actually does.
 * ------------------------------------------------------------------ */

/** The current menu, as the ApiAdminStorage list methods return it. */
export type ExistingMenu = {
  products: Product[];
  variants: Variant[];
  modifierGroups: ModifierGroup[];
  modifiers: Modifier[];
  productModifierGroups: ProductModifierGroup[];
};

export type ChangeEntity = "modifierGroup" | "modifier" | "product" | "variant" | "productModifierGroups";

/** What moves on an update, for the operator-facing preview. */
export type FieldDiff = Record<string, { from: unknown; to: unknown }>;

export type MenuChange = {
  op: "create" | "update" | "noop";
  entity: ChangeEntity;
  /** Display name — `Large` for a variant reads as `Latte / Large` with its parent. */
  name: string;
  /** Owning entity's name: a modifier's group, a variant's product. */
  parent?: string;
  /** Existing row id. Absent on `create` — the planner is pure, so T3 mints ids. */
  id?: string;
  /** Present on `update`. */
  fields?: FieldDiff;
  /** Present on `create`: the values to write. Parent linkage is resolved by name at apply time. */
  values?: Record<string, unknown>;
  /** Present on `productModifierGroups`: the full desired set of group names. */
  groupNames?: string[];
};

export type MenuPlan = { changes: MenuChange[]; errors: BlueprintError[] };

/** Names match case-insensitively after trimming. */
const key = (name: string) => name.trim().toLowerCase();
const alive = <T extends { deletedAt: number | null }>(rows: T[]) => rows.filter((r) => r.deletedAt == null);

/** Index live rows by name, first occurrence wins. */
function byName<T extends { name: string; deletedAt: number | null }>(rows: T[]): Map<string, T> {
  const map = new Map<string, T>();
  for (const row of alive(rows)) if (!map.has(key(row.name))) map.set(key(row.name), row);
  return map;
}

/** Only the fields that actually move. Empty means unchanged. */
function diff(current: Record<string, unknown>, desired: Record<string, unknown>): FieldDiff {
  const fields: FieldDiff = {};
  for (const [field, to] of Object.entries(desired)) {
    if (to !== undefined && current[field] !== to) fields[field] = { from: current[field], to };
  }
  return fields;
}

function upsert(
  entity: ChangeEntity,
  name: string,
  existing: { id: string } & Record<string, unknown>,
  desired: Record<string, unknown>,
  parent?: string,
): MenuChange {
  const fields = diff(existing, desired);
  return Object.keys(fields).length > 0
    ? { op: "update", entity, name, parent, id: existing.id, fields }
    : { op: "noop", entity, name, parent, id: existing.id };
}

/**
 * Compute what applying `blueprint` to `existing` would do.
 *
 * Upsert, never delete: anything present in the system but absent from the blueprint is
 * left alone — an agent must not be able to wipe a live menu by omitting a product.
 */
export function planMenuApply(blueprint: MenuBlueprint, existing: ExistingMenu): MenuPlan {
  const changes: MenuChange[] = [];
  const errors: BlueprintError[] = [];

  const existingGroups = byName(existing.modifierGroups);
  const existingProducts = byName(existing.products);

  // 1. Modifier groups, then their modifiers — products reference groups by name.
  for (const group of blueprint.modifierGroups) {
    const desired = { minSelections: group.minSelections, maxSelections: group.maxSelections };
    const current = existingGroups.get(key(group.name));
    changes.push(
      current
        ? upsert("modifierGroup", group.name, current, desired)
        : { op: "create", entity: "modifierGroup", name: group.name, values: desired },
    );

    // A modifier matches within its group. A group being created has no modifiers yet.
    const siblings = current
      ? byName(existing.modifiers.filter((m) => m.modifierGroupId === current.id))
      : new Map<string, Modifier>();

    for (const modifier of group.modifiers) {
      const desiredModifier = { baseUpcharge: modifier.baseUpcharge };
      const currentModifier = siblings.get(key(modifier.name));
      changes.push(
        currentModifier
          ? upsert("modifier", modifier.name, currentModifier, desiredModifier, group.name)
          : { op: "create", entity: "modifier", name: modifier.name, parent: group.name, values: desiredModifier },
      );
    }
  }

  // 2. Products, their variants, and their modifier-group links.
  const blueprintGroupNames = new Set(blueprint.modifierGroups.map((g) => key(g.name)));

  blueprint.products.forEach((product, productIndex) => {
    const current = existingProducts.get(key(product.name));
    changes.push(
      current
        ? upsert("product", product.name, current, { type: product.type })
        : { op: "create", entity: "product", name: product.name, values: { type: product.type } },
    );

    // A variant matches within its product.
    const siblings = current
      ? byName(existing.variants.filter((v) => v.productId === current.id))
      : new Map<string, Variant>();

    for (const variant of product.variants) {
      const desired = { basePrice: variant.basePrice, sku: variant.sku ?? undefined };
      const currentVariant = siblings.get(key(variant.name));
      changes.push(
        currentVariant
          ? upsert("variant", variant.name, currentVariant, desired, product.name)
          : { op: "create", entity: "variant", name: variant.name, parent: product.name, values: desired },
      );
    }

    // A group reference must name a group in the blueprint or one that already exists.
    const unknownGroups = product.modifierGroups.filter(
      (name) => !blueprintGroupNames.has(key(name)) && !existingGroups.has(key(name)),
    );
    unknownGroups.forEach((name) => {
      errors.push({
        path: `products.${productIndex}.modifierGroups`,
        message: `unknown modifier group "${name}" — define it in the blueprint or create it first`,
      });
    });
    if (unknownGroups.length > 0) return;

    // setProductModifierGroups replaces the whole set, so the desired set is the union of
    // what the product already has with what the blueprint asks for. Anything else would
    // silently unlink groups the blueprint simply did not mention.
    const linkedNames = current
      ? existing.productModifierGroups
          .filter((link) => link.productId === current.id && link.deletedAt == null)
          .map((link) => existing.modifierGroups.find((g) => g.id === link.modifierGroupId)?.name)
          .filter((name): name is string => name != null)
      : [];

    const groupNames = [...linkedNames];
    const seen = new Set(linkedNames.map(key));
    let added = false;
    for (const name of product.modifierGroups) {
      if (seen.has(key(name))) continue;
      seen.add(key(name));
      groupNames.push(name);
      added = true;
    }

    if (product.modifierGroups.length > 0 || linkedNames.length > 0) {
      changes.push({
        op: added ? (current ? "update" : "create") : "noop",
        entity: "productModifierGroups",
        name: product.name,
        id: current?.id,
        groupNames,
      });
    }
  });

  return { changes, errors };
}
