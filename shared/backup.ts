// The decision half of restore, kept pure so it can be tested without a browser.
// settings.tsx does the Dexie I/O; everything that decides what gets destroyed lives here.

export type Snapshot = Record<string, unknown[]>;

export type RestorePlan = {
  /** Tables the snapshot carries data for: clear these, then write the rows back. */
  restore: string[];
  /** Known tables the snapshot says nothing about: leave them completely alone. */
  untouched: string[];
  /** Non-empty means abort before touching the database. */
  errors: string[];
};

/**
 * Decide what a restore may destroy.
 *
 * The rule that matters: a table is cleared only if the snapshot has a key for it.
 * `sales: []` means "this store had no sales" and clears. A snapshot with no `sales`
 * key at all is an older or partial format, and wiping sales because a key is missing
 * is exactly the data loss this exists to prevent.
 */
export function planRestore(snapshot: unknown, knownTables: readonly string[]): RestorePlan {
  const errors: string[] = [];

  if (snapshot === null || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    return { restore: [], untouched: [...knownTables], errors: ["Backup is not a snapshot object."] };
  }

  const entries = Object.entries(snapshot as Record<string, unknown>);

  const unknown = entries.map(([k]) => k).filter(k => !knownTables.includes(k));
  if (unknown.length) {
    errors.push(`Backup contains tables this app does not know: ${unknown.join(", ")}.`);
  }

  const notArrays = entries.filter(([, v]) => !Array.isArray(v)).map(([k]) => k);
  if (notArrays.length) {
    errors.push(`Backup entries are not row arrays: ${notArrays.join(", ")}.`);
  }

  const restore = knownTables.filter(t => Object.prototype.hasOwnProperty.call(snapshot, t));
  if (!restore.length && !errors.length) {
    errors.push("Backup contains no tables to restore.");
  }

  // Any error means nothing is restored — a partially-understood snapshot must not
  // clear the tables it did happen to parse.
  if (errors.length) return { restore: [], untouched: [...knownTables], errors };

  return {
    restore,
    untouched: knownTables.filter(t => !restore.includes(t)),
    errors: [],
  };
}

/** Row counts a restore is about to replace, for the confirmation prompt. */
export function describeRestore(
  plan: RestorePlan,
  currentCounts: Record<string, number>,
): string {
  const affected = plan.restore
    .map(t => ({ table: t, count: currentCounts[t] ?? 0 }))
    .filter(r => r.count > 0)
    .sort((a, b) => b.count - a.count);

  if (!affected.length) return "This device has no data to replace.";
  return `This will replace ${affected.map(r => `${r.count} ${r.table}`).join(", ")} on this device.`;
}
