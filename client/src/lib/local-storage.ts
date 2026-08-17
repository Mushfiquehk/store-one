import { db } from "./db";
import { costPerStockUnit, stockUnitsReceived } from "@shared/units";
import type {
  Product,
  Variant,
  ModifierGroup,
  Modifier,
  InventoryItem,
  BomEntry,
  Employee,
  TimePunch,
  Sale,
  Invoice,
  InvoiceLineItem,
  ModifierScaleFactors,
  Combo,
  ComboItem,
  ProductGroup,
  ProductGroupItem,
} from "./db";

function notDeleted<T extends { deletedAt: number | null }>(items: T[]): T[] {
  return items.filter(item => !item.deletedAt);
}

export const storage = {
  async getProducts(): Promise<Product[]> {
    return notDeleted(await db.products.toArray());
  },

  async createProduct(data: Partial<Product>): Promise<Product> {
    const now = Date.now();
    const product: Product = {
      id: data.id!,
      name: data.name!,
      type: data.type!,
      isComposite: data.isComposite ?? false,
      availableAsIngredient: data.availableAsIngredient ?? false,
      attributes: data.attributes ?? null,
      createdAt: data.createdAt ?? new Date().toISOString(),
      updatedAt: data.updatedAt ?? now,
      deletedAt: null,
    };
    await db.products.put(product);
    return product;
  },

  async updateProduct(id: string, data: Partial<Product>): Promise<Product | undefined> {
    await db.products.update(id, { ...data, updatedAt: Date.now() });
    return db.products.get(id);
  },

  async deleteProduct(id: string): Promise<void> {
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

  async getVariants(productId?: string): Promise<Variant[]> {
    if (productId) {
      return notDeleted(await db.variants.where("productId").equals(productId).toArray());
    }
    return notDeleted(await db.variants.toArray());
  },

  async createVariant(data: Partial<Variant>): Promise<Variant> {
    const now = Date.now();
    const variant: Variant = {
      id: data.id!,
      productId: data.productId!,
      sku: data.sku ?? null,
      name: data.name!,
      basePrice: data.basePrice!,
      directInventoryId: data.directInventoryId ?? null,
      updatedAt: data.updatedAt ?? now,
      deletedAt: null,
    };
    await db.variants.put(variant);
    return variant;
  },

  async updateVariant(id: string, data: Partial<Variant>): Promise<Variant | undefined> {
    await db.variants.update(id, { ...data, updatedAt: Date.now() });
    return db.variants.get(id);
  },

  async deleteVariant(id: string): Promise<void> {
    const now = Date.now();
    await db.transaction("rw", [db.variants, db.billOfMaterials], async () => {
      await db.billOfMaterials.where("[sourceType+sourceId]").equals(["VARIANT", id]).modify({ deletedAt: now, updatedAt: now });
      await db.variants.update(id, { deletedAt: now, updatedAt: now });
    });
  },

  async getModifierGroups(): Promise<ModifierGroup[]> {
    return notDeleted(await db.modifierGroups.toArray());
  },

  async createModifierGroup(data: Partial<ModifierGroup>): Promise<ModifierGroup> {
    const now = Date.now();
    const group: ModifierGroup = {
      id: data.id!,
      name: data.name!,
      minSelections: data.minSelections ?? 0,
      maxSelections: data.maxSelections ?? 0,
      updatedAt: data.updatedAt ?? now,
      deletedAt: null,
    };
    await db.modifierGroups.put(group);
    return group;
  },

  async updateModifierGroup(id: string, data: Partial<ModifierGroup>): Promise<ModifierGroup | undefined> {
    await db.modifierGroups.update(id, { ...data, updatedAt: Date.now() });
    return db.modifierGroups.get(id);
  },

  async deleteModifierGroup(id: string): Promise<void> {
    const now = Date.now();
    await db.transaction("rw", [db.modifierGroups, db.modifiers, db.productModifierGroups], async () => {
      await db.modifiers.where("modifierGroupId").equals(id).modify({ deletedAt: now, updatedAt: now });
      await db.productModifierGroups.where("modifierGroupId").equals(id).modify({ deletedAt: now, updatedAt: now });
      await db.modifierGroups.update(id, { deletedAt: now, updatedAt: now });
    });
  },

  async getModifiers(groupId?: string): Promise<Modifier[]> {
    if (groupId) {
      return notDeleted(await db.modifiers.where("modifierGroupId").equals(groupId).toArray());
    }
    return notDeleted(await db.modifiers.toArray());
  },

  async createModifier(data: Partial<Modifier>): Promise<Modifier> {
    const now = Date.now();
    const modifier: Modifier = {
      id: data.id!,
      modifierGroupId: data.modifierGroupId!,
      name: data.name!,
      baseUpcharge: data.baseUpcharge ?? 0,
      inventoryItemId: data.inventoryItemId ?? null,
      quantityPerUse: data.quantityPerUse ?? null,
      updatedAt: data.updatedAt ?? now,
      deletedAt: null,
    };
    await db.modifiers.put(modifier);
    return modifier;
  },

  async updateModifier(id: string, data: Partial<Modifier>): Promise<Modifier | undefined> {
    await db.modifiers.update(id, { ...data, updatedAt: Date.now() });
    return db.modifiers.get(id);
  },

  async deleteModifier(id: string): Promise<void> {
    const now = Date.now();
    await db.modifiers.update(id, { deletedAt: now, updatedAt: now });
  },

  async getAllProductModifierGroupLinks(): Promise<Record<string, string[]>> {
    const rows = notDeleted(await db.productModifierGroups.toArray());
    const map: Record<string, string[]> = {};
    for (const r of rows) {
      if (!map[r.productId]) map[r.productId] = [];
      map[r.productId].push(r.modifierGroupId);
    }
    return map;
  },

  async getProductModifierGroups(productId: string): Promise<string[]> {
    const rows = notDeleted(await db.productModifierGroups.where("productId").equals(productId).toArray());
    return rows.map(r => r.modifierGroupId);
  },

  async setProductModifierGroups(productId: string, groupIds: string[]): Promise<void> {
    const now = Date.now();
    await db.transaction("rw", db.productModifierGroups, async () => {
      const existing = await db.productModifierGroups.where("productId").equals(productId).toArray();
      const existingMap = new Map(existing.map(row => [row.modifierGroupId, row]));
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

  async getAllProductModifierScaleFactors(): Promise<Record<string, ModifierScaleFactors | null>> {
    const rows = notDeleted(await db.productModifierGroups.toArray());
    const map: Record<string, ModifierScaleFactors | null> = {};
    for (const r of rows) {
      if (r.scaleFactors) {
        map[`${r.productId}::${r.modifierGroupId}`] = r.scaleFactors;
      }
    }
    return map;
  },

  async setProductModifierScaleFactors(productId: string, modifierGroupId: string, scaleFactors: ModifierScaleFactors | null): Promise<void> {
    await db.productModifierGroups.update([productId, modifierGroupId], { scaleFactors, updatedAt: Date.now() });
  },

  async getInventoryItems(): Promise<InventoryItem[]> {
    return notDeleted(await db.inventoryItems.toArray());
  },

  async createInventoryItem(data: Partial<InventoryItem>): Promise<InventoryItem> {
    const now = Date.now();
    const item: InventoryItem = {
      id: data.id!,
      name: data.name!,
      unitOfMeasure: data.unitOfMeasure!,
      currentQuantity: data.currentQuantity ?? 0,
      lowStockThreshold: data.lowStockThreshold ?? null,
      lastPurchasePrice: data.lastPurchasePrice ?? null,
      updatedAt: data.updatedAt ?? now,
      deletedAt: null,
    };
    await db.inventoryItems.put(item);
    return item;
  },

  async updateInventoryItem(id: string, data: Partial<InventoryItem>): Promise<InventoryItem | undefined> {
    await db.inventoryItems.update(id, { ...data, updatedAt: Date.now() });
    return db.inventoryItems.get(id);
  },

  async adjustInventoryQuantity(id: string, delta: number): Promise<InventoryItem | undefined> {
    const item = await db.inventoryItems.get(id);
    if (!item) return undefined;
    const newQty = Math.max(0, item.currentQuantity + delta);
    await db.inventoryItems.update(id, { currentQuantity: newQty, updatedAt: Date.now() });
    return db.inventoryItems.get(id);
  },

  async deleteInventoryItem(id: string): Promise<void> {
    const now = Date.now();
    await db.transaction("rw", [db.inventoryItems, db.billOfMaterials], async () => {
      await db.billOfMaterials.where("inventoryItemId").equals(id).modify({ deletedAt: now, updatedAt: now });
      await db.inventoryItems.update(id, { deletedAt: now, updatedAt: now });
    });
  },

  async getBom(sourceType?: string, sourceId?: string): Promise<BomEntry[]> {
    if (sourceType && sourceId) {
      return notDeleted(await db.billOfMaterials.where("[sourceType+sourceId]").equals([sourceType, sourceId]).toArray());
    }
    return notDeleted(await db.billOfMaterials.toArray());
  },

  async createBom(data: Partial<BomEntry>): Promise<BomEntry> {
    const now = Date.now();
    const entry: BomEntry = {
      id: data.id!,
      sourceType: data.sourceType!,
      sourceId: data.sourceId!,
      inventoryItemId: data.inventoryItemId!,
      sourceProductId: data.sourceProductId ?? null,
      quantityDeducted: data.quantityDeducted!,
      scaleFactorMatrix: data.scaleFactorMatrix ?? null,
      overrideModifierGroupId: data.overrideModifierGroupId ?? null,
      updatedAt: data.updatedAt ?? now,
      deletedAt: null,
    };
    await db.billOfMaterials.put(entry);
    return entry;
  },

  async updateBom(id: string, data: Partial<BomEntry>): Promise<BomEntry | undefined> {
    await db.billOfMaterials.update(id, { ...data, updatedAt: Date.now() });
    return db.billOfMaterials.get(id);
  },

  async deleteBom(id: string): Promise<void> {
    const now = Date.now();
    await db.billOfMaterials.update(id, { deletedAt: now, updatedAt: now });
  },

  async getEmployees(): Promise<Employee[]> {
    return notDeleted(await db.employees.toArray());
  },

  async createEmployee(data: Partial<Employee>): Promise<Employee> {
    const now = Date.now();
    const employee: Employee = {
      id: data.id!,
      name: data.name!,
      role: data.role!,
      payRate: data.payRate!,
      pin: data.pin!,
      email: data.email ?? "",
      updatedAt: data.updatedAt ?? now,
      deletedAt: null,
    };
    await db.employees.put(employee);
    return employee;
  },

  async updateEmployee(id: string, data: Partial<Employee>): Promise<Employee | undefined> {
    await db.employees.update(id, { ...data, updatedAt: Date.now() });
    return db.employees.get(id);
  },

  async deleteEmployee(id: string): Promise<void> {
    const now = Date.now();
    await db.employees.update(id, { deletedAt: now, updatedAt: now });
  },

  async getTimePunches(employeeId?: string): Promise<TimePunch[]> {
    if (employeeId) {
      return notDeleted(await db.timePunches.where("employeeId").equals(employeeId).toArray());
    }
    return notDeleted(await db.timePunches.toArray());
  },

  async createTimePunch(data: Partial<TimePunch>): Promise<TimePunch> {
    const now = Date.now();
    const punch: TimePunch = {
      id: data.id!,
      employeeId: data.employeeId!,
      timeIn: data.timeIn!,
      timeOut: data.timeOut ?? null,
      updatedAt: data.updatedAt ?? now,
      deletedAt: null,
    };
    await db.timePunches.put(punch);
    return punch;
  },

  async updateTimePunch(id: string, data: Partial<TimePunch>): Promise<TimePunch | undefined> {
    await db.timePunches.update(id, { ...data, updatedAt: Date.now() });
    return db.timePunches.get(id);
  },

  async getSales(): Promise<Sale[]> {
    return notDeleted(await db.sales.toArray());
  },

  async createSale(data: Partial<Sale>): Promise<Sale> {
    const now = Date.now();
    const sale: Sale = {
      id: data.id!,
      createdAt: data.createdAt!,
      subtotalCents: data.subtotalCents!,
      taxCents: data.taxCents!,
      totalCents: data.totalCents!,
      paymentMethod: data.paymentMethod!,
      tenderedCents: data.tenderedCents ?? null,
      changeCents: data.changeCents ?? null,
      status: data.status!,
      linesJson: data.linesJson!,
      customerName: data.customerName ?? "",
      closedAt: data.closedAt ?? null,
      comboDiscountCents: data.comboDiscountCents ?? 0,
      updatedAt: data.updatedAt ?? now,
      deletedAt: null,
    };
    await db.sales.put(sale);
    return sale;
  },

  async updateSale(id: string, data: Partial<Sale>): Promise<Sale | undefined> {
    await db.sales.update(id, { ...data, updatedAt: Date.now() });
    return db.sales.get(id);
  },

  async getInvoices(): Promise<Invoice[]> {
    return notDeleted(await db.invoices.toArray());
  },

  async getInvoice(id: string): Promise<Invoice | undefined> {
    return db.invoices.get(id);
  },

  async getInvoiceLineItems(invoiceId?: string): Promise<InvoiceLineItem[]> {
    if (invoiceId) {
      return notDeleted(await db.invoiceLineItems.where("invoiceId").equals(invoiceId).toArray());
    }
    return notDeleted(await db.invoiceLineItems.toArray());
  },

  async createInvoiceWithLineItems(
    invoiceData: Partial<Invoice>,
    lineItems: Partial<InvoiceLineItem>[]
  ): Promise<{ invoice: Invoice; lineItems: InvoiceLineItem[] }> {
    const now = Date.now();
    const invoice: Invoice = {
      id: invoiceData.id!,
      supplierName: invoiceData.supplierName!,
      invoiceNumber: invoiceData.invoiceNumber!,
      date: invoiceData.date!,
      status: invoiceData.status ?? "recorded",
      notes: invoiceData.notes ?? "",
      updatedAt: now,
      deletedAt: null,
    };

    const createdLineItems: InvoiceLineItem[] = [];

    await db.transaction("rw", [db.invoices, db.invoiceLineItems, db.inventoryItems], async () => {
      await db.invoices.put(invoice);

      for (const li of lineItems) {
        const lineItem: InvoiceLineItem = {
          id: li.id!,
          invoiceId: invoice.id,
          inventoryItemId: li.inventoryItemId!,
          description: li.description ?? "",
          quantity: li.quantity!,
          unitPriceCents: li.unitPriceCents!,
          updatedAt: now,
          deletedAt: null,
        };
        await db.invoiceLineItems.put(lineItem);
        createdLineItems.push(lineItem);

        const existingItem = await db.inventoryItems.get(lineItem.inventoryItemId);
        if (existingItem) {
          await db.inventoryItems.update(existingItem.id, {
            // The invoice quotes a price per purchase unit; lastPurchasePrice is per stocking unit.
            lastPurchasePrice: costPerStockUnit(lineItem.unitPriceCents, existingItem.unitsPerPurchase),
            // One gallon received is 128 oz on hand, not 1.
            currentQuantity: existingItem.currentQuantity + stockUnitsReceived(lineItem.quantity, existingItem.unitsPerPurchase),
            updatedAt: now,
          });
        } else {
          // A brand new item has no pack size yet, so it is stocked in whatever it was
          // bought in — unitsPerPurchase 1, price unconverted.
          const newItem: InventoryItem = {
            id: lineItem.inventoryItemId,
            name: lineItem.description || "Unknown Item",
            unitOfMeasure: "each",
            currentQuantity: lineItem.quantity,
            lowStockThreshold: null,
            lastPurchasePrice: lineItem.unitPriceCents,
            purchaseUnit: null,
            unitsPerPurchase: 1,
            updatedAt: now,
            deletedAt: null,
          };
          await db.inventoryItems.put(newItem);
        }
      }
    });

    return { invoice, lineItems: createdLineItems };
  },

  async createInvoiceLineItem(data: Partial<InvoiceLineItem>): Promise<InvoiceLineItem> {
    const now = Date.now();
    const lineItem: InvoiceLineItem = {
      id: data.id!,
      invoiceId: data.invoiceId!,
      inventoryItemId: data.inventoryItemId!,
      description: data.description ?? "",
      quantity: data.quantity!,
      unitPriceCents: data.unitPriceCents!,
      updatedAt: now,
      deletedAt: null,
    };

    await db.transaction("rw", [db.invoiceLineItems, db.inventoryItems], async () => {
      await db.invoiceLineItems.put(lineItem);

      const existingItem = await db.inventoryItems.get(lineItem.inventoryItemId);
      if (existingItem) {
        await db.inventoryItems.update(existingItem.id, {
          // The invoice quotes a price per purchase unit; lastPurchasePrice is per stocking unit.
          lastPurchasePrice: costPerStockUnit(lineItem.unitPriceCents, existingItem.unitsPerPurchase),
          // One gallon received is 128 oz on hand, not 1.
          currentQuantity: existingItem.currentQuantity + stockUnitsReceived(lineItem.quantity, existingItem.unitsPerPurchase),
          updatedAt: now,
        });
      } else {
        const newItem: InventoryItem = {
          id: lineItem.inventoryItemId,
          name: lineItem.description || "Unknown Item",
          unitOfMeasure: "each",
          currentQuantity: lineItem.quantity,
          lowStockThreshold: null,
          lastPurchasePrice: lineItem.unitPriceCents,
          purchaseUnit: null,
          unitsPerPurchase: 1,
          updatedAt: now,
          deletedAt: null,
        };
        await db.inventoryItems.put(newItem);
      }
    });

    return lineItem;
  },

  async updateInvoiceLineItem(id: string, data: Partial<InvoiceLineItem>): Promise<InvoiceLineItem | undefined> {
    await db.invoiceLineItems.update(id, { ...data, updatedAt: Date.now() });
    return db.invoiceLineItems.get(id);
  },

  async deleteInvoiceLineItem(id: string): Promise<void> {
    const now = Date.now();
    await db.invoiceLineItems.update(id, { deletedAt: now, updatedAt: now });
  },

  async updateInvoice(id: string, data: Partial<Invoice>): Promise<Invoice | undefined> {
    await db.invoices.update(id, { ...data, updatedAt: Date.now() });
    return db.invoices.get(id);
  },

  async deleteInvoice(id: string): Promise<void> {
    const now = Date.now();
    await db.transaction("rw", [db.invoices, db.invoiceLineItems], async () => {
      await db.invoiceLineItems.where("invoiceId").equals(id).modify({ deletedAt: now, updatedAt: now });
      await db.invoices.update(id, { deletedAt: now, updatedAt: now });
    });
  },

  async getCombos(): Promise<Combo[]> {
    return notDeleted(await db.combos.toArray());
  },

  async createCombo(data: Partial<Combo>): Promise<Combo> {
    const now = Date.now();
    const combo: Combo = {
      id: data.id!,
      name: data.name!,
      pricingStrategy: data.pricingStrategy!,
      fixedPriceCents: data.fixedPriceCents ?? null,
      discountValueCents: data.discountValueCents ?? null,
      discountPercent: data.discountPercent ?? null,
      active: data.active ?? true,
      updatedAt: data.updatedAt ?? now,
      deletedAt: null,
    };
    await db.combos.put(combo);
    return combo;
  },

  async updateCombo(id: string, data: Partial<Combo>): Promise<Combo | undefined> {
    await db.combos.update(id, { ...data, updatedAt: Date.now() });
    return db.combos.get(id);
  },

  async deleteCombo(id: string): Promise<void> {
    const now = Date.now();
    await db.transaction("rw", [db.combos, db.comboItems], async () => {
      await db.comboItems.where("comboId").equals(id).modify({ deletedAt: now, updatedAt: now });
      await db.combos.update(id, { deletedAt: now, updatedAt: now });
    });
  },

  async getComboItems(comboId?: string): Promise<ComboItem[]> {
    if (comboId) {
      return notDeleted(await db.comboItems.where("comboId").equals(comboId).toArray());
    }
    return notDeleted(await db.comboItems.toArray());
  },

  async createComboItem(data: Partial<ComboItem>): Promise<ComboItem> {
    const now = Date.now();
    const item: ComboItem = {
      id: data.id!,
      comboId: data.comboId!,
      itemType: data.itemType!,
      itemId: data.itemId!,
      updatedAt: data.updatedAt ?? now,
      deletedAt: null,
    };
    await db.comboItems.put(item);
    return item;
  },

  async deleteComboItem(id: string): Promise<void> {
    const now = Date.now();
    await db.comboItems.update(id, { deletedAt: now, updatedAt: now });
  },

  async getProductGroups(): Promise<ProductGroup[]> {
    return notDeleted(await db.productGroups.toArray());
  },

  async createProductGroup(data: Partial<ProductGroup>): Promise<ProductGroup> {
    const now = Date.now();
    const group: ProductGroup = {
      id: data.id!,
      name: data.name!,
      updatedAt: data.updatedAt ?? now,
      deletedAt: null,
    };
    await db.productGroups.put(group);
    return group;
  },

  async updateProductGroup(id: string, data: Partial<ProductGroup>): Promise<ProductGroup | undefined> {
    await db.productGroups.update(id, { ...data, updatedAt: Date.now() });
    return db.productGroups.get(id);
  },

  async deleteProductGroup(id: string): Promise<void> {
    const now = Date.now();
    await db.transaction("rw", [db.productGroups, db.productGroupItems], async () => {
      await db.productGroupItems.where("productGroupId").equals(id).modify({ deletedAt: now, updatedAt: now });
      await db.productGroups.update(id, { deletedAt: now, updatedAt: now });
    });
  },

  async getProductGroupItems(groupId?: string): Promise<ProductGroupItem[]> {
    if (groupId) {
      return notDeleted(await db.productGroupItems.where("productGroupId").equals(groupId).toArray());
    }
    return notDeleted(await db.productGroupItems.toArray());
  },

  async createProductGroupItem(data: Partial<ProductGroupItem>): Promise<ProductGroupItem> {
    const now = Date.now();
    const item: ProductGroupItem = {
      id: data.id!,
      productGroupId: data.productGroupId!,
      itemType: data.itemType!,
      itemId: data.itemId!,
      updatedAt: data.updatedAt ?? now,
      deletedAt: null,
    };
    await db.productGroupItems.put(item);
    return item;
  },

  async deleteProductGroupItem(id: string): Promise<void> {
    const now = Date.now();
    await db.productGroupItems.update(id, { deletedAt: now, updatedAt: now });
  },
};
