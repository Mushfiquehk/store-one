import { Router, type Request, type Response } from "express";
import { storage, adminStorage, type ListOptions } from "./storage";
import { z } from "zod";
import { createInsertSchema } from "drizzle-zod";
import { SYNC_CATEGORY_TABLES, type SyncCategory } from "../shared/schema";
import { getDemoSeedRecords, getDemoAdminData, DEMO_PREFIX_VALUE } from "./seed-data";
import { db } from "./db";
import {
  syncRecords, adminProducts, adminVariants, adminModifierGroups,
  adminModifiers, adminProductModifierGroups, adminInventoryItems,
  adminBillOfMaterials, adminInvoices, adminInvoiceLineItems,
} from "./schema";
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
    res.json({ data: metrics });
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

const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

function requireNonEmpty(fields: string[]) {
  return (data: Record<string, unknown>, ctx: z.RefinementCtx) => {
    for (const f of fields) {
      if (typeof data[f] === "string" && (data[f] as string).length === 0) {
        ctx.addIssue({ code: "custom", path: [f], message: `${f} must not be empty` });
      }
    }
  };
}

const createProductSchema = createInsertSchema(adminProducts)
  .omit({ updatedAt: true, deletedAt: true })
  .superRefine(requireNonEmpty(["id", "name"]));
const updateProductSchema = createInsertSchema(adminProducts)
  .omit({ updatedAt: true, deletedAt: true, id: true })
  .partial()
  .superRefine(requireNonEmpty(["name"]));

const createVariantSchema = createInsertSchema(adminVariants)
  .omit({ updatedAt: true, deletedAt: true })
  .superRefine(requireNonEmpty(["id", "productId", "name"]));
const updateVariantSchema = createInsertSchema(adminVariants)
  .omit({ updatedAt: true, deletedAt: true, id: true })
  .partial()
  .superRefine(requireNonEmpty(["name", "productId"]));

const createModifierGroupSchema = createInsertSchema(adminModifierGroups)
  .omit({ updatedAt: true, deletedAt: true })
  .superRefine(requireNonEmpty(["id", "name"]));
const updateModifierGroupSchema = createInsertSchema(adminModifierGroups)
  .omit({ updatedAt: true, deletedAt: true, id: true })
  .partial()
  .superRefine(requireNonEmpty(["name"]));

const createModifierSchema = createInsertSchema(adminModifiers)
  .omit({ updatedAt: true, deletedAt: true })
  .superRefine(requireNonEmpty(["id", "modifierGroupId", "name"]));
const updateModifierSchema = createInsertSchema(adminModifiers)
  .omit({ updatedAt: true, deletedAt: true, id: true })
  .partial()
  .superRefine(requireNonEmpty(["name", "modifierGroupId"]));

const createInventoryItemSchema = createInsertSchema(adminInventoryItems)
  .omit({ updatedAt: true, deletedAt: true })
  .superRefine(requireNonEmpty(["id", "name"]));
const updateInventoryItemSchema = createInsertSchema(adminInventoryItems)
  .omit({ updatedAt: true, deletedAt: true, id: true })
  .partial()
  .superRefine(requireNonEmpty(["name"]));

const createBomSchema = createInsertSchema(adminBillOfMaterials)
  .omit({ updatedAt: true, deletedAt: true })
  .superRefine(requireNonEmpty(["id", "sourceType", "sourceId", "inventoryItemId"]));
const updateBomSchema = createInsertSchema(adminBillOfMaterials)
  .omit({ updatedAt: true, deletedAt: true, id: true })
  .partial()
  .superRefine(requireNonEmpty(["sourceType", "sourceId", "inventoryItemId"]));

const createInvoiceSchema = createInsertSchema(adminInvoices)
  .omit({ updatedAt: true, deletedAt: true })
  .superRefine(requireNonEmpty(["id", "supplierName", "invoiceNumber", "date"]));
const updateInvoiceSchema = createInsertSchema(adminInvoices)
  .omit({ updatedAt: true, deletedAt: true, id: true })
  .partial()
  .superRefine(requireNonEmpty(["supplierName", "invoiceNumber", "date"]));

const createInvoiceLineItemSchema = createInsertSchema(adminInvoiceLineItems)
  .omit({ updatedAt: true, deletedAt: true })
  .superRefine(requireNonEmpty(["id", "invoiceId", "inventoryItemId"]));
const updateInvoiceLineItemSchema = createInsertSchema(adminInvoiceLineItems)
  .omit({ updatedAt: true, deletedAt: true, id: true })
  .partial()
  .superRefine(requireNonEmpty(["inventoryItemId"]));

const setProductModifierGroupsSchema = z.object({
  productId: z.string().min(1),
  groupIds: z.array(z.string().min(1)),
});

const setScaleFactorsSchema = z.object({
  productId: z.string().min(1),
  modifierGroupId: z.string().min(1),
  scaleFactors: z.unknown(),
});

const adjustInventorySchema = z.object({
  delta: z.number(),
});

const invoiceWithLineItemsInvoiceSchema = createInsertSchema(adminInvoices)
  .omit({ updatedAt: true, deletedAt: true })
  .superRefine(requireNonEmpty(["id", "supplierName", "invoiceNumber", "date"]));

const invoiceWithLineItemsLineItemSchema = createInsertSchema(adminInvoiceLineItems)
  .omit({ updatedAt: true, deletedAt: true })
  .partial({ invoiceId: true })
  .superRefine(requireNonEmpty(["id", "inventoryItemId"]));

const syncChangeItemSchema = z.object({
  tableName: z.string().min(1),
  recordId: z.string().min(1),
  data: z.record(z.unknown()),
  action: z.enum(["add", "update", "delete"]),
});

const applySyncChangesSchema = z.object({
  changes: z.array(syncChangeItemSchema),
});

function parseQueryOpts(query: Record<string, unknown>, extraFilters: string[] = []): { opts: ListOptions; error?: string } {
  const hasLimit = query.limit !== undefined;
  const hasOffset = query.offset !== undefined;
  if (hasLimit || hasOffset) {
    const parsed = paginationSchema.safeParse(query);
    if (!parsed.success) {
      return { opts: {}, error: "Invalid pagination parameters: " + parsed.error.issues.map(i => i.message).join(", ") };
    }
  }
  const opts: ListOptions = {};
  if (hasLimit) opts.limit = Number(query.limit);
  if (hasOffset) opts.offset = Number(query.offset);
  for (const key of extraFilters) {
    if (typeof query[key] === "string" && (query[key] as string).length > 0) {
      opts[key] = query[key];
    }
  }
  return { opts };
}

interface CrudConfig {
  entity: string;
  createSchema: z.ZodTypeAny;
  updateSchema: z.ZodTypeAny;
  listFn: (opts?: ListOptions) => Promise<{ items: unknown[]; total: number }>;
  getFn: (id: string) => Promise<unknown | null>;
  createFn: (d: Record<string, unknown>) => Promise<unknown>;
  updateFn: (id: string, d: Record<string, unknown>) => Promise<unknown | null>;
  deleteFn: (id: string) => Promise<void>;
  listFilters?: string[];
}

const adminCrudRoute = (cfg: CrudConfig) => {
  const { entity, createSchema, updateSchema, listFn, getFn, createFn, updateFn, deleteFn, listFilters = [] } = cfg;

  router.get(`/api/admin/${entity}`, async (req: Request, res: Response) => {
    try {
      const { opts, error } = parseQueryOpts(req.query as Record<string, unknown>, listFilters);
      if (error) return res.status(400).json({ error });
      const result = await listFn(opts);
      res.json({
        data: result.items,
        meta: { total: Number(result.total), limit: opts.limit ?? null, offset: opts.offset ?? 0 },
      });
    } catch (err) {
      res.status(500).json({ error: `Failed to list ${entity}` });
    }
  });

  router.get(`/api/admin/${entity}/:id`, async (req: Request, res: Response) => {
    try {
      const r = await getFn(req.params.id);
      if (!r) return res.status(404).json({ error: "Not found" });
      res.json({ data: r });
    } catch (err) {
      res.status(500).json({ error: `Failed to get ${entity}` });
    }
  });

  router.post(`/api/admin/${entity}`, async (req: Request, res: Response) => {
    try {
      const parsed = createSchema.safeParse(req.body);
      if (!parsed.success) {
        const zodError = parsed.error as z.ZodError;
        return res.status(400).json({ error: "Validation failed", details: zodError.flatten() });
      }
      const created = await createFn(parsed.data as Record<string, unknown>);
      res.json({ data: created });
    } catch (err) {
      res.status(500).json({ error: `Failed to create ${entity}` });
    }
  });

  router.put(`/api/admin/${entity}/:id`, async (req: Request, res: Response) => {
    try {
      if (!req.body || typeof req.body !== "object") {
        return res.status(400).json({ error: "Request body must be a JSON object" });
      }
      const parsed = updateSchema.safeParse(req.body);
      if (!parsed.success) {
        const zodError = parsed.error as z.ZodError;
        return res.status(400).json({ error: "Validation failed", details: zodError.flatten() });
      }
      const r = await updateFn(req.params.id, parsed.data as Record<string, unknown>);
      if (!r) return res.status(404).json({ error: "Not found" });
      res.json({ data: r });
    } catch (err) {
      res.status(500).json({ error: `Failed to update ${entity}` });
    }
  });

  router.delete(`/api/admin/${entity}/:id`, async (req: Request, res: Response) => {
    try {
      await deleteFn(req.params.id);
      res.json({ data: { success: true } });
    } catch (err) {
      res.status(500).json({ error: `Failed to delete ${entity}` });
    }
  });
};

adminCrudRoute({
  entity: "products",
  createSchema: createProductSchema,
  updateSchema: updateProductSchema,
  listFn: adminStorage.listProducts.bind(adminStorage),
  getFn: adminStorage.getProduct.bind(adminStorage),
  createFn: adminStorage.createProduct.bind(adminStorage),
  updateFn: adminStorage.updateProduct.bind(adminStorage),
  deleteFn: adminStorage.deleteProduct.bind(adminStorage),
});

adminCrudRoute({
  entity: "variants",
  createSchema: createVariantSchema,
  updateSchema: updateVariantSchema,
  listFn: adminStorage.listVariants.bind(adminStorage),
  getFn: adminStorage.getVariant.bind(adminStorage),
  createFn: adminStorage.createVariant.bind(adminStorage),
  updateFn: adminStorage.updateVariant.bind(adminStorage),
  deleteFn: adminStorage.deleteVariant.bind(adminStorage),
  listFilters: ["productId"],
});

adminCrudRoute({
  entity: "modifier-groups",
  createSchema: createModifierGroupSchema,
  updateSchema: updateModifierGroupSchema,
  listFn: adminStorage.listModifierGroups.bind(adminStorage),
  getFn: adminStorage.getModifierGroup.bind(adminStorage),
  createFn: adminStorage.createModifierGroup.bind(adminStorage),
  updateFn: adminStorage.updateModifierGroup.bind(adminStorage),
  deleteFn: adminStorage.deleteModifierGroup.bind(adminStorage),
});

adminCrudRoute({
  entity: "modifiers",
  createSchema: createModifierSchema,
  updateSchema: updateModifierSchema,
  listFn: adminStorage.listModifiers.bind(adminStorage),
  getFn: adminStorage.getModifier.bind(adminStorage),
  createFn: adminStorage.createModifier.bind(adminStorage),
  updateFn: adminStorage.updateModifier.bind(adminStorage),
  deleteFn: adminStorage.deleteModifier.bind(adminStorage),
  listFilters: ["modifierGroupId"],
});

adminCrudRoute({
  entity: "inventory-items",
  createSchema: createInventoryItemSchema,
  updateSchema: updateInventoryItemSchema,
  listFn: adminStorage.listInventoryItems.bind(adminStorage),
  getFn: adminStorage.getInventoryItem.bind(adminStorage),
  createFn: adminStorage.createInventoryItem.bind(adminStorage),
  updateFn: adminStorage.updateInventoryItem.bind(adminStorage),
  deleteFn: adminStorage.deleteInventoryItem.bind(adminStorage),
});

adminCrudRoute({
  entity: "bom",
  createSchema: createBomSchema,
  updateSchema: updateBomSchema,
  listFn: adminStorage.listBom.bind(adminStorage),
  getFn: adminStorage.getBom.bind(adminStorage),
  createFn: adminStorage.createBom.bind(adminStorage),
  updateFn: adminStorage.updateBom.bind(adminStorage),
  deleteFn: adminStorage.deleteBom.bind(adminStorage),
  listFilters: ["sourceId", "sourceProductId", "inventoryItemId"],
});

adminCrudRoute({
  entity: "invoices",
  createSchema: createInvoiceSchema,
  updateSchema: updateInvoiceSchema,
  listFn: adminStorage.listInvoices.bind(adminStorage),
  getFn: adminStorage.getInvoice.bind(adminStorage),
  createFn: adminStorage.createInvoice.bind(adminStorage),
  updateFn: adminStorage.updateInvoice.bind(adminStorage),
  deleteFn: adminStorage.deleteInvoice.bind(adminStorage),
});

adminCrudRoute({
  entity: "invoice-line-items",
  createSchema: createInvoiceLineItemSchema,
  updateSchema: updateInvoiceLineItemSchema,
  listFn: adminStorage.listInvoiceLineItems.bind(adminStorage),
  getFn: adminStorage.getInvoiceLineItem.bind(adminStorage),
  createFn: adminStorage.createInvoiceLineItem.bind(adminStorage),
  updateFn: adminStorage.updateInvoiceLineItem.bind(adminStorage),
  deleteFn: adminStorage.deleteInvoiceLineItem.bind(adminStorage),
  listFilters: ["invoiceId"],
});

router.get("/api/admin/product-modifier-groups", async (req: Request, res: Response) => {
  try {
    const { opts, error } = parseQueryOpts(req.query as Record<string, unknown>, ["productId"]);
    if (error) return res.status(400).json({ error });
    const result = await adminStorage.listProductModifierGroups(opts);
    res.json({
      data: result.items,
      meta: { total: Number(result.total), limit: opts.limit ?? null, offset: opts.offset ?? 0 },
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to list product-modifier-groups" });
  }
});

router.post("/api/admin/product-modifier-groups/set", async (req: Request, res: Response) => {
  try {
    const parsed = setProductModifierGroupsSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
    await adminStorage.setProductModifierGroups(parsed.data.productId, parsed.data.groupIds);
    res.json({ data: { success: true } });
  } catch (err) {
    res.status(500).json({ error: "Failed to set product-modifier-groups" });
  }
});

router.post("/api/admin/product-modifier-groups/scale-factors", async (req: Request, res: Response) => {
  try {
    const parsed = setScaleFactorsSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
    await adminStorage.setProductModifierGroupScaleFactors(parsed.data.productId, parsed.data.modifierGroupId, parsed.data.scaleFactors);
    res.json({ data: { success: true } });
  } catch (err) {
    res.status(500).json({ error: "Failed to set scale factors" });
  }
});

router.post("/api/admin/inventory-items/:id/adjust", async (req: Request, res: Response) => {
  try {
    const parsed = adjustInventorySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
    const r = await adminStorage.adjustInventoryQuantity(req.params.id, parsed.data.delta);
    if (!r) return res.status(404).json({ error: "Not found" });
    res.json({ data: r });
  } catch (err) {
    res.status(500).json({ error: "Failed to adjust inventory" });
  }
});

router.post("/api/admin/invoices/with-line-items", async (req: Request, res: Response) => {
  try {
    const body = req.body;
    if (!body || typeof body !== "object") {
      return res.status(400).json({ error: "Request body must be a JSON object" });
    }
    const invoiceParsed = invoiceWithLineItemsInvoiceSchema.safeParse(body.invoice);
    if (!invoiceParsed.success) {
      const zodError = invoiceParsed.error as z.ZodError;
      return res.status(400).json({ error: "Validation failed (invoice)", details: zodError.flatten() });
    }
    if (!Array.isArray(body.lineItems)) {
      return res.status(400).json({ error: "Validation failed", details: { formErrors: ["lineItems must be an array"], fieldErrors: {} } });
    }
    const lineItemErrors: Record<string, unknown>[] = [];
    const parsedLineItems: Record<string, unknown>[] = [];
    const rawLineItems = body.lineItems;
    for (let i = 0; i < rawLineItems.length; i++) {
      const liParsed = invoiceWithLineItemsLineItemSchema.safeParse(rawLineItems[i]);
      if (!liParsed.success) {
        const zodError = liParsed.error as z.ZodError;
        lineItemErrors.push({ index: i, details: zodError.flatten() });
      } else {
        parsedLineItems.push(liParsed.data as Record<string, unknown>);
      }
    }
    if (lineItemErrors.length > 0) {
      return res.status(400).json({ error: "Validation failed (lineItems)", details: lineItemErrors });
    }
    const result = await adminStorage.createInvoiceWithLineItems(
      invoiceParsed.data as Record<string, unknown>,
      parsedLineItems,
    );
    res.json({ data: result });
  } catch (err) {
    res.status(500).json({ error: "Failed to create invoice with line items" });
  }
});

router.get("/api/admin/all-data", async (_req: Request, res: Response) => {
  try { res.json({ data: await adminStorage.getAllAdminData() }); } catch (err) { res.status(500).json({ error: "Failed to get all admin data" }); }
});

router.get("/api/admin/all-data-with-deleted", async (_req: Request, res: Response) => {
  try { res.json({ data: await adminStorage.getAllAdminDataWithDeleted() }); } catch (err) { res.status(500).json({ error: "Failed to get all admin data" }); }
});

router.get("/api/admin/client-data/:clientCode", async (req: Request, res: Response) => {
  try {
    const data = await adminStorage.getClientSyncData(req.params.clientCode);
    if (!data) return res.status(404).json({ error: "Client not found" });
    res.json({ data });
  } catch (err) { res.status(500).json({ error: "Failed to get client sync data" }); }
});

router.post("/api/admin/apply-sync-changes", async (req: Request, res: Response) => {
  try {
    const parsed = applySyncChangesSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
    await adminStorage.applyChanges(parsed.data.changes);
    res.json({ data: { success: true } });
  } catch (err) { res.status(500).json({ error: "Failed to apply sync changes" }); }
});

router.post("/api/admin/apply-client-sync-changes/:clientCode", async (req: Request, res: Response) => {
  try {
    const parsed = applySyncChangesSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
    const result = await adminStorage.applyClientSyncChanges(req.params.clientCode, parsed.data.changes);
    if (!result) return res.status(404).json({ error: "Client not found" });
    res.json({ data: { success: true } });
  } catch (err) { res.status(500).json({ error: "Failed to apply client sync changes" }); }
});

router.post("/api/demo/seed", async (req: Request, res: Response) => {
  try {
    const clientCode = typeof req.body?.clientCode === "string" && req.body.clientCode.length > 0
      ? req.body.clientCode
      : "demo-client";
    const client = await storage.getOrCreateClient(clientCode, "Demo Client");
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
    console.error("Demo seed error:", message);
    res.status(500).json({ error: "Failed to seed demo data", details: message });
  }
});

router.post("/api/demo/clear", async (_req: Request, res: Response) => {
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
    console.error("Demo clear error:", message);
    res.status(500).json({ error: "Failed to clear demo data", details: message });
  }
});
