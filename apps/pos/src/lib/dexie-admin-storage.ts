import { ledgerRows } from "@shared/ledger";
import type { ActionLogEntry } from "@shared/action-log";
import { db } from "./db";
import type {
  Product,
  Variant,
  ModifierGroup,
  Modifier,
  InventoryItem,
  BomEntry,
  Employee,
  Sale,
  Invoice,
  InvoiceLineItem,
  ModifierScaleFactors,
} from "./db";
import type { ApiAdminStorage } from "@shared/api-handlers";

function notDeleted<T extends { deletedAt: number | null }>(items: T[]): T[] {
  return items.filter((item) => !item.deletedAt);
}

export const dexieAdminStorage: ApiAdminStorage = {
  async listProducts() {
    return notDeleted(await db.products.toArray());
  },
  async getProduct(id: string) {
    return (await db.products.get(id)) || null;
  },
  async createProduct(data: Record<string, unknown>) {
    const now = Date.now();
    const product: Product = {
      id: data.id as string,
      name: data.name as string,
      type: (data.type as "RETAIL" | "RESTAURANT") || "RETAIL",
      isComposite: (data.isComposite as boolean) ?? false,
      availableAsIngredient: (data.availableAsIngredient as boolean) ?? false,
      attributes: (data.attributes as Product["attributes"]) ?? null,
      createdAt: (data.createdAt as string) ?? new Date().toISOString(),
      updatedAt: now,
      deletedAt: null,
    };
    await db.products.put(product);
    return product;
  },
  async updateProduct(id: string, data: Record<string, unknown>) {
    const existing = await db.products.get(id);
    if (!existing) return null;
    const updates: Partial<Product> = { updatedAt: Date.now() };
    if (data.name !== undefined) updates.name = data.name as string;
    if (data.type !== undefined) updates.type = data.type as Product["type"];
    if (data.isComposite !== undefined) updates.isComposite = data.isComposite as boolean;
    if (data.availableAsIngredient !== undefined) updates.availableAsIngredient = data.availableAsIngredient as boolean;
    if (data.attributes !== undefined) updates.attributes = data.attributes as Product["attributes"];
    await db.products.update(id, updates);
    return db.products.get(id);
  },
  async deleteProduct(id: string) {
    const now = Date.now();
    await db.transaction("rw", [db.products, db.variants, db.productModifierGroups, db.billOfMaterials], async () => {
      const variants = await db.variants.where("productId").equals(id).toArray();
      for (const v of variants) {
        await db.billOfMaterials.where("[sourceType+sourceId]").equals(["VARIANT", v.id]).modify({ deletedAt: now, updatedAt: now });
        await db.variants.update(v.id, { deletedAt: now, updatedAt: now });
      }
      await db.productModifierGroups.where("productId").equals(id).modify({ deletedAt: now, updatedAt: now });
      await db.billOfMaterials.where("sourceProductId").equals(id).modify({ deletedAt: now, updatedAt: now });
      await db.products.update(id, { deletedAt: now, updatedAt: now });
    });
  },

  async listVariants() {
    return notDeleted(await db.variants.toArray());
  },
  async getVariant(id: string) {
    return (await db.variants.get(id)) || null;
  },
  async createVariant(data: Record<string, unknown>) {
    const now = Date.now();
    const variant: Variant = {
      id: data.id as string,
      productId: data.productId as string,
      sku: (data.sku as string) ?? null,
      name: data.name as string,
      basePrice: (data.basePrice as number) ?? 0,
      directInventoryId: (data.directInventoryId as string) ?? null,
      updatedAt: now,
      deletedAt: null,
    };
    await db.variants.put(variant);
    return variant;
  },
  async updateVariant(id: string, data: Record<string, unknown>) {
    const existing = await db.variants.get(id);
    if (!existing) return null;
    const updates: Partial<Variant> = { updatedAt: Date.now() };
    if (data.name !== undefined) updates.name = data.name as string;
    if (data.productId !== undefined) updates.productId = data.productId as string;
    if (data.sku !== undefined) updates.sku = data.sku as string;
    if (data.basePrice !== undefined) updates.basePrice = data.basePrice as number;
    if (data.directInventoryId !== undefined) updates.directInventoryId = data.directInventoryId as string;
    await db.variants.update(id, updates);
    return db.variants.get(id);
  },
  async deleteVariant(id: string) {
    const now = Date.now();
    await db.transaction("rw", [db.variants, db.billOfMaterials], async () => {
      await db.billOfMaterials.where("[sourceType+sourceId]").equals(["VARIANT", id]).modify({ deletedAt: now, updatedAt: now });
      await db.variants.update(id, { deletedAt: now, updatedAt: now });
    });
  },

  async listModifierGroups() {
    return notDeleted(await db.modifierGroups.toArray());
  },
  async getModifierGroup(id: string) {
    return (await db.modifierGroups.get(id)) || null;
  },
  async createModifierGroup(data: Record<string, unknown>) {
    const now = Date.now();
    const group: ModifierGroup = {
      id: data.id as string,
      name: data.name as string,
      minSelections: (data.minSelections as number) ?? 0,
      maxSelections: (data.maxSelections as number) ?? 0,
      updatedAt: now,
      deletedAt: null,
    };
    await db.modifierGroups.put(group);
    return group;
  },
  async updateModifierGroup(id: string, data: Record<string, unknown>) {
    const existing = await db.modifierGroups.get(id);
    if (!existing) return null;
    const updates: Partial<ModifierGroup> = { updatedAt: Date.now() };
    if (data.name !== undefined) updates.name = data.name as string;
    if (data.minSelections !== undefined) updates.minSelections = data.minSelections as number;
    if (data.maxSelections !== undefined) updates.maxSelections = data.maxSelections as number;
    await db.modifierGroups.update(id, updates);
    return db.modifierGroups.get(id);
  },
  async deleteModifierGroup(id: string) {
    const now = Date.now();
    await db.transaction("rw", [db.modifierGroups, db.modifiers, db.productModifierGroups], async () => {
      await db.modifiers.where("modifierGroupId").equals(id).modify({ deletedAt: now, updatedAt: now });
      await db.productModifierGroups.where("modifierGroupId").equals(id).modify({ deletedAt: now, updatedAt: now });
      await db.modifierGroups.update(id, { deletedAt: now, updatedAt: now });
    });
  },

  async listModifiers() {
    return notDeleted(await db.modifiers.toArray());
  },
  async getModifier(id: string) {
    return (await db.modifiers.get(id)) || null;
  },
  async createModifier(data: Record<string, unknown>) {
    const now = Date.now();
    const modifier: Modifier = {
      id: data.id as string,
      modifierGroupId: data.modifierGroupId as string,
      name: data.name as string,
      baseUpcharge: (data.baseUpcharge as number) ?? 0,
      inventoryItemId: (data.inventoryItemId as string) ?? null,
      quantityPerUse: (data.quantityPerUse as number) ?? null,
      updatedAt: now,
      deletedAt: null,
    };
    await db.modifiers.put(modifier);
    return modifier;
  },
  async updateModifier(id: string, data: Record<string, unknown>) {
    const existing = await db.modifiers.get(id);
    if (!existing) return null;
    const updates: Partial<Modifier> = { updatedAt: Date.now() };
    if (data.name !== undefined) updates.name = data.name as string;
    if (data.modifierGroupId !== undefined) updates.modifierGroupId = data.modifierGroupId as string;
    if (data.baseUpcharge !== undefined) updates.baseUpcharge = data.baseUpcharge as number;
    if (data.inventoryItemId !== undefined) updates.inventoryItemId = data.inventoryItemId as string;
    if (data.quantityPerUse !== undefined) updates.quantityPerUse = data.quantityPerUse as number;
    await db.modifiers.update(id, updates);
    return db.modifiers.get(id);
  },
  async deleteModifier(id: string) {
    const now = Date.now();
    await db.modifiers.update(id, { deletedAt: now, updatedAt: now });
  },

  async listProductModifierGroups() {
    return notDeleted(await db.productModifierGroups.toArray());
  },
  async setProductModifierGroups(productId: string, groupIds: string[]) {
    const now = Date.now();
    await db.transaction("rw", db.productModifierGroups, async () => {
      const existing = await db.productModifierGroups.where("productId").equals(productId).toArray();
      const existingMap = new Map(existing.map((row) => [row.modifierGroupId, row]));
      const newSet = new Set(groupIds);

      for (const row of existing) {
        if (!newSet.has(row.modifierGroupId) && !row.deletedAt) {
          await db.productModifierGroups.update([productId, row.modifierGroupId], { deletedAt: now, updatedAt: now });
        }
      }

      for (const gid of groupIds) {
        const existingRow = existingMap.get(gid);
        if (existingRow) {
          if (existingRow.deletedAt) {
            await db.productModifierGroups.update([productId, gid], { deletedAt: null, updatedAt: now });
          }
        } else {
          await db.productModifierGroups.put({
            productId,
            modifierGroupId: gid,
            scaleFactors: null,
            updatedAt: now,
            deletedAt: null,
          });
        }
      }
    });
  },
  async setProductModifierGroupScaleFactors(productId: string, modifierGroupId: string, scaleFactors: unknown) {
    const typedScaleFactors = scaleFactors as ModifierScaleFactors | null;
    await db.productModifierGroups.update([productId, modifierGroupId], {
      scaleFactors: typedScaleFactors,
      updatedAt: Date.now(),
    });
    return { success: true };
  },

  async listInventoryItems() {
    return notDeleted(await db.inventoryItems.toArray());
  },
  async getInventoryItem(id: string) {
    return (await db.inventoryItems.get(id)) || null;
  },
  async createInventoryItem(data: Record<string, unknown>) {
    const now = Date.now();
    const item: InventoryItem = {
      id: data.id as string,
      name: data.name as string,
      unitOfMeasure: (data.unitOfMeasure as string) ?? "each",
      currentQuantity: (data.currentQuantity as number) ?? 0,
      lowStockThreshold: (data.lowStockThreshold as number) ?? null,
      lastPurchasePrice: (data.lastPurchasePrice as number) ?? null,
      purchaseUnit: (data.purchaseUnit as string) ?? null,
      unitsPerPurchase: (data.unitsPerPurchase as number) ?? 1,
      updatedAt: now,
      deletedAt: null,
    };
    await db.inventoryItems.put(item);
    return item;
  },
  async updateInventoryItem(id: string, data: Record<string, unknown>) {
    const existing = await db.inventoryItems.get(id);
    if (!existing) return null;
    const updates: Partial<InventoryItem> = { updatedAt: Date.now() };
    if (data.name !== undefined) updates.name = data.name as string;
    if (data.unitOfMeasure !== undefined) updates.unitOfMeasure = data.unitOfMeasure as string;
    if (data.currentQuantity !== undefined) updates.currentQuantity = data.currentQuantity as number;
    if (data.lowStockThreshold !== undefined) updates.lowStockThreshold = data.lowStockThreshold as number;
    if (data.lastPurchasePrice !== undefined) updates.lastPurchasePrice = data.lastPurchasePrice as number;
    await db.inventoryItems.update(id, updates);
    return db.inventoryItems.get(id);
  },
  async adjustInventoryQuantity(id: string, delta: number) {
    // The same rule as the till's path: no quantity moves without a row saying why.
    await db.transaction("rw", [db.inventoryItems, db.inventoryLedger], async () => {
      const item = await db.inventoryItems.get(id);
      if (!item) return;
      const now = Date.now();
      const { rows, quantityAfter } = ledgerRows(new Map([[id, delta]]), { [id]: item.currentQuantity }, {
        reason: "MANUAL",
        createdAt: now,
        newId: itemId => `led_${itemId}_${Math.random().toString(16).slice(2)}_${now}`,
      });
      await db.inventoryItems.update(id, { currentQuantity: quantityAfter[id], updatedAt: now });
      await db.inventoryLedger.bulkPut(rows);
    });
    return db.inventoryItems.get(id);
  },
  async deleteInventoryItem(id: string) {
    const now = Date.now();
    await db.transaction("rw", [db.inventoryItems, db.billOfMaterials], async () => {
      await db.billOfMaterials.where("inventoryItemId").equals(id).modify({ deletedAt: now, updatedAt: now });
      await db.inventoryItems.update(id, { deletedAt: now, updatedAt: now });
    });
  },

  async listBom() {
    return notDeleted(await db.billOfMaterials.toArray());
  },
  async getBom(id: string) {
    return (await db.billOfMaterials.get(id)) || null;
  },
  async createBom(data: Record<string, unknown>) {
    const now = Date.now();
    const entry: BomEntry = {
      id: data.id as string,
      sourceType: data.sourceType as string,
      sourceId: data.sourceId as string,
      inventoryItemId: data.inventoryItemId as string,
      sourceProductId: (data.sourceProductId as string) ?? null,
      quantityDeducted: (data.quantityDeducted as number) ?? 0,
      scaleFactorMatrix: (data.scaleFactorMatrix as BomEntry["scaleFactorMatrix"]) ?? null,
      overrideModifierGroupId: (data.overrideModifierGroupId as string) ?? null,
      updatedAt: now,
      deletedAt: null,
    };
    await db.billOfMaterials.put(entry);
    return entry;
  },
  async updateBom(id: string, data: Record<string, unknown>) {
    const existing = await db.billOfMaterials.get(id);
    if (!existing) return null;
    const updates: Partial<BomEntry> = { updatedAt: Date.now() };
    if (data.sourceType !== undefined) updates.sourceType = data.sourceType as string;
    if (data.sourceId !== undefined) updates.sourceId = data.sourceId as string;
    if (data.inventoryItemId !== undefined) updates.inventoryItemId = data.inventoryItemId as string;
    if (data.sourceProductId !== undefined) updates.sourceProductId = data.sourceProductId as string | null;
    if (data.quantityDeducted !== undefined) updates.quantityDeducted = data.quantityDeducted as number;
    if (data.scaleFactorMatrix !== undefined) updates.scaleFactorMatrix = data.scaleFactorMatrix as BomEntry["scaleFactorMatrix"];
    if (data.overrideModifierGroupId !== undefined) updates.overrideModifierGroupId = data.overrideModifierGroupId as string | null;
    await db.billOfMaterials.update(id, updates);
    return db.billOfMaterials.get(id);
  },
  async deleteBom(id: string) {
    const now = Date.now();
    await db.billOfMaterials.update(id, { deletedAt: now, updatedAt: now });
  },

  async listInvoices() {
    return notDeleted(await db.invoices.toArray());
  },
  async getInvoice(id: string) {
    return (await db.invoices.get(id)) || null;
  },
  async createInvoice(data: Record<string, unknown>) {
    const now = Date.now();
    const invoice: Invoice = {
      id: data.id as string,
      supplierName: data.supplierName as string,
      invoiceNumber: data.invoiceNumber as string,
      date: data.date as string,
      status: (data.status as string) ?? "recorded",
      notes: (data.notes as string) ?? "",
      updatedAt: now,
      deletedAt: null,
    };
    await db.invoices.put(invoice);
    return invoice;
  },
  async updateInvoice(id: string, data: Record<string, unknown>) {
    const existing = await db.invoices.get(id);
    if (!existing) return null;
    const updates: Partial<Invoice> = { updatedAt: Date.now() };
    if (data.supplierName !== undefined) updates.supplierName = data.supplierName as string;
    if (data.invoiceNumber !== undefined) updates.invoiceNumber = data.invoiceNumber as string;
    if (data.date !== undefined) updates.date = data.date as string;
    if (data.status !== undefined) updates.status = data.status as string;
    if (data.notes !== undefined) updates.notes = data.notes as string;
    await db.invoices.update(id, updates);
    return db.invoices.get(id);
  },
  async deleteInvoice(id: string) {
    const now = Date.now();
    await db.transaction("rw", [db.invoices, db.invoiceLineItems], async () => {
      await db.invoiceLineItems.where("invoiceId").equals(id).modify({ deletedAt: now, updatedAt: now });
      await db.invoices.update(id, { deletedAt: now, updatedAt: now });
    });
  },

  async listInvoiceLineItems() {
    return notDeleted(await db.invoiceLineItems.toArray());
  },
  async getInvoiceLineItem(id: string) {
    return (await db.invoiceLineItems.get(id)) || null;
  },
  async createInvoiceLineItem(data: Record<string, unknown>) {
    const now = Date.now();
    const lineItem: InvoiceLineItem = {
      id: data.id as string,
      invoiceId: data.invoiceId as string,
      inventoryItemId: data.inventoryItemId as string,
      description: (data.description as string) ?? "",
      quantity: (data.quantity as number) ?? 0,
      unitPriceCents: (data.unitPriceCents as number) ?? 0,
      updatedAt: now,
      deletedAt: null,
    };
    await db.invoiceLineItems.put(lineItem);
    return lineItem;
  },
  async updateInvoiceLineItem(id: string, data: Record<string, unknown>) {
    const existing = await db.invoiceLineItems.get(id);
    if (!existing) return null;
    const updates: Partial<InvoiceLineItem> = { updatedAt: Date.now() };
    if (data.invoiceId !== undefined) updates.invoiceId = data.invoiceId as string;
    if (data.inventoryItemId !== undefined) updates.inventoryItemId = data.inventoryItemId as string;
    if (data.description !== undefined) updates.description = data.description as string;
    if (data.quantity !== undefined) updates.quantity = data.quantity as number;
    if (data.unitPriceCents !== undefined) updates.unitPriceCents = data.unitPriceCents as number;
    await db.invoiceLineItems.update(id, updates);
    return db.invoiceLineItems.get(id);
  },
  async deleteInvoiceLineItem(id: string) {
    const now = Date.now();
    await db.invoiceLineItems.update(id, { deletedAt: now, updatedAt: now });
  },

  async createInvoiceWithLineItems(invoiceData: Record<string, unknown>, lineItems: Record<string, unknown>[]) {
    const invoice = (await dexieAdminStorage.createInvoice(invoiceData)) as Invoice;
    const createdLineItems: unknown[] = [];
    for (const li of lineItems) {
      const created = await dexieAdminStorage.createInvoiceLineItem({ ...li, invoiceId: invoice.id });
      createdLineItems.push(created);
    }
    return { invoice, lineItems: createdLineItems };
  },

  async listSales() {
    return notDeleted(await db.sales.toArray());
  },
  async getSale(id: string) {
    return (await db.sales.get(id)) || null;
  },
  async createSale(data: Record<string, unknown>) {
    const now = Date.now();
    const sale: Sale = {
      id: data.id as string,
      createdAt: (data.createdAt as number) ?? now,
      subtotalCents: (data.subtotalCents as number) ?? 0,
      taxCents: (data.taxCents as number) ?? 0,
      totalCents: (data.totalCents as number) ?? 0,
      paymentMethod: (data.paymentMethod as string) ?? "cash",
      // Null means the till never asked, not zero — see the Sale type.
      tenderedCents: (data.tenderedCents as number) ?? null,
      changeCents: (data.changeCents as number) ?? null,
      taxRatePct: (data.taxRatePct as number) ?? null,
      taxInclusive: (data.taxInclusive as boolean) ?? null,
      employeeId: (data.employeeId as string) ?? null,
      status: (data.status as string) ?? "completed",
      linesJson: (data.linesJson as Sale["linesJson"]) ?? [],
      customerName: (data.customerName as string) ?? "",
      closedAt: (data.closedAt as number) ?? null,
      comboDiscountCents: (data.comboDiscountCents as number) ?? 0,
      updatedAt: now,
      deletedAt: null,
    };
    await db.sales.put(sale);
    return sale;
  },
  async updateSale(id: string, data: Record<string, unknown>) {
    const existing = await db.sales.get(id);
    if (!existing) return null;
    const updates: Partial<Sale> = { updatedAt: Date.now() };
    if (data.subtotalCents !== undefined) updates.subtotalCents = data.subtotalCents as number;
    if (data.taxCents !== undefined) updates.taxCents = data.taxCents as number;
    if (data.totalCents !== undefined) updates.totalCents = data.totalCents as number;
    if (data.paymentMethod !== undefined) updates.paymentMethod = data.paymentMethod as string;
    if (data.status !== undefined) updates.status = data.status as string;
    if (data.linesJson !== undefined) updates.linesJson = data.linesJson as Sale["linesJson"];
    if (data.customerName !== undefined) updates.customerName = data.customerName as string;
    if (data.closedAt !== undefined) updates.closedAt = data.closedAt as number | null;
    if (data.comboDiscountCents !== undefined) updates.comboDiscountCents = data.comboDiscountCents as number;
    await db.sales.update(id, updates);
    return db.sales.get(id);
  },

  async listEmployees() {
    return notDeleted(await db.employees.toArray());
  },
  async getEmployee(id: string) {
    return (await db.employees.get(id)) || null;
  },
  async createEmployee(data: Record<string, unknown>) {
    const now = Date.now();
    const employee: Employee = {
      id: data.id as string,
      name: data.name as string,
      role: (data.role as string) ?? "",
      payRate: (data.payRate as number) ?? 0,
      pin: (data.pin as string) ?? "",
      email: (data.email as string) ?? "",
      updatedAt: now,
      deletedAt: null,
    };
    await db.employees.put(employee);
    return employee;
  },
  async updateEmployee(id: string, data: Record<string, unknown>) {
    const existing = await db.employees.get(id);
    if (!existing) return null;
    const updates: Partial<Employee> = { updatedAt: Date.now() };
    if (data.name !== undefined) updates.name = data.name as string;
    if (data.role !== undefined) updates.role = data.role as string;
    if (data.payRate !== undefined) updates.payRate = data.payRate as number;
    if (data.pin !== undefined) updates.pin = data.pin as string;
    await db.employees.update(id, updates);
    return db.employees.get(id);
  },

  async listTimePunches() {
    return notDeleted(await db.timePunches.toArray());
  },

  async appendActionLog(entry: ActionLogEntry) {
    // put(), never update(): a new id every time, and nothing rewrites an existing row.
    await db.actionLog.put(entry);
    return entry;
  },

  async listSettings() {
    return db.settings.toArray();
  },
  async getSetting(key: string) {
    return (await db.settings.get(key)) ?? null;
  },
  async setSetting(key: string, value: unknown) {
    const row = { key, value, updatedAt: Date.now() };
    await db.settings.put(row);
    return row;
  },

  async getAllData() {
    return {
      products: notDeleted(await db.products.toArray()),
      variants: notDeleted(await db.variants.toArray()),
      modifierGroups: notDeleted(await db.modifierGroups.toArray()),
      productModifierGroups: notDeleted(await db.productModifierGroups.toArray()),
      modifiers: notDeleted(await db.modifiers.toArray()),
      inventoryItems: notDeleted(await db.inventoryItems.toArray()),
      billOfMaterials: notDeleted(await db.billOfMaterials.toArray()),
      employees: notDeleted(await db.employees.toArray()),
      sales: notDeleted(await db.sales.toArray()),
      invoices: notDeleted(await db.invoices.toArray()),
      invoiceLineItems: notDeleted(await db.invoiceLineItems.toArray()),
      combos: notDeleted(await db.combos.toArray()),
      comboItems: notDeleted(await db.comboItems.toArray()),
      productGroups: notDeleted(await db.productGroups.toArray()),
      productGroupItems: notDeleted(await db.productGroupItems.toArray()),
    };
  },
};
