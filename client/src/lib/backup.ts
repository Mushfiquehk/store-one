import { db, BACKUP_TABLES } from "./db";

// Same settings shape and localStorage convention as auto-sync in ./sync.ts —
// a separate interval, not a second scheduler design.
const LAST_BACKUP_KEY = "cornerpos_sync_lastBackupAt";

export function getLastBackupAt(): number {
  const val = localStorage.getItem(LAST_BACKUP_KEY);
  return val ? parseInt(val, 10) : 0;
}

export function getAutoBackupEnabled(): boolean {
  return localStorage.getItem("cornerpos_auto_backup") === "true";
}

export function setAutoBackupEnabled(enabled: boolean): void {
  localStorage.setItem("cornerpos_auto_backup", String(enabled));
}

export function getAutoBackupInterval(): number {
  const val = localStorage.getItem("cornerpos_auto_backup_interval");
  return val ? parseInt(val, 10) : 60;
}

export function setAutoBackupIntervalMinutes(minutes: number): void {
  localStorage.setItem("cornerpos_auto_backup_interval", String(minutes));
}

/** One snapshot of every table in the Dexie schema, keyed by table name. */
export async function buildSnapshot(): Promise<Record<string, unknown[]>> {
  const entries = await Promise.all(
    BACKUP_TABLES.map(async name => [name, await db.table(name).toArray()] as const),
  );
  return Object.fromEntries(entries);
}

/**
 * Newest `updatedAt` across every table, or 0 if nothing carries one.
 * Snapshots are whole-database blobs, so re-uploading an unchanged one on a timer
 * is pure waste — this is what makes the idle case skip.
 */
export async function latestChangeAt(): Promise<number> {
  let latest = 0;
  for (const name of BACKUP_TABLES) {
    const rows = await db.table(name).toArray();
    for (const row of rows as Array<Record<string, unknown>>) {
      const t = typeof row.updatedAt === "number" ? row.updatedAt : 0;
      if (t > latest) latest = t;
    }
  }
  return latest;
}

export async function runBackup(clientCode: string): Promise<{ createdAt: number }> {
  const snapshot = await buildSnapshot();
  const res = await fetch("/api/backup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clientCode, snapshot }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Backup failed");
  }
  const result = await res.json();
  localStorage.setItem(LAST_BACKUP_KEY, String(result.createdAt));
  return result;
}

/** Backs up only if something changed since the last one. Returns true if it uploaded. */
export async function backupIfChanged(clientCode: string): Promise<boolean> {
  const last = getLastBackupAt();
  if (last && (await latestChangeAt()) <= last) return false;
  await runBackup(clientCode);
  return true;
}

let autoBackupTimer: ReturnType<typeof setInterval> | null = null;

export function startAutoBackup(clientCode: string, onBackup?: (uploaded: boolean) => void): void {
  stopAutoBackup();
  if (!clientCode || !getAutoBackupEnabled()) return;

  autoBackupTimer = setInterval(async () => {
    if (!getAutoBackupEnabled()) {
      stopAutoBackup();
      return;
    }
    try {
      onBackup?.(await backupIfChanged(clientCode));
    } catch {
      // ponytail: a failed automatic backup is surfaced by the "last backup" age on
      // the Settings card going stale, not by interrupting whoever is at the till.
    }
  }, getAutoBackupInterval() * 60 * 1000);
}

export function stopAutoBackup(): void {
  if (autoBackupTimer) {
    clearInterval(autoBackupTimer);
    autoBackupTimer = null;
  }
}
