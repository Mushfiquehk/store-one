import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * A Sale is declared twice: `Sale` in packages/domain/schema.ts, which the core
 * writes, and `interface Sale` in apps/pos/src/lib/db.ts, which the till stores
 * in IndexedDB and syncs up. They are structurally identical and nothing makes
 * them so.
 *
 * Feature 28 T2 found this the hard way. Adding `channelKey` to the domain type
 * produced no type error anywhere in the till, because the till was never
 * reading that type — the field simply did not arrive, and the first sign would
 * have been a storefront order syncing up with no channel on it.
 *
 * The honest fix is one declaration. That is a refactor with a Dexie migration
 * attached and it is not this task; until then, this test is what stops the two
 * drifting. It compares field names only — the types beside them are close
 * enough to read by eye, and parsing TypeScript to compare them properly would
 * be a worse thing to maintain than the duplication it guards.
 */

const fieldsOf = (source: string, declaration: string): string[] => {
  const start = source.indexOf(declaration);
  assert.notEqual(start, -1, `could not find ${declaration}`);
  const body = source.slice(start, source.indexOf("\n}", start));
  return [...body.matchAll(/^\s{2}([a-zA-Z][a-zA-Z0-9]*)\??:/gm)].map(m => m[1]).sort();
};

test("the till's Sale and the core's Sale declare the same fields", () => {
  const domain = readFileSync(new URL("./schema.ts", import.meta.url), "utf8");
  const till = readFileSync(new URL("../../apps/pos/src/lib/db.ts", import.meta.url), "utf8");

  const domainFields = fieldsOf(domain, "export type Sale = {");
  const tillFields = fieldsOf(till, "export interface Sale {");

  assert.ok(domainFields.length > 10, "the Sale field scrape found almost nothing — the declaration moved");
  assert.deepEqual(
    tillFields,
    domainFields,
    "apps/pos/src/lib/db.ts and packages/domain/schema.ts disagree about what a Sale is. " +
      "A field added to one and not the other does not fail a typecheck — the till simply " +
      "stops carrying it.",
  );
});

test("both Sale declarations carry channelKey", () => {
  const domain = readFileSync(new URL("./schema.ts", import.meta.url), "utf8");
  const till = readFileSync(new URL("../../apps/pos/src/lib/db.ts", import.meta.url), "utf8");
  assert.ok(fieldsOf(domain, "export type Sale = {").includes("channelKey"));
  assert.ok(fieldsOf(till, "export interface Sale {").includes("channelKey"));
});

test("every writer of a sale row sets a channel", () => {
  // Three places build a Sale: the core's single write path and the till's two.
  // A writer that forgets is a sale with no origin, which is the one thing this
  // feature exists to prevent.
  const writers = [
    ["../../apps/core/storage.ts", "buildSaleRow"],
    ["../../apps/pos/src/lib/dexie-admin-storage.ts", "createSale"],
    ["../../apps/pos/src/lib/local-storage.ts", "createSale"],
  ] as const;
  for (const [file, fn] of writers) {
    const source = readFileSync(new URL(file, import.meta.url), "utf8");
    assert.match(source, /channelKey:/, `${file} (${fn}) writes a sale without a channelKey`);
    assert.match(
      source,
      /POS_CHANNEL_KEY/,
      `${file} (${fn}) does not fall back to the till's channel when the caller gives none`,
    );
  }
});
