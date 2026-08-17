import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { ACTIONS, actionLogEntry, priceChangeSummary } from "./action-log";

test("a price change summary carries both prices", () => {
  // "Price changed" is not an answer to "what was it before?", which is the only question
  // anyone asks a log afterwards.
  const summary = priceChangeSummary("Latte / Large", 500, 550);
  assert.equal(summary, "Latte / Large $5.00 → $5.50");
  assert.ok(summary.includes("$5.00") && summary.includes("$5.50"));
});

test("an entry fills its own bookkeeping and nothing else", () => {
  const entry = actionLogEntry(
    {
      actorKind: "EMPLOYEE",
      actorId: "emp_ana",
      action: ACTIONS.PRICE_CHANGED,
      targetType: "variant",
      targetId: "var_1",
      summary: "Latte / Large $5.00 → $5.50",
      detail: null,
    },
    1_700_000_000_000,
    () => "log_1",
  );

  assert.deepEqual(entry, {
    id: "log_1",
    at: 1_700_000_000_000,
    actorKind: "EMPLOYEE",
    actorId: "emp_ana",
    action: "PRICE_CHANGED",
    targetType: "variant",
    targetId: "var_1",
    summary: "Latte / Large $5.00 → $5.50",
    detail: null,
  });
});

test("an unattributed action is SYSTEM with a null actor, not a blank employee", () => {
  const entry = actionLogEntry(
    { actorKind: "SYSTEM", actorId: null, action: ACTIONS.BACKUP_RESTORED, targetType: "database", targetId: null, summary: "Restored backup", detail: null },
    1,
    () => "log_2",
  );
  assert.equal(entry.actorKind, "SYSTEM");
  assert.equal(entry.actorId, null);
  assert.equal(entry.detail, null, "null rather than an empty object");
});

// The property that makes the log worth having, enforced rather than promised: nothing in the
// codebase updates or deletes one of these rows.
test("nothing in the codebase can rewrite the action log", () => {
  const roots = ["client/src/lib", "client/src/pages", "shared", "server"];
  const offenders: string[] = [];

  const walk = (dir: string) => {
    for (const entry of readdirSync(new URL(`../${dir}`, import.meta.url), { withFileTypes: true })) {
      if (entry.isDirectory()) { walk(`${dir}/${entry.name}`); continue; }
      if (!/\.(ts|tsx)$/.test(entry.name) || entry.name.endsWith(".test.ts")) continue;
      const source = readFileSync(new URL(`../${dir}/${entry.name}`, import.meta.url), "utf8");
      for (const forbidden of [
        /actionLog\.update/, /actionLog\.delete/, /actionLog\.clear/, /actionLog\.modify/,
        /update\((\s*)actionLog/, /delete\((\s*)actionLog/,
      ]) {
        if (forbidden.test(source)) offenders.push(`${dir}/${entry.name}: ${forbidden}`);
      }
    }
  };
  roots.forEach(walk);

  assert.deepEqual(offenders, [], "the action log must be append-only");
});
