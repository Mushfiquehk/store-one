import { Router, type Request, type Response } from "express";
import { storage, adminStorage, scheduleStorage, settingsStorage, type ListOptions } from "./storage";
import { z } from "zod";
import { createInsertSchema } from "drizzle-zod";
import { SYNC_CATEGORY_TABLES, type SyncCategory } from "../shared/schema";
import { createApiHandlers, type ApiAdminStorage, type ApiRequest } from "../shared/api-handlers";
import { getDemoSeedRecords, getDemoAdminData, DEMO_PREFIX_VALUE } from "./seed-data";
import { db } from "./db";
import {
  syncRecords, adminProducts, adminVariants, adminModifierGroups,
  adminModifiers, adminProductModifierGroups, adminInventoryItems,
  adminBillOfMaterials, adminInvoices, adminInvoiceLineItems, adminSales,
  scheduleShifts,
} from "./schema";
import { sql, and, eq, isNull, gt } from "drizzle-orm";
import { processTestOrder, computeInventoryDeductions, type LineItemInput, type ComboInput } from "./bom-engine";

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

// Employees have no table and no storage method server-side — unlike sales, these stubs shadow
// nothing. See Feature 7 T4 in PLAN.md: keeping the 501 is a legitimate outcome.
const EMPLOYEES_NOT_ON_SERVER =
  "Employees are not available on the Express server. Nothing was saved. There is no employees " +
  "table server-side — employees are managed by the local Capacitor server (http://127.0.0.1:8080) " +
  "in IndexedDB.";

const serverAdminAdapter: ApiAdminStorage = {
  listProducts: () => adminStorage.listProducts(),
  getProduct: (id) => adminStorage.getProduct(id),
  createProduct: (d) => adminStorage.createProduct(d),
  updateProduct: (id, d) => adminStorage.updateProduct(id, d),
  deleteProduct: (id) => adminStorage.deleteProduct(id),

  listVariants: () => adminStorage.listVariants(),
  getVariant: (id) => adminStorage.getVariant(id),
  createVariant: (d) => adminStorage.createVariant(d),
  updateVariant: (id, d) => adminStorage.updateVariant(id, d),
  deleteVariant: (id) => adminStorage.deleteVariant(id),

  listModifierGroups: () => adminStorage.listModifierGroups(),
  getModifierGroup: (id) => adminStorage.getModifierGroup(id),
  createModifierGroup: (d) => adminStorage.createModifierGroup(d),
  updateModifierGroup: (id, d) => adminStorage.updateModifierGroup(id, d),
  deleteModifierGroup: (id) => adminStorage.deleteModifierGroup(id),

  listModifiers: () => adminStorage.listModifiers(),
  getModifier: (id) => adminStorage.getModifier(id),
  createModifier: (d) => adminStorage.createModifier(d),
  updateModifier: (id, d) => adminStorage.updateModifier(id, d),
  deleteModifier: (id) => adminStorage.deleteModifier(id),

  listProductModifierGroups: () => adminStorage.listProductModifierGroups(),
  setProductModifierGroups: (pId, gIds) => adminStorage.setProductModifierGroups(pId, gIds),
  setProductModifierGroupScaleFactors: (pId, mgId, sf) => adminStorage.setProductModifierGroupScaleFactors(pId, mgId, sf),

  listInventoryItems: () => adminStorage.listInventoryItems(),
  getInventoryItem: (id) => adminStorage.getInventoryItem(id),
  createInventoryItem: (d) => adminStorage.createInventoryItem(d),
  updateInventoryItem: (id, d) => adminStorage.updateInventoryItem(id, d),
  adjustInventoryQuantity: (id, delta) => adminStorage.adjustInventoryQuantity(id, delta),
  deleteInventoryItem: (id) => adminStorage.deleteInventoryItem(id),

  listBom: () => adminStorage.listBom(),
  getBom: (id) => adminStorage.getBom(id),
  createBom: (d) => adminStorage.createBom(d),
  updateBom: (id, d) => adminStorage.updateBom(id, d),
  deleteBom: (id) => adminStorage.deleteBom(id),

  listInvoices: () => adminStorage.listInvoices(),
  getInvoice: (id) => adminStorage.getInvoice(id),
  createInvoice: (d) => adminStorage.createInvoice(d),
  updateInvoice: (id, d) => adminStorage.updateInvoice(id, d),
  deleteInvoice: (id) => adminStorage.deleteInvoice(id),

  listInvoiceLineItems: () => adminStorage.listInvoiceLineItems(),
  getInvoiceLineItem: (id) => adminStorage.getInvoiceLineItem(id),
  createInvoiceLineItem: (d) => adminStorage.createInvoiceLineItem(d),
  updateInvoiceLineItem: (id, d) => adminStorage.updateInvoiceLineItem(id, d),
  deleteInvoiceLineItem: (id) => adminStorage.deleteInvoiceLineItem(id),

  createInvoiceWithLineItems: (inv, lis) => adminStorage.createInvoiceWithLineItems(inv, lis),

  listSales: () => adminStorage.listSales(),
  getSale: (id) => adminStorage.getSale(id),
  createSale: (d) => adminStorage.createSale(d),
  updateSale: (id, d) => adminStorage.updateSale(id, d),

  // Decided (Feature 7 T4): employees and time punches stay client-side. There is no
  // employees table in server/schema.ts and never was — unlike sales, these stubs were
  // not shadowing a working implementation, they were inventing success for something
  // that was never built. The client already manages employees in Dexie, and adding a
  // half-server-side employee model (with PIN hashing to get right) to satisfy a stub is
  // how the sales bug happened. The routes below answer 501.
  //
  // If this is revisited: PINs must not be stored in plaintext, and the scrypt hashing
  // from Feature 4 T1 is the scheme to reuse rather than inventing a second one.
  async listEmployees() { throw new Error(EMPLOYEES_NOT_ON_SERVER); },
  async getEmployee() { throw new Error(EMPLOYEES_NOT_ON_SERVER); },
  async createEmployee() { throw new Error(EMPLOYEES_NOT_ON_SERVER); },
  async updateEmployee() { throw new Error(EMPLOYEES_NOT_ON_SERVER); },

  async listTimePunches() { throw new Error(EMPLOYEES_NOT_ON_SERVER); },

  listSettings: () => settingsStorage.list(),
  getSetting: (key) => settingsStorage.get(key),
  setSetting: (key, value) => settingsStorage.set(key, value),

  getAllData: () => adminStorage.getAllAdminData(),
};

const apiHandlers = createApiHandlers(serverAdminAdapter);

async function handleViaSharedHandlers(req: Request, res: Response): Promise<boolean> {
  const apiReq: ApiRequest = {
    method: req.method,
    path: req.path,
    params: req.params || {},
    // ApiRequest has carried a `query` field since it was written and nobody populated it,
    // so every handler reading one silently saw undefined. Repeated values arrive as arrays
    // and are left for the handler to reject rather than being flattened into a wrong scalar.
    query: req.query as Record<string, string>,
    body: req.body,
  };
  const apiRes = await apiHandlers.handle(apiReq);
  res.status(apiRes.status).json(apiRes.data);
  return true;
}

// 501 rather than a fake 200: these previously reached adapter stubs that returned [] for reads
// and echoed the payload back for writes, so a discarded record was indistinguishable from a
// saved one.
const notImplemented = (message: string) => async (_req: Request, res: Response) => {
  res.status(501).json({ error: message });
};

// Sales persist for real now — the adapter delegates to adminStorage, which writes adminSales.
router.get("/api/admin/sales", async (req: Request, res: Response) => { await handleViaSharedHandlers(req, res); });
router.get("/api/admin/sales/:id", async (req: Request, res: Response) => { await handleViaSharedHandlers(req, res); });
router.post("/api/admin/sales", async (req: Request, res: Response) => { await handleViaSharedHandlers(req, res); });
router.put("/api/admin/sales/:id", async (req: Request, res: Response) => { await handleViaSharedHandlers(req, res); });

router.get("/api/admin/employees", notImplemented(EMPLOYEES_NOT_ON_SERVER));
router.get("/api/admin/employees/:id", notImplemented(EMPLOYEES_NOT_ON_SERVER));
router.post("/api/admin/employees", notImplemented(EMPLOYEES_NOT_ON_SERVER));
router.put("/api/admin/employees/:id", notImplemented(EMPLOYEES_NOT_ON_SERVER));

router.get("/api/admin/time-punches", notImplemented(EMPLOYEES_NOT_ON_SERVER));

router.get("/api/local/status", async (req: Request, res: Response) => { await handleViaSharedHandlers(req, res); });

// The local server forwards every path to the shared handlers; Express registers them
// one by one, so a shared route is unreachable here until it is listed.
router.post("/api/admin/menu/apply", async (req: Request, res: Response) => { await handleViaSharedHandlers(req, res); });

router.post("/api/orders/simulate", async (req: Request, res: Response) => {
  res.status(501).json({
    error: "Order simulation is only available on the local Capacitor server (http://127.0.0.1:8080). " +
           "The Express server does not have direct access to POS sales data — sales are stored client-side in IndexedDB.",
  });
});

router.get("/api/reports/sales-summary", async (req: Request, res: Response) => {
  res.status(501).json({
    error: "Sales reports are only available on the local Capacitor server. " +
           "Sales data is stored client-side in IndexedDB, not in the server PostgreSQL database.",
  });
});

router.get("/api/reports/product-mix", async (req: Request, res: Response) => {
  res.status(501).json({
    error: "Product mix reports are only available on the local Capacitor server. " +
           "Sales data is stored client-side in IndexedDB.",
  });
});

router.get("/api/reports/inventory-status", async (req: Request, res: Response) => { await handleViaSharedHandlers(req, res); });

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

const testOrderLineSchema = z.object({
  variantId: z.string().min(1),
  qty: z.number().int().min(1),
  modifiers: z.array(z.object({
    modifierId: z.string().min(1),
    qty: z.number().int().min(1).default(1),
  })).optional().default([]),
});

const comboSchema = z.object({
  name: z.string().min(1),
  pricingStrategy: z.enum(["FIXED", "DISCOUNT_VALUE", "DISCOUNT_PERCENT"]),
  fixedPriceCents: z.number().optional(),
  discountValueCents: z.number().optional(),
  discountPercent: z.number().min(0).max(100).optional(),
  lineIndices: z.array(z.number().int().min(0)),
});

const testOrderBodySchema = z.object({
  lineItems: z.array(testOrderLineSchema).min(1),
  taxRatePct: z.number().min(0).max(100).optional().default(0),
  customerName: z.string().optional().default(""),
  combos: z.array(comboSchema).optional().default([]),
});

router.post("/api/admin/test-orders", async (req: Request, res: Response) => {
  try {
    const parsed = testOrderBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid request body", details: parsed.error.flatten() });
    }
    const { lineItems, taxRatePct, customerName, combos } = parsed.data;
    const result = await processTestOrder(lineItems as LineItemInput[], { dryRun: false, taxRatePct, customerName, combos: combos as ComboInput[] });
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    if (message.startsWith("Validation failed:")) {
      return res.status(400).json({ error: message });
    }
    console.error("Test order error:", message);
    res.status(500).json({ error: "Failed to process test order" });
  }
});

router.post("/api/admin/test-orders/dry-run", async (req: Request, res: Response) => {
  try {
    const parsed = testOrderBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid request body", details: parsed.error.flatten() });
    }
    const { lineItems, taxRatePct, customerName, combos } = parsed.data;
    const result = await processTestOrder(lineItems as LineItemInput[], { dryRun: true, taxRatePct, customerName, combos: combos as ComboInput[] });
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    if (message.startsWith("Validation failed:")) {
      return res.status(400).json({ error: message });
    }
    console.error("Test order dry-run error:", message);
    res.status(500).json({ error: "Failed to process test order dry-run" });
  }
});

router.get("/api/admin/test-orders", async (_req: Request, res: Response) => {
  try {
    const sales = await adminStorage.listSales();
    res.json(sales);
  } catch (err) {
    res.status(500).json({ error: "Failed to list test orders" });
  }
});

router.get("/api/admin/test-orders/:id", async (req: Request, res: Response) => {
  try {
    const sale = await adminStorage.getSale(req.params.id);
    if (!sale) return res.status(404).json({ error: "Not found" });
    res.json(sale);
  } catch (err) {
    res.status(500).json({ error: "Failed to get test order" });
  }
});

router.get("/api/admin/reports/summary", async (req: Request, res: Response) => {
  try {
    const sinceParam = req.query.since as string | undefined;
    let since: number | undefined;
    if (sinceParam !== undefined) {
      since = parseInt(sinceParam, 10);
      if (isNaN(since) || since < 0) {
        return res.status(400).json({ error: "Invalid 'since' parameter: must be a non-negative unix timestamp in milliseconds" });
      }
    }

    const allSales = since !== undefined
      ? await db.select().from(adminSales).where(and(isNull(adminSales.deletedAt), gt(adminSales.createdAt, since)))
      : await db.select().from(adminSales).where(isNull(adminSales.deletedAt));

    const saleCount = allSales.length;
    const totalRevenue = allSales.reduce((s, sale) => s + sale.totalCents, 0);
    const averageOrderValue = saleCount > 0 ? Math.round(totalRevenue / saleCount) : 0;

    const [products, variants, inventoryItems] = await Promise.all([
      db.select().from(adminProducts).where(isNull(adminProducts.deletedAt)),
      db.select().from(adminVariants).where(isNull(adminVariants.deletedAt)),
      db.select().from(adminInventoryItems).where(isNull(adminInventoryItems.deletedAt)),
    ]);

    const productCountByType: Record<string, number> = {};
    products.forEach(p => {
      productCountByType[p.type] = (productCountByType[p.type] || 0) + 1;
    });

    const lowStockItems = inventoryItems.filter(i =>
      i.lowStockThreshold != null && i.currentQuantity < i.lowStockThreshold
    );

    res.json({
      saleCount,
      totalRevenueCents: totalRevenue,
      averageOrderValueCents: averageOrderValue,
      productCount: products.length,
      productCountByType,
      variantCount: variants.length,
      inventoryItemCount: inventoryItems.length,
      lowStockItemCount: lowStockItems.length,
      lowStockItems: lowStockItems.map(i => ({
        id: i.id,
        name: i.name,
        currentQuantity: i.currentQuantity,
        lowStockThreshold: i.lowStockThreshold,
      })),
      ...(since !== undefined ? { since } : {}),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Reports summary error:", message);
    res.status(500).json({ error: "Failed to get reports summary" });
  }
});

router.get("/api/admin/reports/inventory", async (_req: Request, res: Response) => {
  try {
    const [inventoryItems, recentSales, invoiceLineItems, products, variants, modifiers, bomEntries] = await Promise.all([
      db.select().from(adminInventoryItems).where(isNull(adminInventoryItems.deletedAt)),
      db.select().from(adminSales).where(isNull(adminSales.deletedAt)),
      db.select().from(adminInvoiceLineItems).where(isNull(adminInvoiceLineItems.deletedAt)),
      db.select().from(adminProducts).where(isNull(adminProducts.deletedAt)),
      db.select().from(adminVariants).where(isNull(adminVariants.deletedAt)),
      db.select().from(adminModifiers).where(isNull(adminModifiers.deletedAt)),
      db.select().from(adminBillOfMaterials).where(isNull(adminBillOfMaterials.deletedAt)),
    ]);

    const salesDeductionsByItem = new Map<string, number>();
    const orderCountByItem = new Map<string, number>();

    for (const sale of recentSales) {
      const lines = sale.linesJson as { variantId: string; qty: number; modifiers?: { modifierId: string; qty: number }[] }[];
      if (!Array.isArray(lines)) continue;

      const lineInputs: LineItemInput[] = lines.map(l => ({
        variantId: l.variantId,
        qty: l.qty,
        modifiers: (l.modifiers || []).map(m => ({ modifierId: m.modifierId, qty: m.qty })),
      }));

      const deltas = computeInventoryDeductions(lineInputs, {
        products, variants, modifiers, inventoryItems, bomEntries,
      });

      for (const [itemId, delta] of deltas) {
        salesDeductionsByItem.set(itemId, (salesDeductionsByItem.get(itemId) || 0) + delta);
        orderCountByItem.set(itemId, (orderCountByItem.get(itemId) || 0) + 1);
      }
    }

    const invoiceMovement = new Map<string, { totalQuantity: number; invoiceCount: number }>();
    for (const li of invoiceLineItems) {
      const existing = invoiceMovement.get(li.inventoryItemId) || { totalQuantity: 0, invoiceCount: 0 };
      existing.totalQuantity += li.quantity;
      existing.invoiceCount += 1;
      invoiceMovement.set(li.inventoryItemId, existing);
    }

    const items = inventoryItems.map(i => {
      const invMov = invoiceMovement.get(i.id);
      const salesDelta = salesDeductionsByItem.get(i.id) ?? 0;
      const ordersAffecting = orderCountByItem.get(i.id) ?? 0;
      return {
        id: i.id,
        name: i.name,
        unitOfMeasure: i.unitOfMeasure,
        currentQuantity: i.currentQuantity,
        lowStockThreshold: i.lowStockThreshold,
        lowStock: i.lowStockThreshold != null && i.currentQuantity < i.lowStockThreshold,
        lastPurchasePrice: i.lastPurchasePrice,
        recentMovement: {
          salesDeductions: salesDelta,
          ordersAffecting,
          invoiceAdditions: invMov?.totalQuantity ?? 0,
          invoiceLineCount: invMov?.invoiceCount ?? 0,
        },
      };
    });

    res.json({
      items,
      totalItems: items.length,
      lowStockCount: items.filter(i => i.lowStock).length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Reports inventory error:", message);
    res.status(500).json({ error: "Failed to get inventory report" });
  }
});

const createShiftSchema = z.object({
  id: z.string().min(1),
  employeeId: z.string().min(1),
  weekStart: z.string().min(1),
  dayOfWeek: z.number().int().min(0).max(6),
  startMinutes: z.number().int().min(0).max(1440),
  endMinutes: z.number().int().min(0).max(1440),
});

const updateShiftSchema = z.object({
  employeeId: z.string().min(1).optional(),
  dayOfWeek: z.number().int().min(0).max(6).optional(),
  startMinutes: z.number().int().min(0).max(1440).optional(),
  endMinutes: z.number().int().min(0).max(1440).optional(),
});

router.get("/api/schedule/shifts", async (req: Request, res: Response) => {
  try {
    const weekStart = req.query.weekStart as string;
    if (!weekStart) return res.status(400).json({ error: "weekStart query param required" });
    const shifts = await scheduleStorage.listShifts(weekStart);
    res.json({ shifts });
  } catch (err) {
    res.status(500).json({ error: "Failed to list shifts" });
  }
});

router.post("/api/schedule/shifts", async (req: Request, res: Response) => {
  try {
    const parsed = createShiftSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid shift data", details: parsed.error.flatten() });
    const shift = await scheduleStorage.createShift(parsed.data);
    res.json({ shift });
  } catch (err) {
    res.status(500).json({ error: "Failed to create shift" });
  }
});

router.put("/api/schedule/shifts/:id", async (req: Request, res: Response) => {
  try {
    const parsed = updateShiftSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid update data", details: parsed.error.flatten() });
    const shift = await scheduleStorage.updateShift(req.params.id, parsed.data);
    if (!shift) return res.status(404).json({ error: "Shift not found" });
    res.json({ shift });
  } catch (err) {
    res.status(500).json({ error: "Failed to update shift" });
  }
});

router.delete("/api/schedule/shifts/:id", async (req: Request, res: Response) => {
  try {
    await scheduleStorage.deleteShift(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete shift" });
  }
});

router.post("/api/schedule/copy-week", async (req: Request, res: Response) => {
  try {
    const { fromWeek, toWeek } = req.body;
    if (!fromWeek || !toWeek) return res.status(400).json({ error: "fromWeek and toWeek required" });
    const shifts = await scheduleStorage.copyWeek(fromWeek, toWeek);
    res.json({ shifts, copied: shifts.length });
  } catch (err) {
    res.status(500).json({ error: "Failed to copy week" });
  }
});

router.get("/api/settings", async (req: Request, res: Response) => { await handleViaSharedHandlers(req, res); });
router.get("/api/settings/:key", async (req: Request, res: Response) => { await handleViaSharedHandlers(req, res); });
router.put("/api/settings/:key", async (req: Request, res: Response) => { await handleViaSharedHandlers(req, res); });

type EmailConfig = {
  provider: string; host: string; port: number;
  secure: boolean; username: string; password: string; senderEmail: string; senderName: string;
};

// The one place a mail transport is built from the stored credential. Publishing a
// schedule and sending a test email are the same configuration; a second copy would
// be a second thing to get wrong. Returns null when nothing is configured.
async function mailTransport(): Promise<{ config: EmailConfig; transporter: import("nodemailer").Transporter } | null> {
  const config = (await settingsStorage.get("emailConfig"))?.value as EmailConfig | null;
  if (!config || !config.host || !config.senderEmail) return null;

  const nodemailer = await import("nodemailer");
  return {
    config,
    transporter: nodemailer.default.createTransport({
      host: config.host,
      port: config.port || 587,
      secure: config.secure ?? false,
      auth: config.username ? { user: config.username, pass: config.password } : undefined,
    }),
  };
}

const NOT_CONFIGURED = "Email backend not configured. Please set up email settings first.";

// Verifying the configuration without ever reading the password back. Sends to the
// sender address the operator already typed — no recipient comes off the wire.
router.post("/api/settings/emailConfig/test", async (_req: Request, res: Response) => {
  try {
    const mail = await mailTransport();
    if (!mail) return res.status(400).json({ error: NOT_CONFIGURED });

    await mail.transporter.sendMail({
      from: `"${mail.config.senderName || "CornerShop"}" <${mail.config.senderEmail}>`,
      to: mail.config.senderEmail,
      subject: "CornerShop email test",
      text: "Your CornerShop email settings work. Schedules published from this store will send.",
    });
    res.json({ sent: true, to: mail.config.senderEmail });
  } catch (err) {
    // The mail server's own message is the useful part — "authentication failed" versus
    // "connection refused" is the difference between a wrong password and a wrong host.
    res.status(502).json({ error: err instanceof Error ? err.message : "Send failed" });
  }
});

router.post("/api/schedule/publish", async (req: Request, res: Response) => {
  try {
    const { weekStart, shifts, employees } = req.body;
    if (!weekStart || !shifts || !employees) {
      return res.status(400).json({ error: "weekStart, shifts, and employees are required" });
    }

    const mail = await mailTransport();
    if (!mail) return res.status(400).json({ error: NOT_CONFIGURED });
    const { config: emailConfig, transporter } = mail;

    const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
    const formatTime = (minutes: number) => {
      const h = Math.floor(minutes / 60);
      const m = minutes % 60;
      const ampm = h >= 12 ? "PM" : "AM";
      const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
      return `${h12}:${m.toString().padStart(2, "0")} ${ampm}`;
    };

    const results: { email: string; success: boolean; error?: string }[] = [];

    for (const emp of employees) {
      if (!emp.email) continue;
      const empShifts = shifts.filter((s: any) => s.employeeId === emp.id);
      if (empShifts.length === 0) continue;

      const shiftLines = empShifts
        .sort((a: any, b: any) => a.dayOfWeek - b.dayOfWeek || a.startMinutes - b.startMinutes)
        .map((s: any) => {
          const duration = ((s.endMinutes - s.startMinutes) / 60).toFixed(1);
          return `  ${DAYS[s.dayOfWeek]}: ${formatTime(s.startMinutes)} - ${formatTime(s.endMinutes)} (${duration}h)`;
        })
        .join("\n");

      const totalHours = empShifts.reduce((sum: number, s: any) => sum + (s.endMinutes - s.startMinutes) / 60, 0);

      const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">Your Schedule for Week of ${weekStart}</h2>
          <p>Hi ${emp.name},</p>
          <p>Here is your schedule for the upcoming week:</p>
          <div style="background: #f8f9fa; border-radius: 8px; padding: 16px; margin: 16px 0;">
            <pre style="font-family: monospace; font-size: 14px; line-height: 1.6; margin: 0;">${shiftLines}</pre>
          </div>
          <p style="color: #666;"><strong>Total Hours:</strong> ${totalHours.toFixed(1)}h</p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
          <p style="color: #999; font-size: 12px;">This is an automated schedule notification from ${emailConfig.senderName || "CornerShop"}.</p>
        </div>
      `;

      try {
        await transporter.sendMail({
          from: `"${emailConfig.senderName || "CornerShop"}" <${emailConfig.senderEmail}>`,
          to: emp.email,
          subject: `Your Schedule - Week of ${weekStart}`,
          html,
        });
        results.push({ email: emp.email, success: true });
      } catch (emailErr) {
        results.push({ email: emp.email, success: false, error: emailErr instanceof Error ? emailErr.message : "Send failed" });
      }
    }

    const sent = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    res.json({ sent, failed, results });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Publish schedule error:", message);
    res.status(500).json({ error: "Failed to publish schedule: " + message });
  }
});
