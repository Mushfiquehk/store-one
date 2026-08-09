import { z } from "zod";

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
