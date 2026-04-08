import { db } from "./db";
import {
  clients, backups, syncRecords,
  adminProducts, adminVariants, adminModifierGroups,
  adminProductModifierGroups, adminModifiers, adminInventoryItems,
  adminBillOfMaterials, adminInvoices, adminInvoiceLineItems,
} from "./schema";
import type { Client, Backup, SyncRecord } from "./schema";
import { eq, desc, sql, and, gt, inArray, isNull, count } from "drizzle-orm";

export interface ListOptions {
  limit?: number;
  offset?: number;
  [key: string]: unknown;
}

export interface ListResult<T> {
  items: T[];
  total: number;
}

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

export interface IAdminStorage {
  listProducts(opts?: ListOptions): Promise<ListResult<unknown>>;
  getProduct(id: string): Promise<unknown | null>;
  createProduct(data: Record<string, unknown>): Promise<unknown>;
  updateProduct(id: string, data: Record<string, unknown>): Promise<unknown | null>;
  deleteProduct(id: string): Promise<void>;

  listVariants(opts?: ListOptions): Promise<ListResult<unknown>>;
  getVariant(id: string): Promise<unknown | null>;
  createVariant(data: Record<string, unknown>): Promise<unknown>;
  updateVariant(id: string, data: Record<string, unknown>): Promise<unknown | null>;
  deleteVariant(id: string): Promise<void>;

  listModifierGroups(opts?: ListOptions): Promise<ListResult<unknown>>;
  getModifierGroup(id: string): Promise<unknown | null>;
  createModifierGroup(data: Record<string, unknown>): Promise<unknown>;
  updateModifierGroup(id: string, data: Record<string, unknown>): Promise<unknown | null>;
  deleteModifierGroup(id: string): Promise<void>;

  listModifiers(opts?: ListOptions): Promise<ListResult<unknown>>;
  getModifier(id: string): Promise<unknown | null>;
  createModifier(data: Record<string, unknown>): Promise<unknown>;
  updateModifier(id: string, data: Record<string, unknown>): Promise<unknown | null>;
  deleteModifier(id: string): Promise<void>;

  listProductModifierGroups(opts?: ListOptions): Promise<ListResult<unknown>>;
  setProductModifierGroups(productId: string, groupIds: string[]): Promise<void>;
  setProductModifierGroupScaleFactors(productId: string, modifierGroupId: string, scaleFactors: unknown): Promise<unknown | null>;

  listInventoryItems(opts?: ListOptions): Promise<ListResult<unknown>>;
  getInventoryItem(id: string): Promise<unknown | null>;
  createInventoryItem(data: Record<string, unknown>): Promise<unknown>;
  updateInventoryItem(id: string, data: Record<string, unknown>): Promise<unknown | null>;
  adjustInventoryQuantity(id: string, delta: number): Promise<unknown | null>;
  deleteInventoryItem(id: string): Promise<void>;

  listBom(opts?: ListOptions): Promise<ListResult<unknown>>;
  getBom(id: string): Promise<unknown | null>;
  createBom(data: Record<string, unknown>): Promise<unknown>;
  updateBom(id: string, data: Record<string, unknown>): Promise<unknown | null>;
  deleteBom(id: string): Promise<void>;

  listInvoices(opts?: ListOptions): Promise<ListResult<unknown>>;
  getInvoice(id: string): Promise<unknown | null>;
  createInvoice(data: Record<string, unknown>): Promise<unknown>;
  updateInvoice(id: string, data: Record<string, unknown>): Promise<unknown | null>;
  deleteInvoice(id: string): Promise<void>;

  listInvoiceLineItems(opts?: ListOptions): Promise<ListResult<unknown>>;
  getInvoiceLineItem(id: string): Promise<unknown | null>;
  createInvoiceLineItem(data: Record<string, unknown>): Promise<unknown>;
  updateInvoiceLineItem(id: string, data: Record<string, unknown>): Promise<unknown | null>;
  deleteInvoiceLineItem(id: string): Promise<void>;

  createInvoiceWithLineItems(invoiceData: Record<string, unknown>, lineItems: Record<string, unknown>[]): Promise<unknown>;
  getAllAdminData(): Promise<Record<string, unknown[]>>;
  getAllAdminDataWithDeleted(): Promise<Record<string, unknown[]>>;
  applyChanges(changes: { tableName: string; recordId: string; data: Record<string, unknown>; action: string }[]): Promise<void>;
  getClientSyncData(clientCode: string): Promise<Record<string, Record<string, unknown>[]> | null>;
  applyClientSyncChanges(clientCode: string, changes: { tableName: string; recordId: string; data: Record<string, unknown>; action: string }[]): Promise<true | null>;
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

    const adminLookups: Record<string, (recordId: string) => Promise<Record<string, unknown> | null>> = {
      products: async (recordId) => {
        const [r] = await db.select().from(adminProducts).where(eq(adminProducts.id, recordId)).limit(1);
        return r ? (r as unknown as Record<string, unknown>) : null;
      },
      variants: async (recordId) => {
        const [r] = await db.select().from(adminVariants).where(eq(adminVariants.id, recordId)).limit(1);
        return r ? (r as unknown as Record<string, unknown>) : null;
      },
      modifierGroups: async (recordId) => {
        const [r] = await db.select().from(adminModifierGroups).where(eq(adminModifierGroups.id, recordId)).limit(1);
        return r ? (r as unknown as Record<string, unknown>) : null;
      },
      modifiers: async (recordId) => {
        const [r] = await db.select().from(adminModifiers).where(eq(adminModifiers.id, recordId)).limit(1);
        return r ? (r as unknown as Record<string, unknown>) : null;
      },
      inventoryItems: async (recordId) => {
        const [r] = await db.select().from(adminInventoryItems).where(eq(adminInventoryItems.id, recordId)).limit(1);
        return r ? (r as unknown as Record<string, unknown>) : null;
      },
      billOfMaterials: async (recordId) => {
        const [r] = await db.select().from(adminBillOfMaterials).where(eq(adminBillOfMaterials.id, recordId)).limit(1);
        return r ? (r as unknown as Record<string, unknown>) : null;
      },
      invoices: async (recordId) => {
        const [r] = await db.select().from(adminInvoices).where(eq(adminInvoices.id, recordId)).limit(1);
        return r ? (r as unknown as Record<string, unknown>) : null;
      },
      invoiceLineItems: async (recordId) => {
        const [r] = await db.select().from(adminInvoiceLineItems).where(eq(adminInvoiceLineItems.id, recordId)).limit(1);
        return r ? (r as unknown as Record<string, unknown>) : null;
      },
      productModifierGroups: async (recordId) => {
        const [pId, gId] = recordId.split("::");
        if (!pId || !gId) return null;
        const [r] = await db.select().from(adminProductModifierGroups)
          .where(and(eq(adminProductModifierGroups.productId, pId), eq(adminProductModifierGroups.modifierGroupId, gId)))
          .limit(1);
        return r ? (r as unknown as Record<string, unknown>) : null;
      },
    };

    for (const change of changes) {
      const key = `${change.tableName}::${change.recordId}`;
      processedRecordKeys.add(key);

      const getAdminRecord = adminLookups[change.tableName];
      if (getAdminRecord) {
        const adminRecord = await getAdminRecord(change.recordId);
        if (adminRecord) {
          const adminUpdatedAt = (adminRecord.updatedAt as number) || 0;
          const adminDeletedAt = (adminRecord.deletedAt as number) || null;
          const adminData = { ...adminRecord };

          const posDataJson = JSON.stringify(change.data);
          const adminDataJson = JSON.stringify(adminData);
          const dataMatches = posDataJson === adminDataJson && change.deletedAt === adminDeletedAt;

          if (!dataMatches) {
            await db
              .insert(syncRecords)
              .values({
                clientId,
                tableName: change.tableName,
                recordId: change.recordId,
                data: adminData,
                updatedAt: adminUpdatedAt,
                deletedAt: adminDeletedAt,
              })
              .onConflictDoUpdate({
                target: [syncRecords.clientId, syncRecords.tableName, syncRecords.recordId],
                set: {
                  data: adminData,
                  updatedAt: adminUpdatedAt,
                  deletedAt: adminDeletedAt,
                },
              });

            serverChanges.push({
              tableName: change.tableName,
              recordId: change.recordId,
              data: adminData,
              updatedAt: adminUpdatedAt,
              deletedAt: adminDeletedAt,
            });
            continue;
          }

          await db
            .insert(syncRecords)
            .values({
              clientId,
              tableName: change.tableName,
              recordId: change.recordId,
              data: adminData,
              updatedAt: adminUpdatedAt,
              deletedAt: adminDeletedAt,
            })
            .onConflictDoUpdate({
              target: [syncRecords.clientId, syncRecords.tableName, syncRecords.recordId],
              set: {
                data: adminData,
                updatedAt: adminUpdatedAt,
                deletedAt: adminDeletedAt,
              },
            });
          continue;
        }
      }

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

export const adminStorage: IAdminStorage = {
  async listProducts(opts: ListOptions = {}): Promise<ListResult<unknown>> {
    const conditions = [isNull(adminProducts.deletedAt)];
    const [totalResult] = await db.select({ count: count() }).from(adminProducts).where(and(...conditions));
    let query = db.select().from(adminProducts).where(and(...conditions)).$dynamic();
    if (opts.limit) query = query.limit(opts.limit);
    if (opts.offset) query = query.offset(opts.offset);
    const items = await query;
    return { items, total: totalResult.count };
  },
  async getProduct(id: string) {
    const [r] = await db.select().from(adminProducts).where(eq(adminProducts.id, id)).limit(1);
    return r || null;
  },
  async createProduct(data: Record<string, unknown>) {
    const now = Date.now();
    const row = {
      id: data.id as string, name: data.name as string,
      type: (data.type as string) || "RETAIL",
      isComposite: (data.isComposite as boolean) ?? false,
      availableAsIngredient: (data.availableAsIngredient as boolean) ?? false,
      attributes: data.attributes ?? null,
      createdAt: (data.createdAt as string) ?? new Date().toISOString(),
      updatedAt: now, deletedAt: null,
    };
    const [r] = await db.insert(adminProducts).values(row)
      .onConflictDoUpdate({ target: adminProducts.id, set: { ...row, updatedAt: now } }).returning();
    return r;
  },
  async updateProduct(id: string, data: Record<string, unknown>) {
    const now = Date.now();
    const set: Record<string, unknown> = { updatedAt: now };
    if (data.name !== undefined) set.name = data.name;
    if (data.type !== undefined) set.type = data.type;
    if (data.isComposite !== undefined) set.isComposite = data.isComposite;
    if (data.availableAsIngredient !== undefined) set.availableAsIngredient = data.availableAsIngredient;
    if (data.attributes !== undefined) set.attributes = data.attributes;
    const [r] = await db.update(adminProducts).set(set).where(eq(adminProducts.id, id)).returning();
    return r || null;
  },
  async deleteProduct(id: string) {
    const now = Date.now();
    await db.update(adminProducts).set({ deletedAt: now, updatedAt: now }).where(eq(adminProducts.id, id));
    const variants = await db.select({ id: adminVariants.id }).from(adminVariants).where(eq(adminVariants.productId, id));
    await db.update(adminVariants).set({ deletedAt: now, updatedAt: now }).where(eq(adminVariants.productId, id));
    await db.update(adminProductModifierGroups).set({ deletedAt: now, updatedAt: now }).where(eq(adminProductModifierGroups.productId, id));
    await db.update(adminBillOfMaterials).set({ deletedAt: now, updatedAt: now }).where(eq(adminBillOfMaterials.sourceProductId, id));
    for (const v of variants) {
      await db.update(adminBillOfMaterials).set({ deletedAt: now, updatedAt: now }).where(and(eq(adminBillOfMaterials.sourceType, "VARIANT"), eq(adminBillOfMaterials.sourceId, v.id)));
    }
  },

  async listVariants(opts: ListOptions = {}): Promise<ListResult<unknown>> {
    const conditions = [isNull(adminVariants.deletedAt)];
    if (opts.productId) conditions.push(eq(adminVariants.productId, opts.productId as string));
    const [totalResult] = await db.select({ count: count() }).from(adminVariants).where(and(...conditions));
    let query = db.select().from(adminVariants).where(and(...conditions)).$dynamic();
    if (opts.limit) query = query.limit(opts.limit);
    if (opts.offset) query = query.offset(opts.offset);
    const items = await query;
    return { items, total: totalResult.count };
  },
  async getVariant(id: string) {
    const [r] = await db.select().from(adminVariants).where(eq(adminVariants.id, id)).limit(1);
    return r || null;
  },
  async createVariant(data: Record<string, unknown>) {
    const now = Date.now();
    const row = {
      id: data.id as string, productId: data.productId as string,
      sku: (data.sku as string) ?? null, name: data.name as string,
      basePrice: (data.basePrice as number) ?? 0,
      directInventoryId: (data.directInventoryId as string) ?? null,
      updatedAt: now, deletedAt: null,
    };
    const [r] = await db.insert(adminVariants).values(row)
      .onConflictDoUpdate({ target: adminVariants.id, set: { ...row, updatedAt: now } }).returning();
    return r;
  },
  async updateVariant(id: string, data: Record<string, unknown>) {
    const now = Date.now();
    const set: Record<string, unknown> = { updatedAt: now };
    if (data.name !== undefined) set.name = data.name;
    if (data.productId !== undefined) set.productId = data.productId;
    if (data.sku !== undefined) set.sku = data.sku;
    if (data.basePrice !== undefined) set.basePrice = data.basePrice;
    if (data.directInventoryId !== undefined) set.directInventoryId = data.directInventoryId;
    const [r] = await db.update(adminVariants).set(set).where(eq(adminVariants.id, id)).returning();
    return r || null;
  },
  async deleteVariant(id: string) {
    const now = Date.now();
    await db.update(adminVariants).set({ deletedAt: now, updatedAt: now }).where(eq(adminVariants.id, id));
    await db.update(adminBillOfMaterials).set({ deletedAt: now, updatedAt: now }).where(and(eq(adminBillOfMaterials.sourceType, "VARIANT"), eq(adminBillOfMaterials.sourceId, id)));
  },

  async listModifierGroups(opts: ListOptions = {}): Promise<ListResult<unknown>> {
    const conditions = [isNull(adminModifierGroups.deletedAt)];
    const [totalResult] = await db.select({ count: count() }).from(adminModifierGroups).where(and(...conditions));
    let query = db.select().from(adminModifierGroups).where(and(...conditions)).$dynamic();
    if (opts.limit) query = query.limit(opts.limit);
    if (opts.offset) query = query.offset(opts.offset);
    const items = await query;
    return { items, total: totalResult.count };
  },
  async getModifierGroup(id: string) {
    const [r] = await db.select().from(adminModifierGroups).where(eq(adminModifierGroups.id, id)).limit(1);
    return r || null;
  },
  async createModifierGroup(data: Record<string, unknown>) {
    const now = Date.now();
    const row = {
      id: data.id as string, name: data.name as string,
      minSelections: (data.minSelections as number) ?? 0,
      maxSelections: (data.maxSelections as number) ?? 0,
      updatedAt: now, deletedAt: null,
    };
    const [r] = await db.insert(adminModifierGroups).values(row)
      .onConflictDoUpdate({ target: adminModifierGroups.id, set: { ...row, updatedAt: now } }).returning();
    return r;
  },
  async updateModifierGroup(id: string, data: Record<string, unknown>) {
    const now = Date.now();
    const set: Record<string, unknown> = { updatedAt: now };
    if (data.name !== undefined) set.name = data.name;
    if (data.minSelections !== undefined) set.minSelections = data.minSelections;
    if (data.maxSelections !== undefined) set.maxSelections = data.maxSelections;
    const [r] = await db.update(adminModifierGroups).set(set).where(eq(adminModifierGroups.id, id)).returning();
    return r || null;
  },
  async deleteModifierGroup(id: string) {
    const now = Date.now();
    await db.update(adminModifierGroups).set({ deletedAt: now, updatedAt: now }).where(eq(adminModifierGroups.id, id));
    await db.update(adminModifiers).set({ deletedAt: now, updatedAt: now }).where(eq(adminModifiers.modifierGroupId, id));
    await db.update(adminProductModifierGroups).set({ deletedAt: now, updatedAt: now }).where(eq(adminProductModifierGroups.modifierGroupId, id));
  },

  async listModifiers(opts: ListOptions = {}): Promise<ListResult<unknown>> {
    const conditions = [isNull(adminModifiers.deletedAt)];
    if (opts.modifierGroupId) conditions.push(eq(adminModifiers.modifierGroupId, opts.modifierGroupId as string));
    const [totalResult] = await db.select({ count: count() }).from(adminModifiers).where(and(...conditions));
    let query = db.select().from(adminModifiers).where(and(...conditions)).$dynamic();
    if (opts.limit) query = query.limit(opts.limit);
    if (opts.offset) query = query.offset(opts.offset);
    const items = await query;
    return { items, total: totalResult.count };
  },
  async getModifier(id: string) {
    const [r] = await db.select().from(adminModifiers).where(eq(adminModifiers.id, id)).limit(1);
    return r || null;
  },
  async createModifier(data: Record<string, unknown>) {
    const now = Date.now();
    const row = {
      id: data.id as string, modifierGroupId: data.modifierGroupId as string,
      name: data.name as string, baseUpcharge: (data.baseUpcharge as number) ?? 0,
      inventoryItemId: (data.inventoryItemId as string) ?? null,
      quantityPerUse: (data.quantityPerUse as number) ?? null,
      updatedAt: now, deletedAt: null,
    };
    const [r] = await db.insert(adminModifiers).values(row)
      .onConflictDoUpdate({ target: adminModifiers.id, set: { ...row, updatedAt: now } }).returning();
    return r;
  },
  async updateModifier(id: string, data: Record<string, unknown>) {
    const now = Date.now();
    const set: Record<string, unknown> = { updatedAt: now };
    if (data.name !== undefined) set.name = data.name;
    if (data.modifierGroupId !== undefined) set.modifierGroupId = data.modifierGroupId;
    if (data.baseUpcharge !== undefined) set.baseUpcharge = data.baseUpcharge;
    if (data.inventoryItemId !== undefined) set.inventoryItemId = data.inventoryItemId;
    if (data.quantityPerUse !== undefined) set.quantityPerUse = data.quantityPerUse;
    const [r] = await db.update(adminModifiers).set(set).where(eq(adminModifiers.id, id)).returning();
    return r || null;
  },
  async deleteModifier(id: string) {
    const now = Date.now();
    await db.update(adminModifiers).set({ deletedAt: now, updatedAt: now }).where(eq(adminModifiers.id, id));
  },

  async listProductModifierGroups(opts: ListOptions = {}): Promise<ListResult<unknown>> {
    const conditions = [isNull(adminProductModifierGroups.deletedAt)];
    if (opts.productId) conditions.push(eq(adminProductModifierGroups.productId, opts.productId as string));
    const [totalResult] = await db.select({ count: count() }).from(adminProductModifierGroups).where(and(...conditions));
    let query = db.select().from(adminProductModifierGroups).where(and(...conditions)).$dynamic();
    if (opts.limit) query = query.limit(opts.limit);
    if (opts.offset) query = query.offset(opts.offset);
    const items = await query;
    return { items, total: totalResult.count };
  },
  async setProductModifierGroups(productId: string, groupIds: string[]) {
    const now = Date.now();
    const existing = await db.select().from(adminProductModifierGroups)
      .where(eq(adminProductModifierGroups.productId, productId));
    const existingMap = new Map(existing.map(r => [r.modifierGroupId, r]));
    const newSet = new Set(groupIds);

    for (const row of existing) {
      if (!newSet.has(row.modifierGroupId) && !row.deletedAt) {
        await db.update(adminProductModifierGroups)
          .set({ deletedAt: now, updatedAt: now })
          .where(and(
            eq(adminProductModifierGroups.productId, productId),
            eq(adminProductModifierGroups.modifierGroupId, row.modifierGroupId),
          ));
      }
    }

    for (const gid of groupIds) {
      const existingRow = existingMap.get(gid);
      if (existingRow) {
        if (existingRow.deletedAt) {
          await db.update(adminProductModifierGroups)
            .set({ deletedAt: null, updatedAt: now })
            .where(and(
              eq(adminProductModifierGroups.productId, productId),
              eq(adminProductModifierGroups.modifierGroupId, gid),
            ));
        }
      } else {
        await db.insert(adminProductModifierGroups).values({
          productId, modifierGroupId: gid, scaleFactors: null, updatedAt: now, deletedAt: null,
        }).onConflictDoUpdate({
          target: [adminProductModifierGroups.productId, adminProductModifierGroups.modifierGroupId],
          set: { deletedAt: null, updatedAt: now },
        });
      }
    }
  },
  async setProductModifierGroupScaleFactors(productId: string, modifierGroupId: string, scaleFactors: unknown) {
    const now = Date.now();
    await db.update(adminProductModifierGroups)
      .set({ scaleFactors, updatedAt: now })
      .where(and(
        eq(adminProductModifierGroups.productId, productId),
        eq(adminProductModifierGroups.modifierGroupId, modifierGroupId),
      ));
  },

  async listInventoryItems(opts: ListOptions = {}): Promise<ListResult<unknown>> {
    const conditions = [isNull(adminInventoryItems.deletedAt)];
    const [totalResult] = await db.select({ count: count() }).from(adminInventoryItems).where(and(...conditions));
    let query = db.select().from(adminInventoryItems).where(and(...conditions)).$dynamic();
    if (opts.limit) query = query.limit(opts.limit);
    if (opts.offset) query = query.offset(opts.offset);
    const items = await query;
    return { items, total: totalResult.count };
  },
  async getInventoryItem(id: string) {
    const [r] = await db.select().from(adminInventoryItems).where(eq(adminInventoryItems.id, id)).limit(1);
    return r || null;
  },
  async createInventoryItem(data: Record<string, unknown>) {
    const now = Date.now();
    const row = {
      id: data.id as string, name: data.name as string,
      unitOfMeasure: (data.unitOfMeasure as string) ?? "each",
      currentQuantity: (data.currentQuantity as number) ?? 0,
      lowStockThreshold: (data.lowStockThreshold as number) ?? null,
      lastPurchasePrice: (data.lastPurchasePrice as number) ?? null,
      updatedAt: now, deletedAt: null,
    };
    const [r] = await db.insert(adminInventoryItems).values(row)
      .onConflictDoUpdate({ target: adminInventoryItems.id, set: { ...row, updatedAt: now } }).returning();
    return r;
  },
  async updateInventoryItem(id: string, data: Record<string, unknown>) {
    const now = Date.now();
    const set: Record<string, unknown> = { updatedAt: now };
    if (data.name !== undefined) set.name = data.name;
    if (data.unitOfMeasure !== undefined) set.unitOfMeasure = data.unitOfMeasure;
    if (data.currentQuantity !== undefined) set.currentQuantity = data.currentQuantity;
    if (data.lowStockThreshold !== undefined) set.lowStockThreshold = data.lowStockThreshold;
    if (data.lastPurchasePrice !== undefined) set.lastPurchasePrice = data.lastPurchasePrice;
    const [r] = await db.update(adminInventoryItems).set(set).where(eq(adminInventoryItems.id, id)).returning();
    return r || null;
  },
  async adjustInventoryQuantity(id: string, delta: number) {
    const existing = await db.select().from(adminInventoryItems).where(eq(adminInventoryItems.id, id)).limit(1);
    if (existing.length === 0) return null;
    const newQty = Math.max(0, existing[0].currentQuantity + delta);
    const [r] = await db.update(adminInventoryItems)
      .set({ currentQuantity: newQty, updatedAt: Date.now() })
      .where(eq(adminInventoryItems.id, id)).returning();
    return r;
  },
  async deleteInventoryItem(id: string) {
    const now = Date.now();
    await db.update(adminInventoryItems).set({ deletedAt: now, updatedAt: now }).where(eq(adminInventoryItems.id, id));
    await db.update(adminBillOfMaterials).set({ deletedAt: now, updatedAt: now }).where(eq(adminBillOfMaterials.inventoryItemId, id));
  },

  async listBom(opts: ListOptions = {}): Promise<ListResult<unknown>> {
    const conditions = [isNull(adminBillOfMaterials.deletedAt)];
    if (opts.sourceId) conditions.push(eq(adminBillOfMaterials.sourceId, opts.sourceId as string));
    if (opts.sourceProductId) conditions.push(eq(adminBillOfMaterials.sourceProductId, opts.sourceProductId as string));
    if (opts.inventoryItemId) conditions.push(eq(adminBillOfMaterials.inventoryItemId, opts.inventoryItemId as string));
    const [totalResult] = await db.select({ count: count() }).from(adminBillOfMaterials).where(and(...conditions));
    let query = db.select().from(adminBillOfMaterials).where(and(...conditions)).$dynamic();
    if (opts.limit) query = query.limit(opts.limit);
    if (opts.offset) query = query.offset(opts.offset);
    const items = await query;
    return { items, total: totalResult.count };
  },
  async getBom(id: string) {
    const [r] = await db.select().from(adminBillOfMaterials).where(eq(adminBillOfMaterials.id, id)).limit(1);
    return r || null;
  },
  async createBom(data: Record<string, unknown>) {
    const now = Date.now();
    const row = {
      id: data.id as string, sourceType: data.sourceType as string,
      sourceId: data.sourceId as string, inventoryItemId: data.inventoryItemId as string,
      sourceProductId: (data.sourceProductId as string) ?? null,
      quantityDeducted: (data.quantityDeducted as number) ?? 0,
      scaleFactorMatrix: data.scaleFactorMatrix ?? null,
      overrideModifierGroupId: (data.overrideModifierGroupId as string) ?? null,
      updatedAt: now, deletedAt: null,
    };
    const [r] = await db.insert(adminBillOfMaterials).values(row)
      .onConflictDoUpdate({ target: adminBillOfMaterials.id, set: { ...row, updatedAt: now } }).returning();
    return r;
  },
  async updateBom(id: string, data: Record<string, unknown>) {
    const now = Date.now();
    const set: Record<string, unknown> = { updatedAt: now };
    if (data.sourceType !== undefined) set.sourceType = data.sourceType;
    if (data.sourceId !== undefined) set.sourceId = data.sourceId;
    if (data.inventoryItemId !== undefined) set.inventoryItemId = data.inventoryItemId;
    if (data.sourceProductId !== undefined) set.sourceProductId = data.sourceProductId;
    if (data.quantityDeducted !== undefined) set.quantityDeducted = data.quantityDeducted;
    if (data.scaleFactorMatrix !== undefined) set.scaleFactorMatrix = data.scaleFactorMatrix;
    if (data.overrideModifierGroupId !== undefined) set.overrideModifierGroupId = data.overrideModifierGroupId;
    const [r] = await db.update(adminBillOfMaterials).set(set).where(eq(adminBillOfMaterials.id, id)).returning();
    return r || null;
  },
  async deleteBom(id: string) {
    const now = Date.now();
    await db.update(adminBillOfMaterials).set({ deletedAt: now, updatedAt: now }).where(eq(adminBillOfMaterials.id, id));
  },

  async listInvoices(opts: ListOptions = {}): Promise<ListResult<unknown>> {
    const conditions = [isNull(adminInvoices.deletedAt)];
    const [totalResult] = await db.select({ count: count() }).from(adminInvoices).where(and(...conditions));
    let query = db.select().from(adminInvoices).where(and(...conditions)).$dynamic();
    if (opts.limit) query = query.limit(opts.limit);
    if (opts.offset) query = query.offset(opts.offset);
    const items = await query;
    return { items, total: totalResult.count };
  },
  async getInvoice(id: string) {
    const [r] = await db.select().from(adminInvoices).where(eq(adminInvoices.id, id)).limit(1);
    return r || null;
  },
  async createInvoice(data: Record<string, unknown>) {
    const now = Date.now();
    const row = {
      id: data.id as string, supplierName: data.supplierName as string,
      invoiceNumber: data.invoiceNumber as string, date: data.date as string,
      status: (data.status as string) ?? "recorded", notes: (data.notes as string) ?? "",
      updatedAt: now, deletedAt: null,
    };
    const [r] = await db.insert(adminInvoices).values(row)
      .onConflictDoUpdate({ target: adminInvoices.id, set: { ...row, updatedAt: now } }).returning();
    return r;
  },
  async updateInvoice(id: string, data: Record<string, unknown>) {
    const now = Date.now();
    const set: Record<string, unknown> = { updatedAt: now };
    if (data.supplierName !== undefined) set.supplierName = data.supplierName;
    if (data.invoiceNumber !== undefined) set.invoiceNumber = data.invoiceNumber;
    if (data.date !== undefined) set.date = data.date;
    if (data.status !== undefined) set.status = data.status;
    if (data.notes !== undefined) set.notes = data.notes;
    const [r] = await db.update(adminInvoices).set(set).where(eq(adminInvoices.id, id)).returning();
    return r || null;
  },
  async deleteInvoice(id: string) {
    const now = Date.now();
    await db.update(adminInvoices).set({ deletedAt: now, updatedAt: now }).where(eq(adminInvoices.id, id));
    await db.update(adminInvoiceLineItems).set({ deletedAt: now, updatedAt: now }).where(eq(adminInvoiceLineItems.invoiceId, id));
  },

  async listInvoiceLineItems(opts: ListOptions = {}): Promise<ListResult<unknown>> {
    const conditions = [isNull(adminInvoiceLineItems.deletedAt)];
    if (opts.invoiceId) conditions.push(eq(adminInvoiceLineItems.invoiceId, opts.invoiceId as string));
    const [totalResult] = await db.select({ count: count() }).from(adminInvoiceLineItems).where(and(...conditions));
    let query = db.select().from(adminInvoiceLineItems).where(and(...conditions)).$dynamic();
    if (opts.limit) query = query.limit(opts.limit);
    if (opts.offset) query = query.offset(opts.offset);
    const items = await query;
    return { items, total: totalResult.count };
  },
  async getInvoiceLineItem(id: string) {
    const [r] = await db.select().from(adminInvoiceLineItems).where(eq(adminInvoiceLineItems.id, id)).limit(1);
    return r || null;
  },
  async createInvoiceLineItem(data: Record<string, unknown>) {
    const now = Date.now();
    const row = {
      id: data.id as string, invoiceId: data.invoiceId as string,
      inventoryItemId: data.inventoryItemId as string,
      description: (data.description as string) ?? "",
      quantity: (data.quantity as number) ?? 0,
      unitPriceCents: (data.unitPriceCents as number) ?? 0,
      updatedAt: now, deletedAt: null,
    };
    const [r] = await db.insert(adminInvoiceLineItems).values(row)
      .onConflictDoUpdate({ target: adminInvoiceLineItems.id, set: { ...row, updatedAt: now } }).returning();
    return r;
  },
  async updateInvoiceLineItem(id: string, data: Record<string, unknown>) {
    const now = Date.now();
    const set: Record<string, unknown> = { updatedAt: now };
    if (data.description !== undefined) set.description = data.description;
    if (data.quantity !== undefined) set.quantity = data.quantity;
    if (data.unitPriceCents !== undefined) set.unitPriceCents = data.unitPriceCents;
    if (data.inventoryItemId !== undefined) set.inventoryItemId = data.inventoryItemId;
    const [r] = await db.update(adminInvoiceLineItems).set(set).where(eq(adminInvoiceLineItems.id, id)).returning();
    return r || null;
  },
  async deleteInvoiceLineItem(id: string) {
    const now = Date.now();
    await db.update(adminInvoiceLineItems).set({ deletedAt: now, updatedAt: now }).where(eq(adminInvoiceLineItems.id, id));
  },

  async createInvoiceWithLineItems(invoiceData: Record<string, unknown>, lineItems: Record<string, unknown>[]) {
    const now = Date.now();
    const invoice = {
      id: invoiceData.id as string, supplierName: invoiceData.supplierName as string,
      invoiceNumber: invoiceData.invoiceNumber as string, date: invoiceData.date as string,
      status: (invoiceData.status as string) ?? "recorded", notes: (invoiceData.notes as string) ?? "",
      updatedAt: now, deletedAt: null,
    };
    const [inv] = await db.insert(adminInvoices).values(invoice)
      .onConflictDoUpdate({ target: adminInvoices.id, set: { ...invoice, updatedAt: now } }).returning();

    const createdLines = [];
    for (const li of lineItems) {
      const lineItem = {
        id: li.id as string, invoiceId: inv.id,
        inventoryItemId: li.inventoryItemId as string,
        description: (li.description as string) ?? "",
        quantity: (li.quantity as number) ?? 0,
        unitPriceCents: (li.unitPriceCents as number) ?? 0,
        updatedAt: now, deletedAt: null,
      };
      const [created] = await db.insert(adminInvoiceLineItems).values(lineItem)
        .onConflictDoUpdate({ target: adminInvoiceLineItems.id, set: { ...lineItem, updatedAt: now } }).returning();
      createdLines.push(created);

      const existing = await db.select().from(adminInventoryItems).where(eq(adminInventoryItems.id, lineItem.inventoryItemId)).limit(1);
      if (existing.length > 0) {
        await db.update(adminInventoryItems).set({
          lastPurchasePrice: lineItem.unitPriceCents,
          currentQuantity: existing[0].currentQuantity + lineItem.quantity,
          updatedAt: now,
        }).where(eq(adminInventoryItems.id, lineItem.inventoryItemId));
      }
    }

    return { invoice: inv, lineItems: createdLines };
  },

  async getAllAdminData() {
    const [products, variants, modifierGroups, pmgs, modifiers, inventoryItems, bom, invoices, invoiceLineItems] = await Promise.all([
      db.select().from(adminProducts).where(isNull(adminProducts.deletedAt)),
      db.select().from(adminVariants).where(isNull(adminVariants.deletedAt)),
      db.select().from(adminModifierGroups).where(isNull(adminModifierGroups.deletedAt)),
      db.select().from(adminProductModifierGroups).where(isNull(adminProductModifierGroups.deletedAt)),
      db.select().from(adminModifiers).where(isNull(adminModifiers.deletedAt)),
      db.select().from(adminInventoryItems).where(isNull(adminInventoryItems.deletedAt)),
      db.select().from(adminBillOfMaterials).where(isNull(adminBillOfMaterials.deletedAt)),
      db.select().from(adminInvoices).where(isNull(adminInvoices.deletedAt)),
      db.select().from(adminInvoiceLineItems).where(isNull(adminInvoiceLineItems.deletedAt)),
    ]);
    return { products, variants, modifierGroups, productModifierGroups: pmgs, modifiers, inventoryItems, billOfMaterials: bom, invoices, invoiceLineItems };
  },

  async getAllAdminDataWithDeleted() {
    const [products, variants, modifierGroups, pmgs, modifiers, inventoryItems, bom, invoices, invoiceLineItems] = await Promise.all([
      db.select().from(adminProducts),
      db.select().from(adminVariants),
      db.select().from(adminModifierGroups),
      db.select().from(adminProductModifierGroups),
      db.select().from(adminModifiers),
      db.select().from(adminInventoryItems),
      db.select().from(adminBillOfMaterials),
      db.select().from(adminInvoices),
      db.select().from(adminInvoiceLineItems),
    ]);
    return { products, variants, modifierGroups, productModifierGroups: pmgs, modifiers, inventoryItems, billOfMaterials: bom, invoices, invoiceLineItems };
  },

  async applyChanges(changes: { tableName: string; recordId: string; data: Record<string, unknown>; action: string }[]) {
    for (const change of changes) {
      const { tableName, data, action } = change;
      const sourceUpdatedAt = typeof data.updatedAt === "number" ? data.updatedAt : Date.now();
      if (action === "delete") {
        const delTs = Date.now();
        if (tableName === "products") await db.update(adminProducts).set({ deletedAt: delTs, updatedAt: delTs }).where(eq(adminProducts.id, change.recordId));
        else if (tableName === "variants") await db.update(adminVariants).set({ deletedAt: delTs, updatedAt: delTs }).where(eq(adminVariants.id, change.recordId));
        else if (tableName === "modifierGroups") await db.update(adminModifierGroups).set({ deletedAt: delTs, updatedAt: delTs }).where(eq(adminModifierGroups.id, change.recordId));
        else if (tableName === "modifiers") await db.update(adminModifiers).set({ deletedAt: delTs, updatedAt: delTs }).where(eq(adminModifiers.id, change.recordId));
        else if (tableName === "inventoryItems") await db.update(adminInventoryItems).set({ deletedAt: delTs, updatedAt: delTs }).where(eq(adminInventoryItems.id, change.recordId));
        else if (tableName === "billOfMaterials") await db.update(adminBillOfMaterials).set({ deletedAt: delTs, updatedAt: delTs }).where(eq(adminBillOfMaterials.id, change.recordId));
        else if (tableName === "invoices") await db.update(adminInvoices).set({ deletedAt: delTs, updatedAt: delTs }).where(eq(adminInvoices.id, change.recordId));
        else if (tableName === "invoiceLineItems") await db.update(adminInvoiceLineItems).set({ deletedAt: delTs, updatedAt: delTs }).where(eq(adminInvoiceLineItems.id, change.recordId));
        else if (tableName === "productModifierGroups") {
          const [pId, gId] = change.recordId.split("::");
          await db.update(adminProductModifierGroups).set({ deletedAt: delTs, updatedAt: delTs }).where(and(eq(adminProductModifierGroups.productId, pId), eq(adminProductModifierGroups.modifierGroupId, gId)));
        }
      } else {
        if (tableName === "products") {
          const row = { id: data.id as string, name: data.name as string, type: (data.type as string) || "RETAIL", isComposite: (data.isComposite as boolean) ?? false, availableAsIngredient: (data.availableAsIngredient as boolean) ?? false, attributes: data.attributes ?? null, createdAt: (data.createdAt as string) ?? new Date().toISOString(), updatedAt: sourceUpdatedAt, deletedAt: null };
          await db.insert(adminProducts).values(row).onConflictDoUpdate({ target: adminProducts.id, set: { ...row } });
        } else if (tableName === "variants") {
          const row = { id: data.id as string, productId: data.productId as string, sku: (data.sku as string) ?? null, name: data.name as string, basePrice: (data.basePrice as number) ?? 0, directInventoryId: (data.directInventoryId as string) ?? null, updatedAt: sourceUpdatedAt, deletedAt: null };
          await db.insert(adminVariants).values(row).onConflictDoUpdate({ target: adminVariants.id, set: { ...row } });
        } else if (tableName === "modifierGroups") {
          const row = { id: data.id as string, name: data.name as string, minSelections: (data.minSelections as number) ?? 0, maxSelections: (data.maxSelections as number) ?? 0, updatedAt: sourceUpdatedAt, deletedAt: null };
          await db.insert(adminModifierGroups).values(row).onConflictDoUpdate({ target: adminModifierGroups.id, set: { ...row } });
        } else if (tableName === "modifiers") {
          const row = { id: data.id as string, modifierGroupId: data.modifierGroupId as string, name: data.name as string, baseUpcharge: (data.baseUpcharge as number) ?? 0, inventoryItemId: (data.inventoryItemId as string) ?? null, quantityPerUse: (data.quantityPerUse as number) ?? null, updatedAt: sourceUpdatedAt, deletedAt: null };
          await db.insert(adminModifiers).values(row).onConflictDoUpdate({ target: adminModifiers.id, set: { ...row } });
        } else if (tableName === "inventoryItems") {
          const row = { id: data.id as string, name: data.name as string, unitOfMeasure: (data.unitOfMeasure as string) ?? "each", currentQuantity: (data.currentQuantity as number) ?? 0, lowStockThreshold: (data.lowStockThreshold as number) ?? null, lastPurchasePrice: (data.lastPurchasePrice as number) ?? null, updatedAt: sourceUpdatedAt, deletedAt: null };
          await db.insert(adminInventoryItems).values(row).onConflictDoUpdate({ target: adminInventoryItems.id, set: { ...row } });
        } else if (tableName === "billOfMaterials") {
          const row = { id: data.id as string, sourceType: data.sourceType as string, sourceId: data.sourceId as string, inventoryItemId: data.inventoryItemId as string, sourceProductId: (data.sourceProductId as string) ?? null, quantityDeducted: (data.quantityDeducted as number) ?? 0, scaleFactorMatrix: data.scaleFactorMatrix ?? null, overrideModifierGroupId: (data.overrideModifierGroupId as string) ?? null, updatedAt: sourceUpdatedAt, deletedAt: null };
          await db.insert(adminBillOfMaterials).values(row).onConflictDoUpdate({ target: adminBillOfMaterials.id, set: { ...row } });
        } else if (tableName === "invoices") {
          const row = { id: data.id as string, supplierName: data.supplierName as string, invoiceNumber: data.invoiceNumber as string, date: data.date as string, status: (data.status as string) ?? "recorded", notes: (data.notes as string) ?? "", updatedAt: sourceUpdatedAt, deletedAt: null };
          await db.insert(adminInvoices).values(row).onConflictDoUpdate({ target: adminInvoices.id, set: { ...row } });
        } else if (tableName === "invoiceLineItems") {
          const row = { id: data.id as string, invoiceId: data.invoiceId as string, inventoryItemId: data.inventoryItemId as string, description: (data.description as string) ?? "", quantity: (data.quantity as number) ?? 0, unitPriceCents: (data.unitPriceCents as number) ?? 0, updatedAt: sourceUpdatedAt, deletedAt: null };
          await db.insert(adminInvoiceLineItems).values(row).onConflictDoUpdate({ target: adminInvoiceLineItems.id, set: { ...row } });
        } else if (tableName === "productModifierGroups") {
          const pmgData = data as { productId: string; modifierGroupId: string; scaleFactors?: unknown };
          await db.insert(adminProductModifierGroups).values({
            productId: pmgData.productId, modifierGroupId: pmgData.modifierGroupId,
            scaleFactors: pmgData.scaleFactors ?? null, updatedAt: sourceUpdatedAt, deletedAt: null,
          }).onConflictDoUpdate({
            target: [adminProductModifierGroups.productId, adminProductModifierGroups.modifierGroupId],
            set: { scaleFactors: pmgData.scaleFactors ?? null, updatedAt: sourceUpdatedAt, deletedAt: null },
          });
        }
      }
    }
  },

  async getClientSyncData(clientCode: string) {
    const [client] = await db.select().from(clients).where(eq(clients.code, clientCode)).limit(1);
    if (!client) return null;

    const records = await db.select().from(syncRecords).where(eq(syncRecords.clientId, client.id));

    const result: Record<string, Record<string, unknown>[]> = {
      products: [], variants: [], modifierGroups: [], productModifierGroups: [],
      modifiers: [], inventoryItems: [], billOfMaterials: [],
      invoices: [], invoiceLineItems: [],
    };

    for (const rec of records) {
      const data = rec.data as Record<string, unknown>;
      const merged = { ...data, updatedAt: rec.updatedAt, deletedAt: rec.deletedAt ?? null };
      if (result[rec.tableName]) {
        result[rec.tableName].push(merged);
      }
    }

    return result;
  },

  async applyClientSyncChanges(clientCode: string, changes: { tableName: string; recordId: string; data: Record<string, unknown>; action: string }[]) {
    const [client] = await db.select().from(clients).where(eq(clients.code, clientCode)).limit(1);
    if (!client) return null;

    for (const change of changes) {
      const { tableName, recordId, data, action } = change;
      const serverNow = Date.now();

      if (action === "delete") {
        const [existing] = await db.select().from(syncRecords)
          .where(and(eq(syncRecords.clientId, client.id), eq(syncRecords.tableName, tableName), eq(syncRecords.recordId, recordId)))
          .limit(1);
        if (existing) {
          await db.update(syncRecords)
            .set({ data: { ...(existing.data as Record<string, unknown>), deletedAt: serverNow }, updatedAt: serverNow, deletedAt: serverNow })
            .where(eq(syncRecords.id, existing.id));
        }
      } else {
        const [existing] = await db.select().from(syncRecords)
          .where(and(eq(syncRecords.clientId, client.id), eq(syncRecords.tableName, tableName), eq(syncRecords.recordId, recordId)))
          .limit(1);
        if (existing) {
          await db.update(syncRecords)
            .set({ data, updatedAt: serverNow, deletedAt: null })
            .where(eq(syncRecords.id, existing.id));
        } else {
          await db.insert(syncRecords).values({
            clientId: client.id, tableName, recordId, data, updatedAt: serverNow, deletedAt: null,
          });
        }
      }
    }
    return true;
  },
};