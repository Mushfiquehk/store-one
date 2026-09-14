import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * **A type that packages/domain declares must not be declared anywhere else.**
 *
 * This is the general form of a tripwire Feature 28 T2 left behind. The till kept
 * its own `interface Sale` beside the domain's `type Sale`; adding `channelKey`
 * to one produced no error from the other, because nothing connected them. By
 * the time anybody looked, one of the sixteen shadowed types had already drifted
 * — `InventoryItem`, whose two optional fields let a writer compile that created
 * inventory with no purchase factor at all.
 *
 * Nothing about that was detectable by a typecheck. Two identical declarations
 * typecheck perfectly; they are wrong only in the sense that one of them will be
 * edited one day and the other will not. So it is asserted here instead, in the
 * same shape as the append-only action-log walk: read the files by name and fail
 * on what should not be in them.
 */

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const domainSchema = path.join(repoRoot, "packages", "domain", "schema.ts");

/** Every exported type or interface name declared in a file. */
function declaredTypes(source: string): string[] {
  return [
    ...[...source.matchAll(/^export type (\w+) = \{/gm)].map(m => m[1]),
    ...[...source.matchAll(/^export interface (\w+) \{/gm)].map(m => m[1]),
  ];
}

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "dist") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) { out.push(...sourceFiles(full)); continue; }
    if (/\.tsx?$/.test(entry.name) && !entry.name.endsWith(".test.ts")) out.push(full);
  }
  return out;
}

test("no app re-declares a type that packages/domain already owns", () => {
  const owned = new Set(declaredTypes(readFileSync(domainSchema, "utf8")));
  assert.ok(owned.size > 10, "the scrape of packages/domain/schema.ts found almost nothing");
  assert.ok(owned.has("Sale"), "Sale is the type this test was written about");

  const offenders: string[] = [];
  for (const file of sourceFiles(path.join(repoRoot, "apps"))) {
    for (const name of declaredTypes(readFileSync(file, "utf8"))) {
      if (owned.has(name)) offenders.push(`${path.relative(repoRoot, file)} declares ${name}`);
    }
  }

  assert.deepEqual(
    offenders,
    [],
    "an app declared a type packages/domain/schema.ts already owns. Import and re-export it " +
      "instead — two identical declarations typecheck perfectly, and are wrong only in that one " +
      "of them gets edited one day and the other does not.",
  );
});

test("the till re-exports the domain's entities rather than owning them", () => {
  // The other half of the same rule: db.ts must still hand these out, or every
  // `from "@/lib/db"` in the till breaks. The rule is not "declare nothing", it
  // is "declare it once and pass it on".
  const db = readFileSync(path.join(repoRoot, "apps", "pos", "src", "lib", "db.ts"), "utf8");
  for (const name of ["Sale", "Product", "Variant", "InventoryItem", "Employee", "Combo"]) {
    assert.match(
      db,
      new RegExp(`\\b${name}\\b`),
      `apps/pos/src/lib/db.ts no longer mentions ${name}, so importers of it are broken`,
    );
  }
  assert.match(db, /export type \{/, "db.ts stopped re-exporting the domain types");
});
