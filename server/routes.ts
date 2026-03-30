import { Router, type Request, type Response } from "express";
import { storage, adminStorage } from "./storage";
import { z } from "zod";
import { SYNC_CATEGORY_TABLES, type SyncCategory } from "../shared/schema";
import { getDemoSeedRecords, getDemoAdminData, DEMO_PREFIX_VALUE } from "./seed-data";
import { db } from "./db";
import { syncRecords, adminProducts, adminVariants, adminModifierGroups, adminModifiers, adminProductModifierGroups, adminInventoryItems, adminBillOfMaterials } from "./schema";
import { sql, and, eq } from "drizzle-orm";

export const router = Router();

const backupBodySchema = z.object({
  clientCode: z.string().min(1),
  clientName: z.string().optional(),
  snapshot: z.object({
    products: z.array(z.record(z.string(), z.unknown())),
    variants: z.array(z.record(z.string(), z.unknown())),
    modifierGroups: z.array(z.record(z.string(), z.unknown())),
    productModifierGroups: z.array(z.record(z.string(), z.unknown())),
    modifiers: z.array(z.record(z.string(), z.unknown())),
    inventoryItems: z.array(z.record(z.string(), z.unknown())),
    billOfMaterials: z.array(z.record(z.string(), z.unknown())),
    employees: z.array(z.record(z.string(), z.unknown())),
    timePunches: z.array(z.record(z.string(), z.unknown())),
    sales: z.array(z.record(z.string(), z.unknown())),
  }),
});

const syncChangeSchema = z.object({
  tableName: z.string(),
  recordId: z.string(),
  data: z.record(z.string(), z.unknown()),
  updatedAt: z.number(),
  deletedAt: z.number().nullable(),
});

const syncBodySchema = z.object({
  clientCode: z.string().min(1),
  lastSyncedAt: z.number(),
  changes: z.array(syncChangeSchema),
});

const VALID_CATEGORIES = new Set<string>(["menu", "ingredients", "sales", "invoices"]);

router.post("/api/backup", async (req: Request, res: Response) => {
  try {
    const parsed = backupBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid backup data", details: parsed.error.flatten() });
    }
    const { clientCode, clientName, snapshot } = parsed.data;
    const client = await storage.getOrCreateClient(clientCode, clientName);
    const backup = await storage.createBackup(client.id, snapshot);
    res.json({ success: true, backupId: backup.id, createdAt: backup.createdAt });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Backup error:", message);
    res.status(500).json({ error: "Failed to create backup" });
  }
});

router.get("/api/backup/:clientCode", async (req: Request, res: Response) => {
  try {
    const { clientCode } = req.params;
    const backup = await storage.getLatestBackup(clientCode);
    if (!backup) {
      return res.status(404).json({ error: "No backup found for this client" });
    }
    res.json({ snapshot: backup.snapshot, createdAt: backup.createdAt, backupId: backup.id });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Restore error:", message);
    res.status(500).json({ error: "Failed to retrieve backup" });
  }
});

router.get("/api/clients", async (_req: Request, res: Response) => {
  try {
    const clientList = await storage.getClients();
    res.json(clientList);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Clients error:", message);
    res.status(500).json({ error: "Failed to retrieve clients" });
  }
});

router.get("/api/admin/metrics", async (_req: Request, res: Response) => {
  try {
    const metrics = await storage.getAggregatedMetrics();
    res.json(metrics);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Metrics error:", message);
    res.status(500).json({ error: "Failed to retrieve metrics" });
  }
});

router.post("/api/sync/:category", async (req: Request, res: Response) => {
  try {
    const { category } = req.params;
    if (!VALID_CATEGORIES.has(category)) {
      return res.status(400).json({ error: `Invalid sync category: ${category}` });
    }

    const parsed = syncBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid sync data", details: parsed.error.flatten() });
    }

    const { clientCode, lastSyncedAt, changes } = parsed.data;
    const tableNames = SYNC_CATEGORY_TABLES[category as SyncCategory];

    const invalidTables = changes.filter(c => !tableNames.includes(c.tableName));
    if (invalidTables.length > 0) {
      return res.status(400).json({
        error: `Tables not allowed in category '${category}': ${invalidTables.map(c => c.tableName).join(", ")}`,
      });
    }

    const client = await storage.getOrCreateClient(clientCode);
    const result = await storage.processSyncChanges(client.id, tableNames, changes, lastSyncedAt);

    res.json({
      success: true,
      serverChanges: result.serverChanges,
      syncedAt: result.syncedAt,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Sync error:", message);
    res.status(500).json({ error: "Failed to process sync" });
  }
});

router.get("/api/sync/:category/status", async (req: Request, res: Response) => {
  try {
    const { category } = req.params;
    const clientCode = req.query.clientCode as string;

    if (!VALID_CATEGORIES.has(category)) {
      return res.status(400).json({ error: `Invalid sync category: ${category}` });
    }
    if (!clientCode) {
      return res.status(400).json({ error: "clientCode query parameter required" });
    }

    const tableNames = SYNC_CATEGORY_TABLES[category as SyncCategory];
    const client = await storage.getOrCreateClient(clientCode);
    const status = await storage.getSyncStatus(client.id, tableNames);

    res.json(status);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Sync status error:", message);
    res.status(500).json({ error: "Failed to get sync status" });
  }
});

const adminBodySchema = z.object({
  id: z.string().min(1),
}).passthrough();

const adminCrudRoute = (entity: string, listFn: () => Promise<unknown[]>, getFn: (id: string) => Promise<unknown | null>, createFn: (d: Record<string, unknown>) => Promise<unknown>, updateFn: (id: string, d: Record<string, unknown>) => Promise<unknown>, deleteFn: (id: string) => Promise<void>) => {
  router.get(`/api/admin/${entity}`, async (_req: Request, res: Response) => {
    try { res.json(await listFn()); } catch (err) { res.status(500).json({ error: `Failed to list ${entity}` }); }
  });
  router.get(`/api/admin/${entity}/:id`, async (req: Request, res: Response) => {
    try { const r = await getFn(req.params.id); if (!r) return res.status(404).json({ error: "Not found" }); res.json(r); } catch (err) { res.status(500).json({ error: `Failed to get ${entity}` }); }
  });
  router.post(`/api/admin/${entity}`, async (req: Request, res: Response) => {
    try {
      const parsed = adminBodySchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "Invalid request body: id is required", details: parsed.error.format() });
      res.json(await createFn(parsed.data));
    } catch (err) { res.status(500).json({ error: `Failed to create ${entity}` }); }
  });
  router.put(`/api/admin/${entity}/:id`, async (req: Request, res: Response) => {
    try {
      if (!req.body || typeof req.body !== "object") return res.status(400).json({ error: "Request body must be a JSON object" });
      const r = await updateFn(req.params.id, req.body);
      if (!r) return res.status(404).json({ error: "Not found" });
      res.json(r);
    } catch (err) { res.status(500).json({ error: `Failed to update ${entity}` }); }
  });
  router.delete(`/api/admin/${entity}/:id`, async (req: Request, res: Response) => {
    try { await deleteFn(req.params.id); res.json({ success: true }); } catch (err) { res.status(500).json({ error: `Failed to delete ${entity}` }); }
  });
};

adminCrudRoute("products", adminStorage.listProducts, adminStorage.getProduct, adminStorage.createProduct, adminStorage.updateProduct, adminStorage.deleteProduct);
adminCrudRoute("variants", adminStorage.listVariants, adminStorage.getVariant, adminStorage.createVariant, adminStorage.updateVariant, adminStorage.deleteVariant);
adminCrudRoute("modifier-groups", adminStorage.listModifierGroups, adminStorage.getModifierGroup, adminStorage.createModifierGroup, adminStorage.updateModifierGroup, adminStorage.deleteModifierGroup);
adminCrudRoute("modifiers", adminStorage.listModifiers, adminStorage.getModifier, adminStorage.createModifier, adminStorage.updateModifier, adminStorage.deleteModifier);
adminCrudRoute("inventory-items", adminStorage.listInventoryItems, adminStorage.getInventoryItem, adminStorage.createInventoryItem, adminStorage.updateInventoryItem, adminStorage.deleteInventoryItem);
adminCrudRoute("bom", adminStorage.listBom, adminStorage.getBom, adminStorage.createBom, adminStorage.updateBom, adminStorage.deleteBom);
adminCrudRoute("invoices", adminStorage.listInvoices, adminStorage.getInvoice, adminStorage.createInvoice, adminStorage.updateInvoice, adminStorage.deleteInvoice);
adminCrudRoute("invoice-line-items", adminStorage.listInvoiceLineItems, adminStorage.getInvoiceLineItem, adminStorage.createInvoiceLineItem, adminStorage.updateInvoiceLineItem, adminStorage.deleteInvoiceLineItem);

router.get("/api/admin/product-modifier-groups", async (_req: Request, res: Response) => {
  try { res.json(await adminStorage.listProductModifierGroups()); } catch (err) { res.status(500).json({ error: "Failed to list pmg" }); }
});

router.post("/api/admin/product-modifier-groups/set", async (req: Request, res: Response) => {
  try {
    const { productId, groupIds } = req.body;
    await adminStorage.setProductModifierGroups(productId, groupIds);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: "Failed to set pmg" }); }
});

router.post("/api/admin/product-modifier-groups/scale-factors", async (req: Request, res: Response) => {
  try {
    const { productId, modifierGroupId, scaleFactors } = req.body;
    await adminStorage.setProductModifierGroupScaleFactors(productId, modifierGroupId, scaleFactors);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: "Failed to set scale factors" }); }
});

router.post("/api/admin/inventory-items/:id/adjust", async (req: Request, res: Response) => {
  try {
    const r = await adminStorage.adjustInventoryQuantity(req.params.id, req.body.delta);
    if (!r) return res.status(404).json({ error: "Not found" });
    res.json(r);
  } catch (err) { res.status(500).json({ error: "Failed to adjust inventory" }); }
});

router.post("/api/admin/invoices/with-line-items", async (req: Request, res: Response) => {
  try {
    const { invoice, lineItems } = req.body;
    const result = await adminStorage.createInvoiceWithLineItems(invoice, lineItems);
    res.json(result);
  } catch (err) { res.status(500).json({ error: "Failed to create invoice with line items" }); }
});

router.get("/api/admin/all-data", async (_req: Request, res: Response) => {
  try { res.json(await adminStorage.getAllAdminData()); } catch (err) { res.status(500).json({ error: "Failed to get all admin data" }); }
});

router.get("/api/admin/all-data-with-deleted", async (_req: Request, res: Response) => {
  try { res.json(await adminStorage.getAllAdminDataWithDeleted()); } catch (err) { res.status(500).json({ error: "Failed to get all admin data" }); }
});

router.get("/api/admin/client-data/:clientCode", async (req: Request, res: Response) => {
  try {
    const data = await adminStorage.getClientSyncData(req.params.clientCode);
    if (!data) return res.status(404).json({ error: "Client not found" });
    res.json(data);
  } catch (err) { res.status(500).json({ error: "Failed to get client sync data" }); }
});

router.post("/api/admin/apply-sync-changes", async (req: Request, res: Response) => {
  try {
    const { changes } = req.body;
    await adminStorage.applyChanges(changes);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: "Failed to apply sync changes" }); }
});

router.post("/api/admin/apply-client-sync-changes/:clientCode", async (req: Request, res: Response) => {
  try {
    const { changes } = req.body;
    const result = await adminStorage.applyClientSyncChanges(req.params.clientCode, changes);
    if (!result) return res.status(404).json({ error: "Client not found" });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: "Failed to apply client sync changes" }); }
});

if (process.env.NODE_ENV !== "production") {
  router.post("/api/dev/seed", async (req: Request, res: Response) => {
    try {
      const clientCode = typeof req.body?.clientCode === "string" && req.body.clientCode.length > 0
        ? req.body.clientCode
        : "dev-seed";
      const client = await storage.getOrCreateClient(clientCode, "Dev Seed Client");
      const seedRecords = getDemoSeedRecords();
      let inserted = 0;
      let updated = 0;

      await db.transaction(async (tx) => {
        for (const record of seedRecords) {
          const existing = await tx
            .select()
            .from(syncRecords)
            .where(
              and(
                eq(syncRecords.clientId, client.id),
                eq(syncRecords.tableName, record.tableName),
                eq(syncRecords.recordId, record.recordId),
              )
            )
            .limit(1);

          if (existing.length === 0) {
            await tx.insert(syncRecords).values({
              clientId: client.id,
              tableName: record.tableName,
              recordId: record.recordId,
              data: record.data,
              updatedAt: record.updatedAt,
              deletedAt: record.deletedAt,
            });
            inserted++;
          } else {
            await tx
              .update(syncRecords)
              .set({
                data: record.data,
                updatedAt: record.updatedAt,
                deletedAt: record.deletedAt,
              })
              .where(eq(syncRecords.id, existing[0].id));
            updated++;
          }
        }
      });

      const adminData = getDemoAdminData();
      let adminCount = 0;
      for (const p of adminData.products) {
        await adminStorage.createProduct(p as unknown as Record<string, unknown>);
        adminCount++;
      }
      for (const v of adminData.variants) {
        await adminStorage.createVariant(v as unknown as Record<string, unknown>);
        adminCount++;
      }
      for (const ii of adminData.inventoryItems) {
        await adminStorage.createInventoryItem(ii as unknown as Record<string, unknown>);
        adminCount++;
      }
      for (const mg of adminData.modifierGroups) {
        await adminStorage.createModifierGroup(mg as unknown as Record<string, unknown>);
        adminCount++;
      }
      for (const m of adminData.modifiers) {
        await adminStorage.createModifier(m as unknown as Record<string, unknown>);
        adminCount++;
      }
      for (const b of adminData.bomEntries) {
        await adminStorage.createBom(b as unknown as Record<string, unknown>);
        adminCount++;
      }
      const pmgByProduct = new Map<string, typeof adminData.productModifierGroups>();
      for (const pmg of adminData.productModifierGroups) {
        const arr = pmgByProduct.get(pmg.productId) || [];
        arr.push(pmg);
        pmgByProduct.set(pmg.productId, arr);
      }
      for (const [productId, pmgs] of pmgByProduct) {
        await adminStorage.setProductModifierGroups(productId, pmgs.map(p => p.modifierGroupId));
        for (const pmg of pmgs) {
          if (pmg.scaleFactors) {
            await adminStorage.setProductModifierGroupScaleFactors(productId, pmg.modifierGroupId, pmg.scaleFactors);
          }
        }
        adminCount += pmgs.length;
      }

      res.json({
        success: true,
        clientCode,
        recordsInserted: inserted,
        recordsUpdated: updated,
        totalRecords: seedRecords.length,
        adminRecords: adminCount,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error("Dev seed error:", message);
      res.status(500).json({ error: "Failed to seed demo data", details: message });
    }
  });

  router.post("/api/dev/clear", async (req: Request, res: Response) => {
    try {
      const demoPrefix = DEMO_PREFIX_VALUE;
      const escapedPattern = demoPrefix.replace(/%/g, '\\%').replace(/_/g, '\\_') + '%';
      const likeCondition = sql`${syncRecords.recordId} LIKE ${escapedPattern}`;

      const countResult = await db
        .select({ id: syncRecords.id })
        .from(syncRecords)
        .where(likeCondition);

      const deleted = countResult.length;

      if (deleted > 0) {
        await db.delete(syncRecords).where(likeCondition);
      }

      await db.delete(adminBillOfMaterials).where(sql`${adminBillOfMaterials.id} LIKE ${escapedPattern}`);
      await db.delete(adminProductModifierGroups).where(sql`${adminProductModifierGroups.productId} LIKE ${escapedPattern}`);
      await db.delete(adminModifiers).where(sql`${adminModifiers.id} LIKE ${escapedPattern}`);
      await db.delete(adminModifierGroups).where(sql`${adminModifierGroups.id} LIKE ${escapedPattern}`);
      await db.delete(adminVariants).where(sql`${adminVariants.id} LIKE ${escapedPattern}`);
      await db.delete(adminProducts).where(sql`${adminProducts.id} LIKE ${escapedPattern}`);
      await db.delete(adminInventoryItems).where(sql`${adminInventoryItems.id} LIKE ${escapedPattern}`);

      res.json({
        success: true,
        recordsDeleted: deleted,
        adminTablesCleared: true,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error("Dev clear error:", message);
      res.status(500).json({ error: "Failed to clear demo data", details: message });
    }
  });
}
