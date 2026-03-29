import { db } from "./db";
import { clients, backups, syncRecords } from "./schema";
import type { Client, Backup, SyncRecord } from "./schema";
import { eq, desc, sql, and, gt, inArray } from "drizzle-orm";

interface BackupSnapshot {
  products: unknown[];
  variants: unknown[];
  modifierGroups: unknown[];
  productModifierGroups: unknown[];
  modifiers: unknown[];
  inventoryItems: unknown[];
  billOfMaterials: unknown[];
  employees: unknown[];
  timePunches: unknown[];
  sales: unknown[];
}

function isBackupSnapshot(value: unknown): value is BackupSnapshot {
  if (typeof value !== "object" || value === null) return false;
  const obj = value as Record<string, unknown>;
  return (
    Array.isArray(obj.products) &&
    Array.isArray(obj.variants) &&
    Array.isArray(obj.inventoryItems) &&
    Array.isArray(obj.sales)
  );
}

interface SyncChange {
  tableName: string;
  recordId: string;
  data: Record<string, unknown>;
  updatedAt: number;
  deletedAt: number | null;
}

export interface IStorage {
  getOrCreateClient(code: string, name?: string): Promise<Client>;
  getClients(): Promise<(Client & { lastBackupAt: Date | null })[]>;
  createBackup(clientId: number, snapshot: unknown): Promise<Backup>;
  getLatestBackup(clientCode: string): Promise<Backup | null>;
  getAggregatedMetrics(): Promise<{
    clientCount: number;
    totalProducts: number;
    totalVariants: number;
    totalInventoryItems: number;
    totalSales: number;
  }>;
  processSyncChanges(clientId: number, tableNames: string[], changes: SyncChange[], lastSyncedAt: number): Promise<{
    serverChanges: SyncChange[];
    syncedAt: number;
  }>;
  getSyncStatus(clientId: number, tableNames: string[]): Promise<{
    recordCount: number;
    lastUpdatedAt: number | null;
  }>;
}

export const storage: IStorage = {
  async getOrCreateClient(code: string, name?: string): Promise<Client> {
    const [result] = await db
      .insert(clients)
      .values({ code, name: name || null })
      .onConflictDoUpdate({ target: clients.code, set: { name: name || sql`${clients.name}` } })
      .returning();
    return result;
  },

  async getClients(): Promise<(Client & { lastBackupAt: Date | null })[]> {
    const result = await db
      .select({
        id: clients.id,
        code: clients.code,
        name: clients.name,
        createdAt: clients.createdAt,
        lastBackupAt: sql<Date | null>`(SELECT MAX(${backups.createdAt}) FROM ${backups} WHERE ${backups.clientId} = ${clients.id})`,
      })
      .from(clients)
      .orderBy(clients.createdAt);
    return result;
  },

  async createBackup(clientId: number, snapshot: unknown): Promise<Backup> {
    const [backup] = await db.insert(backups).values({ clientId, snapshot }).returning();
    return backup;
  },

  async getLatestBackup(clientCode: string): Promise<Backup | null> {
    const result = await db
      .select({ backup: backups })
      .from(backups)
      .innerJoin(clients, eq(clients.id, backups.clientId))
      .where(eq(clients.code, clientCode))
      .orderBy(desc(backups.createdAt))
      .limit(1);
    return result.length > 0 ? result[0].backup : null;
  },

  async getAggregatedMetrics() {
    const allClients = await db.select().from(clients);
    const clientCount = allClients.length;

    let totalProducts = 0;
    let totalVariants = 0;
    let totalInventoryItems = 0;
    let totalSales = 0;

    for (const client of allClients) {
      const latestBackup = await db
        .select()
        .from(backups)
        .where(eq(backups.clientId, client.id))
        .orderBy(desc(backups.createdAt))
        .limit(1);

      if (latestBackup.length > 0) {
        const snapshot = latestBackup[0].snapshot;
        if (isBackupSnapshot(snapshot)) {
          totalProducts += snapshot.products.length;
          totalVariants += snapshot.variants.length;
          totalInventoryItems += snapshot.inventoryItems.length;
          totalSales += snapshot.sales.length;
        }
      }
    }

    return { clientCount, totalProducts, totalVariants, totalInventoryItems, totalSales };
  },

  async processSyncChanges(clientId: number, tableNames: string[], changes: SyncChange[], lastSyncedAt: number) {
    const syncedAt = Date.now();
    const serverChanges: SyncChange[] = [];
    const processedRecordKeys = new Set<string>();

    for (const change of changes) {
      const key = `${change.tableName}::${change.recordId}`;
      processedRecordKeys.add(key);

      const existing = await db
        .select()
        .from(syncRecords)
        .where(
          and(
            eq(syncRecords.clientId, clientId),
            eq(syncRecords.tableName, change.tableName),
            eq(syncRecords.recordId, change.recordId),
          )
        )
        .limit(1);

      if (existing.length === 0) {
        await db.insert(syncRecords).values({
          clientId,
          tableName: change.tableName,
          recordId: change.recordId,
          data: change.data,
          updatedAt: change.updatedAt,
          deletedAt: change.deletedAt,
        });
      } else {
        const serverRecord = existing[0];
        if (change.updatedAt >= serverRecord.updatedAt) {
          await db
            .update(syncRecords)
            .set({
              data: change.data,
              updatedAt: change.updatedAt,
              deletedAt: change.deletedAt,
            })
            .where(eq(syncRecords.id, serverRecord.id));
        } else {
          serverChanges.push({
            tableName: serverRecord.tableName,
            recordId: serverRecord.recordId,
            data: serverRecord.data as Record<string, unknown>,
            updatedAt: serverRecord.updatedAt,
            deletedAt: serverRecord.deletedAt ?? null,
          });
        }
      }
    }

    {
      const conditions = [
        eq(syncRecords.clientId, clientId),
        inArray(syncRecords.tableName, tableNames),
      ];
      if (lastSyncedAt > 0) {
        conditions.push(gt(syncRecords.updatedAt, lastSyncedAt));
      }
      const serverSideChanges = await db
        .select()
        .from(syncRecords)
        .where(and(...conditions));

      for (const record of serverSideChanges) {
        const key = `${record.tableName}::${record.recordId}`;
        if (!processedRecordKeys.has(key)) {
          serverChanges.push({
            tableName: record.tableName,
            recordId: record.recordId,
            data: record.data as Record<string, unknown>,
            updatedAt: record.updatedAt,
            deletedAt: record.deletedAt ?? null,
          });
        }
      }
    }

    return { serverChanges, syncedAt };
  },

  async getSyncStatus(clientId: number, tableNames: string[]) {
    const records = await db
      .select()
      .from(syncRecords)
      .where(
        and(
          eq(syncRecords.clientId, clientId),
          inArray(syncRecords.tableName, tableNames),
        )
      );

    let lastUpdatedAt: number | null = null;
    for (const r of records) {
      if (lastUpdatedAt === null || r.updatedAt > lastUpdatedAt) {
        lastUpdatedAt = r.updatedAt;
      }
    }

    return { recordCount: records.length, lastUpdatedAt };
  },
};
