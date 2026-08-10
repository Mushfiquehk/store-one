import { parseMenuBlueprint, planMenuApply, type ExistingMenu, type FieldDiff, type MenuPlan } from "./menu-blueprint";
import type { Modifier, ModifierGroup, Product, ProductModifierGroup, Variant } from "./schema";
import { productMix, salesSeries, salesSummary, type Granularity, type ReportSale } from "./reports";

export interface ApiRequest {
  method: string;
  path: string;
  params: Record<string, string>;
  body: unknown;
  query?: Record<string, string>;
}

export interface ApiResponse {
  status: number;
  data: unknown;
}

export interface ApiAdminStorage {
  listProducts(): Promise<unknown[]>;
  getProduct(id: string): Promise<unknown | null>;
  createProduct(data: Record<string, unknown>): Promise<unknown>;
  updateProduct(id: string, data: Record<string, unknown>): Promise<unknown | null>;
  deleteProduct(id: string): Promise<void>;

  listVariants(): Promise<unknown[]>;
  getVariant(id: string): Promise<unknown | null>;
  createVariant(data: Record<string, unknown>): Promise<unknown>;
  updateVariant(id: string, data: Record<string, unknown>): Promise<unknown | null>;
  deleteVariant(id: string): Promise<void>;

  listModifierGroups(): Promise<unknown[]>;
  getModifierGroup(id: string): Promise<unknown | null>;
  createModifierGroup(data: Record<string, unknown>): Promise<unknown>;
  updateModifierGroup(id: string, data: Record<string, unknown>): Promise<unknown | null>;
  deleteModifierGroup(id: string): Promise<void>;

  listModifiers(): Promise<unknown[]>;
  getModifier(id: string): Promise<unknown | null>;
  createModifier(data: Record<string, unknown>): Promise<unknown>;
  updateModifier(id: string, data: Record<string, unknown>): Promise<unknown | null>;
  deleteModifier(id: string): Promise<void>;

  listProductModifierGroups(): Promise<unknown[]>;
  setProductModifierGroups(productId: string, groupIds: string[]): Promise<void>;
  setProductModifierGroupScaleFactors(productId: string, modifierGroupId: string, scaleFactors: unknown): Promise<unknown | null>;

  listInventoryItems(): Promise<unknown[]>;
  getInventoryItem(id: string): Promise<unknown | null>;
  createInventoryItem(data: Record<string, unknown>): Promise<unknown>;
  updateInventoryItem(id: string, data: Record<string, unknown>): Promise<unknown | null>;
  adjustInventoryQuantity(id: string, delta: number): Promise<unknown | null>;
  deleteInventoryItem(id: string): Promise<void>;

  listBom(): Promise<unknown[]>;
  getBom(id: string): Promise<unknown | null>;
  createBom(data: Record<string, unknown>): Promise<unknown>;
  updateBom(id: string, data: Record<string, unknown>): Promise<unknown | null>;
  deleteBom(id: string): Promise<void>;

  listInvoices(): Promise<unknown[]>;
  getInvoice(id: string): Promise<unknown | null>;
  createInvoice(data: Record<string, unknown>): Promise<unknown>;
  updateInvoice(id: string, data: Record<string, unknown>): Promise<unknown | null>;
  deleteInvoice(id: string): Promise<void>;

  listInvoiceLineItems(): Promise<unknown[]>;
  getInvoiceLineItem(id: string): Promise<unknown | null>;
  createInvoiceLineItem(data: Record<string, unknown>): Promise<unknown>;
  updateInvoiceLineItem(id: string, data: Record<string, unknown>): Promise<unknown | null>;
  deleteInvoiceLineItem(id: string): Promise<void>;

  createInvoiceWithLineItems(invoiceData: Record<string, unknown>, lineItems: Record<string, unknown>[]): Promise<unknown>;

  listSales(): Promise<unknown[]>;
  getSale(id: string): Promise<unknown | null>;
  createSale(data: Record<string, unknown>): Promise<unknown>;
  updateSale(id: string, data: Record<string, unknown>): Promise<unknown | null>;

  listEmployees(): Promise<unknown[]>;
  getEmployee(id: string): Promise<unknown | null>;
  createEmployee(data: Record<string, unknown>): Promise<unknown>;
  updateEmployee(id: string, data: Record<string, unknown>): Promise<unknown | null>;

  listTimePunches(): Promise<unknown[]>;

  listSettings(): Promise<StoreSetting[]>;
  getSetting(key: string): Promise<StoreSetting | null>;
  setSetting(key: string, value: unknown): Promise<StoreSetting>;

  getAllData(): Promise<Record<string, unknown[]>>;
}

export interface StoreSetting {
  key: string;
  value: unknown;
  updatedAt: number;
}

// Settings keys become a primary key straight off a request path. Mixed case is
// allowed because the keys already in use are camelCase (hoursOfOperation, emailConfig).
const SETTING_KEY_RE = /^[A-Za-z0-9._-]{1,64}$/;

interface CrudConfig {
  entity: string;
  list: () => Promise<unknown[]>;
  get: (id: string) => Promise<unknown | null>;
  create: (data: Record<string, unknown>) => Promise<unknown>;
  update: (id: string, data: Record<string, unknown>) => Promise<unknown | null>;
  delete: (id: string) => Promise<void>;
}

function matchPath(pattern: string, path: string): Record<string, string> | null {
  const patternParts = pattern.split("/");
  const pathParts = path.split("/");
  if (patternParts.length !== pathParts.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < patternParts.length; i++) {
    if (patternParts[i].startsWith(":")) {
      params[patternParts[i].slice(1)] = pathParts[i];
    } else if (patternParts[i] !== pathParts[i]) {
      return null;
    }
  }
  return params;
}

function buildCrudHandlers(cfg: CrudConfig): Array<{ method: string; pattern: string; handler: (req: ApiRequest) => Promise<ApiResponse> }> {
  const base = `/api/admin/${cfg.entity}`;
  return [
    {
      method: "GET",
      pattern: base,
      handler: async () => {
        try {
          return { status: 200, data: await cfg.list() };
        } catch {
          return { status: 500, data: { error: `Failed to list ${cfg.entity}` } };
        }
      },
    },
    {
      method: "GET",
      pattern: `${base}/:id`,
      handler: async (req) => {
        try {
          const r = await cfg.get(req.params.id);
          if (!r) return { status: 404, data: { error: "Not found" } };
          return { status: 200, data: r };
        } catch {
          return { status: 500, data: { error: `Failed to get ${cfg.entity}` } };
        }
      },
    },
    {
      method: "POST",
      pattern: base,
      handler: async (req) => {
        try {
          const body = req.body as Record<string, unknown> | undefined;
          if (!body || typeof body !== "object" || !body.id) {
            return { status: 400, data: { error: "Invalid request body: id is required" } };
          }
          return { status: 200, data: await cfg.create(body) };
        } catch {
          return { status: 500, data: { error: `Failed to create ${cfg.entity}` } };
        }
      },
    },
    {
      method: "PUT",
      pattern: `${base}/:id`,
      handler: async (req) => {
        try {
          const body = req.body as Record<string, unknown> | undefined;
          if (!body || typeof body !== "object") {
            return { status: 400, data: { error: "Request body must be a JSON object" } };
          }
          const r = await cfg.update(req.params.id, body);
          if (!r) return { status: 404, data: { error: "Not found" } };
          return { status: 200, data: r };
        } catch {
          return { status: 500, data: { error: `Failed to update ${cfg.entity}` } };
        }
      },
    },
    {
      method: "DELETE",
      pattern: `${base}/:id`,
      handler: async (req) => {
        try {
          await cfg.delete(req.params.id);
          return { status: 200, data: { success: true } };
        } catch {
          return { status: 500, data: { error: `Failed to delete ${cfg.entity}` } };
        }
      },
    },
  ];
}

function generateOrderId(): string {
  return `order_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Same shape the client components use, so blueprint-created rows are indistinguishable. */
function uid(prefix: string): string {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now()}`;
}

/** `{ basePrice: { from, to } }` -> `{ basePrice: to }`, ready for an update call. */
function updatePayload(fields: FieldDiff | undefined): Record<string, unknown> {
  return Object.fromEntries(Object.entries(fields ?? {}).map(([field, { to }]) => [field, to]));
}

/**
 * Execute a plan. Creates mint ids here rather than in the planner, which is pure — so
 * this walks the changes in planner order (groups, modifiers, products, variants, links)
 * and resolves each parent by name from what it has already created or found.
 */
async function applyMenuPlan(store: ApiAdminStorage, plan: MenuPlan, existing: ExistingMenu): Promise<void> {
  const key = (name: string) => name.trim().toLowerCase();
  const groupIds = new Map(existing.modifierGroups.filter(g => g.deletedAt == null).map(g => [key(g.name), g.id]));
  const productIds = new Map(existing.products.filter(p => p.deletedAt == null).map(p => [key(p.name), p.id]));

  for (const change of plan.changes) {
    if (change.op === "noop") continue;
    const values = change.values ?? {};

    switch (change.entity) {
      case "modifierGroup": {
        if (change.op === "create") {
          const id = uid("mg");
          await store.createModifierGroup({ id, name: change.name, ...values });
          groupIds.set(key(change.name), id);
        } else {
          await store.updateModifierGroup(change.id!, updatePayload(change.fields));
        }
        break;
      }
      case "modifier": {
        if (change.op === "create") {
          const modifierGroupId = groupIds.get(key(change.parent!));
          if (!modifierGroupId) continue;
          await store.createModifier({ id: uid("mod"), modifierGroupId, name: change.name, ...values });
        } else {
          await store.updateModifier(change.id!, updatePayload(change.fields));
        }
        break;
      }
      case "product": {
        if (change.op === "create") {
          const id = uid("prod");
          await store.createProduct({ id, name: change.name, ...values });
          productIds.set(key(change.name), id);
        } else {
          await store.updateProduct(change.id!, updatePayload(change.fields));
        }
        break;
      }
      case "variant": {
        if (change.op === "create") {
          const productId = productIds.get(key(change.parent!));
          if (!productId) continue;
          await store.createVariant({ id: uid("var"), productId, name: change.name, ...values });
        } else {
          await store.updateVariant(change.id!, updatePayload(change.fields));
        }
        break;
      }
      case "productModifierGroups": {
        const productId = productIds.get(key(change.name));
        const ids = (change.groupNames ?? []).map(name => groupIds.get(key(name))).filter((id): id is string => id != null);
        if (productId && ids.length > 0) await store.setProductModifierGroups(productId, ids);
        break;
      }
    }
  }
}

// `?since=`/`?until=` are epoch millis. A value that is not a number is ignored rather than
// silently windowing everything out — an unparseable filter must not read as "no sales".
function parseWindow(req: ApiRequest): { since?: number; until?: number } {
  const num = (raw: string | undefined) => {
    const n = Number(raw);
    return raw != null && raw !== "" && Number.isFinite(n) ? n : undefined;
  };
  return { since: num(req.query?.since), until: num(req.query?.until) };
}

export function createApiHandlers(store: ApiAdminStorage) {
  const routes: Array<{ method: string; pattern: string; handler: (req: ApiRequest) => Promise<ApiResponse> }> = [];

  const crudEntities: CrudConfig[] = [
    { entity: "products", list: () => store.listProducts(), get: (id) => store.getProduct(id), create: (d) => store.createProduct(d), update: (id, d) => store.updateProduct(id, d), delete: (id) => store.deleteProduct(id) },
    { entity: "variants", list: () => store.listVariants(), get: (id) => store.getVariant(id), create: (d) => store.createVariant(d), update: (id, d) => store.updateVariant(id, d), delete: (id) => store.deleteVariant(id) },
    { entity: "modifier-groups", list: () => store.listModifierGroups(), get: (id) => store.getModifierGroup(id), create: (d) => store.createModifierGroup(d), update: (id, d) => store.updateModifierGroup(id, d), delete: (id) => store.deleteModifierGroup(id) },
    { entity: "modifiers", list: () => store.listModifiers(), get: (id) => store.getModifier(id), create: (d) => store.createModifier(d), update: (id, d) => store.updateModifier(id, d), delete: (id) => store.deleteModifier(id) },
    { entity: "inventory-items", list: () => store.listInventoryItems(), get: (id) => store.getInventoryItem(id), create: (d) => store.createInventoryItem(d), update: (id, d) => store.updateInventoryItem(id, d), delete: (id) => store.deleteInventoryItem(id) },
    { entity: "bom", list: () => store.listBom(), get: (id) => store.getBom(id), create: (d) => store.createBom(d), update: (id, d) => store.updateBom(id, d), delete: (id) => store.deleteBom(id) },
    { entity: "invoices", list: () => store.listInvoices(), get: (id) => store.getInvoice(id), create: (d) => store.createInvoice(d), update: (id, d) => store.updateInvoice(id, d), delete: (id) => store.deleteInvoice(id) },
    { entity: "invoice-line-items", list: () => store.listInvoiceLineItems(), get: (id) => store.getInvoiceLineItem(id), create: (d) => store.createInvoiceLineItem(d), update: (id, d) => store.updateInvoiceLineItem(id, d), delete: (id) => store.deleteInvoiceLineItem(id) },
  ];

  for (const cfg of crudEntities) {
    routes.push(...buildCrudHandlers(cfg));
  }

  routes.push({
    method: "GET",
    pattern: "/api/admin/product-modifier-groups",
    handler: async () => {
      try { return { status: 200, data: await store.listProductModifierGroups() }; }
      catch { return { status: 500, data: { error: "Failed to list pmg" } }; }
    },
  });

  routes.push({
    method: "POST",
    pattern: "/api/admin/product-modifier-groups/set",
    handler: async (req) => {
      try {
        const body = req.body as { productId: string; groupIds: string[] };
        await store.setProductModifierGroups(body.productId, body.groupIds);
        return { status: 200, data: { success: true } };
      } catch { return { status: 500, data: { error: "Failed to set pmg" } }; }
    },
  });

  routes.push({
    method: "POST",
    pattern: "/api/admin/product-modifier-groups/scale-factors",
    handler: async (req) => {
      try {
        const body = req.body as { productId: string; modifierGroupId: string; scaleFactors: unknown };
        await store.setProductModifierGroupScaleFactors(body.productId, body.modifierGroupId, body.scaleFactors);
        return { status: 200, data: { success: true } };
      } catch { return { status: 500, data: { error: "Failed to set scale factors" } }; }
    },
  });

  routes.push({
    method: "POST",
    pattern: "/api/admin/inventory-items/:id/adjust",
    handler: async (req) => {
      try {
        const body = req.body as { delta: number };
        const r = await store.adjustInventoryQuantity(req.params.id, body.delta);
        if (!r) return { status: 404, data: { error: "Not found" } };
        return { status: 200, data: r };
      } catch { return { status: 500, data: { error: "Failed to adjust inventory" } }; }
    },
  });

  routes.push({
    method: "POST",
    pattern: "/api/admin/invoices/with-line-items",
    handler: async (req) => {
      try {
        const body = req.body as { invoice: Record<string, unknown>; lineItems: Record<string, unknown>[] };
        const result = await store.createInvoiceWithLineItems(body.invoice, body.lineItems);
        return { status: 200, data: result };
      } catch { return { status: 500, data: { error: "Failed to create invoice with line items" } }; }
    },
  });

  routes.push({
    method: "GET",
    pattern: "/api/admin/all-data",
    handler: async () => {
      try { return { status: 200, data: await store.getAllData() }; }
      catch { return { status: 500, data: { error: "Failed to get all admin data" } }; }
    },
  });

  routes.push({
    method: "GET",
    pattern: "/api/admin/sales",
    handler: async () => {
      try { return { status: 200, data: await store.listSales() }; }
      catch { return { status: 500, data: { error: "Failed to list sales" } }; }
    },
  });

  routes.push({
    method: "GET",
    pattern: "/api/admin/sales/:id",
    handler: async (req) => {
      try {
        const r = await store.getSale(req.params.id);
        if (!r) return { status: 404, data: { error: "Not found" } };
        return { status: 200, data: r };
      } catch { return { status: 500, data: { error: "Failed to get sale" } }; }
    },
  });

  routes.push({
    method: "POST",
    pattern: "/api/admin/sales",
    handler: async (req) => {
      try {
        const body = req.body as Record<string, unknown>;
        return { status: 200, data: await store.createSale(body) };
      } catch { return { status: 500, data: { error: "Failed to create sale" } }; }
    },
  });

  routes.push({
    method: "PUT",
    pattern: "/api/admin/sales/:id",
    handler: async (req) => {
      try {
        const body = req.body as Record<string, unknown>;
        const r = await store.updateSale(req.params.id, body);
        if (!r) return { status: 404, data: { error: "Not found" } };
        return { status: 200, data: r };
      } catch { return { status: 500, data: { error: "Failed to update sale" } }; }
    },
  });

  routes.push({
    method: "GET",
    pattern: "/api/admin/employees",
    handler: async () => {
      try { return { status: 200, data: await store.listEmployees() }; }
      catch { return { status: 500, data: { error: "Failed to list employees" } }; }
    },
  });

  routes.push({
    method: "GET",
    pattern: "/api/admin/employees/:id",
    handler: async (req) => {
      try {
        const r = await store.getEmployee(req.params.id);
        if (!r) return { status: 404, data: { error: "Not found" } };
        return { status: 200, data: r };
      } catch { return { status: 500, data: { error: "Failed to get employee" } }; }
    },
  });

  routes.push({
    method: "POST",
    pattern: "/api/admin/employees",
    handler: async (req) => {
      try {
        const body = req.body as Record<string, unknown>;
        return { status: 200, data: await store.createEmployee(body) };
      } catch { return { status: 500, data: { error: "Failed to create employee" } }; }
    },
  });

  routes.push({
    method: "PUT",
    pattern: "/api/admin/employees/:id",
    handler: async (req) => {
      try {
        const body = req.body as Record<string, unknown>;
        const r = await store.updateEmployee(req.params.id, body);
        if (!r) return { status: 404, data: { error: "Not found" } };
        return { status: 200, data: r };
      } catch { return { status: 500, data: { error: "Failed to update employee" } }; }
    },
  });

  routes.push({
    method: "GET",
    pattern: "/api/admin/time-punches",
    handler: async () => {
      try { return { status: 200, data: await store.listTimePunches() }; }
      catch { return { status: 500, data: { error: "Failed to list time punches" } }; }
    },
  });

  // Settings were Express-only; they live here so the local server serves them too.
  // Response shapes are the ones client/src/pages/settings.tsx already consumes.
  routes.push({
    method: "GET",
    pattern: "/api/settings",
    handler: async () => {
      try {
        const rows = await store.listSettings();
        return { status: 200, data: { settings: Object.fromEntries(rows.map(r => [r.key, r.value])) } };
      } catch { return { status: 500, data: { error: "Failed to load settings" } }; }
    },
  });

  routes.push({
    method: "GET",
    pattern: "/api/settings/:key",
    handler: async (req) => {
      if (!SETTING_KEY_RE.test(req.params.key)) {
        return { status: 400, data: { error: "Invalid setting key" } };
      }
      try {
        const r = await store.getSetting(req.params.key);
        // A missing setting is null rather than a 404 — callers read `.value` and
        // fall back to a default, which is the existing behaviour.
        return { status: 200, data: { value: r ? r.value : null, updatedAt: r ? r.updatedAt : null } };
      } catch { return { status: 500, data: { error: "Failed to load setting" } }; }
    },
  });

  routes.push({
    method: "PUT",
    pattern: "/api/settings/:key",
    handler: async (req) => {
      if (!SETTING_KEY_RE.test(req.params.key)) {
        return { status: 400, data: { error: "Invalid setting key" } };
      }
      const body = req.body as Record<string, unknown> | undefined;
      if (!body || body.value === undefined) {
        return { status: 400, data: { error: "value is required" } };
      }
      try {
        const r = await store.setSetting(req.params.key, body.value);
        return { status: 200, data: { success: true, updatedAt: r.updatedAt } };
      } catch { return { status: 500, data: { error: "Failed to save setting" } }; }
    },
  });

  routes.push({
    method: "POST",
    pattern: "/api/admin/menu/apply",
    handler: async (req) => {
      try {
        // ApiResponse.data is the HTTP body, so the documented { data: ... } envelope is
        // written out explicitly here — see docs/api-reference.md > Conventions.
        const parseResult = parseMenuBlueprint(req.body);
        if (!parseResult.ok) {
          return { status: 400, data: { error: "Invalid blueprint", details: parseResult.errors } };
        }
        const blueprint = parseResult.blueprint;

        const existing: ExistingMenu = {
          products: (await store.listProducts()) as Product[],
          variants: (await store.listVariants()) as Variant[],
          modifierGroups: (await store.listModifierGroups()) as ModifierGroup[],
          modifiers: (await store.listModifiers()) as Modifier[],
          productModifierGroups: (await store.listProductModifierGroups()) as ProductModifierGroup[],
        };

        const plan = planMenuApply(blueprint, existing);

        // Validate everything before writing anything: one round trip, all the errors.
        if (plan.errors.length > 0) {
          return { status: 400, data: { error: "Invalid blueprint", details: plan.errors } };
        }

        // Same plan either way — the preview cannot drift from what applying does.
        if (blueprint.dryRun) {
          return { status: 200, data: { data: { applied: false, changes: plan.changes, errors: [] } } };
        }

        await applyMenuPlan(store, plan, existing);
        return { status: 200, data: { data: { applied: true, changes: plan.changes, errors: [] } } };
      } catch {
        return { status: 500, data: { error: "Failed to apply menu blueprint" } };
      }
    },
  });

  routes.push({
    method: "POST",
    pattern: "/api/orders/simulate",
    handler: async (req) => {
      try {
        const body = req.body as {
          items: Array<{ variantId: string; quantity: number; modifierIds?: string[] }>;
          paymentMethod?: string;
          customerName?: string;
        };

        if (!body.items || !Array.isArray(body.items) || body.items.length === 0) {
          return { status: 400, data: { error: "items array is required and must not be empty" } };
        }

        const variants = (await store.listVariants()) as Array<Record<string, unknown>>;
        const products = (await store.listProducts()) as Array<Record<string, unknown>>;
        const modifiers = (await store.listModifiers()) as Array<Record<string, unknown>>;

        const variantMap = new Map(variants.map(v => [v.id as string, v]));
        const productMap = new Map(products.map(p => [p.id as string, p]));
        const modifierMap = new Map(modifiers.map(m => [m.id as string, m]));

        interface SimulatedLine {
          variantId: string;
          productId: string;
          productName: string;
          variantName: string;
          quantity: number;
          unitPrice: number;
          modifiers: Array<{ modifierId: string; name: string; upcharge: number }>;
          lineTotal: number;
        }

        const lines: SimulatedLine[] = [];
        let subtotalCents = 0;

        for (const item of body.items) {
          const variant = variantMap.get(item.variantId);
          if (!variant) {
            return { status: 400, data: { error: `Variant not found: ${item.variantId}` } };
          }

          const product = productMap.get(variant.productId as string);
          const basePrice = (variant.basePrice as number) || 0;

          const selectedModifiers: Array<{ modifierId: string; name: string; upcharge: number }> = [];
          let modifierTotal = 0;

          if (item.modifierIds) {
            for (const modId of item.modifierIds) {
              const mod = modifierMap.get(modId);
              if (mod) {
                const upcharge = (mod.baseUpcharge as number) || 0;
                selectedModifiers.push({
                  modifierId: modId,
                  name: mod.name as string,
                  upcharge,
                });
                modifierTotal += upcharge;
              }
            }
          }

          const unitPrice = basePrice + modifierTotal;
          const lineTotal = unitPrice * (item.quantity || 1);
          subtotalCents += lineTotal;

          lines.push({
            variantId: item.variantId,
            productId: variant.productId as string,
            productName: product ? (product.name as string) : "",
            variantName: variant.name as string,
            quantity: item.quantity || 1,
            unitPrice,
            modifiers: selectedModifiers,
            lineTotal,
          });
        }

        const taxRate = 0.08;
        const taxCents = Math.round(subtotalCents * taxRate);
        const totalCents = subtotalCents + taxCents;

        const saleId = generateOrderId();
        const now = Date.now();
        const sale = await store.createSale({
          id: saleId,
          createdAt: now,
          subtotalCents,
          taxCents,
          totalCents,
          paymentMethod: body.paymentMethod || "cash",
          status: "completed",
          linesJson: lines.map(l => ({
            variantId: l.variantId,
            productId: l.productId,
            productName: l.productName,
            variantName: l.variantName,
            qty: l.quantity,
            unitPrice: l.unitPrice,
            modifiers: l.modifiers.map(m => ({ modifierId: m.modifierId, qty: 1 })),
            comboId: null,
            comboName: null,
            originalPriceCents: l.unitPrice,
            finalPriceCents: l.unitPrice,
          })),
          customerName: body.customerName || "",
          closedAt: now,
          comboDiscountCents: 0,
        });

        return {
          status: 200,
          data: {
            orderId: saleId,
            lines,
            subtotalCents,
            taxCents,
            totalCents,
            paymentMethod: body.paymentMethod || "cash",
            customerName: body.customerName || "",
            sale,
          },
        };
      } catch (err) {
        return { status: 500, data: { error: "Failed to simulate order", details: String(err) } };
      }
    },
  });

  routes.push({
    method: "GET",
    pattern: "/api/reports/sales-summary",
    handler: async (req) => {
      try {
        const sales = (await store.listSales()) as ReportSale[];
        const window = parseWindow(req);
        const summary = salesSummary(sales, window);
        // The series the page draws, from the same rows as the scalars above it.
        const granularity = (req.query?.granularity as Granularity) || "daily";
        return { status: 200, data: { ...summary, series: salesSeries(sales, { granularity, ...window }) } };
      } catch {
        return { status: 500, data: { error: "Failed to generate sales summary" } };
      }
    },
  });

  routes.push({
    method: "GET",
    pattern: "/api/reports/product-mix",
    handler: async (req) => {
      try {
        const sales = (await store.listSales()) as ReportSale[];
        return { status: 200, data: productMix(sales, parseWindow(req)) };
      } catch {
        return { status: 500, data: { error: "Failed to generate product mix report" } };
      }
    },
  });

  routes.push({
    method: "GET",
    pattern: "/api/reports/inventory-status",
    handler: async () => {
      try {
        const items = (await store.listInventoryItems()) as Array<Record<string, unknown>>;
        const report = items.map(item => ({
          id: item.id,
          name: item.name,
          currentQuantity: item.currentQuantity,
          unitOfMeasure: item.unitOfMeasure,
          lowStockThreshold: item.lowStockThreshold,
          isLowStock: item.lowStockThreshold !== null && (item.currentQuantity as number) <= (item.lowStockThreshold as number),
        }));
        return { status: 200, data: report };
      } catch {
        return { status: 500, data: { error: "Failed to generate inventory status" } };
      }
    },
  });

  routes.push({
    method: "GET",
    pattern: "/api/local/status",
    handler: async () => {
      return {
        status: 200,
        data: {
          app: "CornerPOS",
          version: "2.0.0",
          platform: "capacitor-local",
          running: true,
          timestamp: Date.now(),
        },
      };
    },
  });

  return {
    handle: async (req: ApiRequest): Promise<ApiResponse> => {
      const method = req.method.toUpperCase();
      for (const route of routes) {
        if (route.method !== method) continue;
        const params = matchPath(route.pattern, req.path);
        if (params !== null) {
          return route.handler({ ...req, params: { ...req.params, ...params } });
        }
      }
      return { status: 404, data: { error: "Not found" } };
    },
  };
}
