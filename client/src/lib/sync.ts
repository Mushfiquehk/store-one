import { db } from "./db";
import type { SyncCategory } from "@shared/schema";
import { SYNC_CATEGORY_TABLES } from "@shared/schema";

interface SyncChange {
  tableName: string;
  recordId: string;
  data: Record<string, unknown>;
  updatedAt: number;
  deletedAt: number | null;
}

interface SyncResult {
  success: boolean;
  serverChanges: SyncChange[];
  syncedAt: number;
}

const SYNC_STATE_PREFIX = "cornerpos_sync_";

function getSyncStateKey(category: SyncCategory): string {
  return `${SYNC_STATE_PREFIX}${category}_lastSyncedAt`;
}

export function getLastSyncedAt(category: SyncCategory): number {
  const val = localStorage.getItem(getSyncStateKey(category));
  return val ? parseInt(val, 10) : 0;
}

function setLastSyncedAt(category: SyncCategory, timestamp: number): void {
  localStorage.setItem(getSyncStateKey(category), String(timestamp));
}

export function getAutoSyncEnabled(): boolean {
  return localStorage.getItem("cornerpos_auto_sync") === "true";
}

export function setAutoSyncEnabled(enabled: boolean): void {
  localStorage.setItem("cornerpos_auto_sync", String(enabled));
}

export function getAutoSyncInterval(): number {
  const val = localStorage.getItem("cornerpos_auto_sync_interval");
  return val ? parseInt(val, 10) : 15;
}

export function setAutoSyncIntervalMinutes(minutes: number): void {
  localStorage.setItem("cornerpos_auto_sync_interval", String(minutes));
}

function getRecordId(tableName: string, record: Record<string, unknown>): string {
  if (tableName === "productModifierGroups") {
    return `${record.productId}::${record.modifierGroupId}`;
  }
  return record.id as string;
}

const TABLE_TO_DEXIE: Record<string, string> = {
  products: "products",
  variants: "variants",
  modifierGroups: "modifierGroups",
  productModifierGroups: "productModifierGroups",
  modifiers: "modifiers",
  inventoryItems: "inventoryItems",
  billOfMaterials: "billOfMaterials",
  employees: "employees",
  timePunches: "timePunches",
  sales: "sales",
};

async function collectChanges(category: SyncCategory, lastSyncedAt: number): Promise<SyncChange[]> {
  const tableNames = SYNC_CATEGORY_TABLES[category];
  const changes: SyncChange[] = [];

  for (const tableName of tableNames) {
    const dexieTable = TABLE_TO_DEXIE[tableName];
    if (!dexieTable) continue;

    const table = (db as Record<string, unknown>)[dexieTable] as import("dexie").Table;
    let records: Record<string, unknown>[];

    if (lastSyncedAt > 0) {
      records = await table.where("updatedAt").above(lastSyncedAt).toArray() as Record<string, unknown>[];
    } else {
      records = await table.toArray() as Record<string, unknown>[];
    }

    for (const record of records) {
      changes.push({
        tableName,
        recordId: getRecordId(tableName, record),
        data: record,
        updatedAt: (record.updatedAt as number) || Date.now(),
        deletedAt: (record.deletedAt as number) || null,
      });
    }
  }

  return changes;
}

async function applyServerChanges(serverChanges: SyncChange[]): Promise<void> {
  const changesByTable = new Map<string, SyncChange[]>();
  for (const change of serverChanges) {
    const existing = changesByTable.get(change.tableName) || [];
    existing.push(change);
    changesByTable.set(change.tableName, existing);
  }

  for (const [tableName, changes] of changesByTable) {
    const dexieTable = TABLE_TO_DEXIE[tableName];
    if (!dexieTable) continue;

    const table = (db as Record<string, unknown>)[dexieTable] as import("dexie").Table;

    for (const change of changes) {
      if (tableName === "productModifierGroups") {
        const data = change.data;
        const key = [data.productId as string, data.modifierGroupId as string] as [string, string];
        const existing = await table.get(key);
        if (existing) {
          if (change.updatedAt > (existing.updatedAt || 0)) {
            await table.update(key, change.data);
          }
        } else {
          await table.put(change.data);
        }
      } else {
        const existing = await table.get(change.recordId);
        if (existing) {
          if (change.updatedAt > (existing.updatedAt || 0)) {
            await table.update(change.recordId, change.data);
          }
        } else {
          await table.put(change.data);
        }
      }
    }
  }
}

export async function syncCategory(category: SyncCategory, clientCode: string): Promise<{
  success: boolean;
  pushed: number;
  pulled: number;
  error?: string;
}> {
  const lastSyncedAt = getLastSyncedAt(category);
  const changes = await collectChanges(category, lastSyncedAt);

  const res = await fetch(`/api/sync/${category}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clientCode, lastSyncedAt, changes }),
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({ error: "Sync request failed" }));
    return { success: false, pushed: 0, pulled: 0, error: errBody.error || "Sync failed" };
  }

  const result: SyncResult = await res.json();

  if (result.serverChanges.length > 0) {
    await applyServerChanges(result.serverChanges);
  }

  setLastSyncedAt(category, result.syncedAt);

  return {
    success: true,
    pushed: changes.length,
    pulled: result.serverChanges.length,
  };
}

export async function syncAll(clientCode: string): Promise<{
  results: Record<SyncCategory, { success: boolean; pushed: number; pulled: number; error?: string }>;
}> {
  const categories: SyncCategory[] = ["menu", "ingredients", "sales"];
  const results = {} as Record<SyncCategory, { success: boolean; pushed: number; pulled: number; error?: string }>;

  for (const category of categories) {
    results[category] = await syncCategory(category, clientCode);
  }

  return { results };
}

let autoSyncTimer: ReturnType<typeof setInterval> | null = null;

export function startAutoSync(clientCode: string, onSync?: (results: Record<SyncCategory, { success: boolean; pushed: number; pulled: number }>) => void): void {
  stopAutoSync();
  if (!clientCode || !getAutoSyncEnabled()) return;

  const intervalMs = getAutoSyncInterval() * 60 * 1000;

  autoSyncTimer = setInterval(async () => {
    if (!getAutoSyncEnabled()) {
      stopAutoSync();
      return;
    }
    const { results } = await syncAll(clientCode);
    onSync?.(results);
  }, intervalMs);
}

export function stopAutoSync(): void {
  if (autoSyncTimer) {
    clearInterval(autoSyncTimer);
    autoSyncTimer = null;
  }
}
