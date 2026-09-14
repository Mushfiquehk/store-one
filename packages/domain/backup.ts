// The decision half of restore, kept pure so it can be tested without a browser.
// settings.tsx does the Dexie I/O; everything that decides what gets destroyed lives here.

import { mergeSettingSecrets, redactSetting } from "./schema";

export type Snapshot = Record<string, unknown[]>;

/** The Dexie table the SECRET_SETTING_FIELDS map applies to. */
export const SETTINGS_TABLE = "settings";

const settingKey = (row: unknown): string | null => {
  const key = (row as { key?: unknown } | null)?.key;
  return typeof key === "string" ? key : null;
};

/**
 * The `settings` rows as they may leave the device: secret fields become the marker.
 * Field-level, so hours of operation and the tax rate still travel — only the
 * credential does not. Called on the snapshot, below BACKUP_TABLES' derivation from
 * `db.tables`, which stays as Feature 9 T1 built it.
 */
export function redactSettingsRows(rows: readonly unknown[]): unknown[] {
  return rows.map(row => {
    const key = settingKey(row);
    return key === null ? row : { ...(row as object), value: redactSetting(key, (row as { value: unknown }).value) };
  });
}

/**
 * Restore rule for settings, the same one the API's PUT applies: a redacted secret in
 * a snapshot keeps whatever this device has stored. Restoring a backup must not wipe a
 * working mail configuration.
 */
export function mergeRestoredSettings(incoming: readonly unknown[], stored: readonly unknown[]): unknown[] {
  const byKey = new Map(stored.flatMap(row => {
    const key = settingKey(row);
    return key === null ? [] : [[key, (row as { value: unknown }).value] as const];
  }));
  return incoming.map(row => {
    const key = settingKey(row);
    if (key === null) return row;
    return { ...(row as object), value: mergeSettingSecrets(key, (row as { value: unknown }).value, byKey.get(key) ?? null) };
  });
}

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
