import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * This file used to be sale-shape.test.ts, and most of it was a tripwire: two
 * `Sale` declarations existed — packages/domain's and the till's — and two tests
 * compared their field lists because a typecheck could not. Feature 36 T2 deleted
 * the till's copy, so those two tests have nothing left to compare and are gone
 * with it. The general rule they were a special case of is in no-shadow.test.ts.
 *
 * What survives is the check that has nothing to do with duplication: every place
 * that writes a sale sets a channel on it.
 */
test("every writer of a sale row sets a channel", () => {
  // Three places build a Sale: the core's single write path and the till's two.
  // A writer that forgets is a sale with no origin, which is the one thing
  // Feature 28 exists to prevent.
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
