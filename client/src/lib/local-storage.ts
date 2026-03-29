import { db } from "./db";
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
} from "./db";

export const storage = {
  async getProducts(): Promise<Product[]> {
    return db.products.toArray();
  },

  async createProduct(data: Partial<Product>): Promise<Product> {
    const product: Product = {
      id: data.id!,
      name: data.name!,
      type: data.type!,
      isComposite: data.isComposite ?? false,
      availableAsIngredient: data.availableAsIngredient ?? false,
      attributes: data.attributes ?? null,
      createdAt: data.createdAt ?? new Date().toISOString(),
    };
    await db.products.put(product);
    return product;
  },

  async updateProduct(id: string, data: Partial<Product>): Promise<Product | undefined> {
    await db.products.update(id, data);
    return db.products.get(id);
  },

  async deleteProduct(id: string): Promise<void> {
    await db.transaction("rw", [db.products, db.variants, db.productModifierGroups, db.billOfMaterials], async () => {
      const variantIds = (await db.variants.where("productId").equals(id).toArray()).map(v => v.id);
      for (const vid of variantIds) {
        await db.billOfMaterials.where("[sourceType+sourceId]").equals(["VARIANT", vid]).delete();
      }
      await db.variants.bulkDelete(variantIds);
      await db.productModifierGroups.where("productId").equals(id).delete();
      await db.billOfMaterials.where("sourceProductId").equals(id).delete();
      await db.products.delete(id);
    });
  },

  async getVariants(productId?: string): Promise<Variant[]> {
    if (productId) {
      return db.variants.where("productId").equals(productId).toArray();
    }
    return db.variants.toArray();
  },

  async createVariant(data: Partial<Variant>): Promise<Variant> {
    const variant: Variant = {
      id: data.id!,
      productId: data.productId!,
      sku: data.sku ?? null,
      name: data.name!,
      basePrice: data.basePrice!,
      directInventoryId: data.directInventoryId ?? null,
    };
    await db.variants.put(variant);
    return variant;
  },

  async updateVariant(id: string, data: Partial<Variant>): Promise<Variant | undefined> {
    await db.variants.update(id, data);
    return db.variants.get(id);
  },

  async deleteVariant(id: string): Promise<void> {
    await db.transaction("rw", [db.variants, db.billOfMaterials], async () => {
      await db.billOfMaterials.where("[sourceType+sourceId]").equals(["VARIANT", id]).delete();
      await db.variants.delete(id);
    });
  },

  async getModifierGroups(): Promise<ModifierGroup[]> {
    return db.modifierGroups.toArray();
  },

  async createModifierGroup(data: Partial<ModifierGroup>): Promise<ModifierGroup> {
    const group: ModifierGroup = {
      id: data.id!,
      name: data.name!,
      minSelections: data.minSelections ?? 0,
      maxSelections: data.maxSelections ?? 0,
    };
    await db.modifierGroups.put(group);
    return group;
  },

  async updateModifierGroup(id: string, data: Partial<ModifierGroup>): Promise<ModifierGroup | undefined> {
    await db.modifierGroups.update(id, data);
    return db.modifierGroups.get(id);
  },

  async deleteModifierGroup(id: string): Promise<void> {
    await db.transaction("rw", [db.modifierGroups, db.modifiers, db.productModifierGroups], async () => {
      await db.modifiers.where("modifierGroupId").equals(id).delete();
      await db.productModifierGroups.where("modifierGroupId").equals(id).delete();
      await db.modifierGroups.delete(id);
    });
  },

  async getModifiers(groupId?: string): Promise<Modifier[]> {
    if (groupId) {
      return db.modifiers.where("modifierGroupId").equals(groupId).toArray();
    }
    return db.modifiers.toArray();
  },

  async createModifier(data: Partial<Modifier>): Promise<Modifier> {
    const modifier: Modifier = {
      id: data.id!,
      modifierGroupId: data.modifierGroupId!,
      name: data.name!,
      baseUpcharge: data.baseUpcharge ?? 0,
      inventoryItemId: data.inventoryItemId ?? null,
      quantityPerUse: data.quantityPerUse ?? null,
    };
    await db.modifiers.put(modifier);
    return modifier;
  },

  async updateModifier(id: string, data: Partial<Modifier>): Promise<Modifier | undefined> {
    await db.modifiers.update(id, data);
    return db.modifiers.get(id);
  },

  async deleteModifier(id: string): Promise<void> {
    await db.modifiers.delete(id);
  },

  async getAllProductModifierGroupLinks(): Promise<Record<string, string[]>> {
    const rows = await db.productModifierGroups.toArray();
    const map: Record<string, string[]> = {};
    for (const r of rows) {
      if (!map[r.productId]) map[r.productId] = [];
      map[r.productId].push(r.modifierGroupId);
    }
    return map;
  },

  async getProductModifierGroups(productId: string): Promise<string[]> {
    const rows = await db.productModifierGroups.where("productId").equals(productId).toArray();
    return rows.map(r => r.modifierGroupId);
  },

  async setProductModifierGroups(productId: string, groupIds: string[]): Promise<void> {
    await db.transaction("rw", db.productModifierGroups, async () => {
      const existing = await db.productModifierGroups.where("productId").equals(productId).toArray();
      const existingScaleFactors: Record<string, ModifierScaleFactors | null> = {};
      for (const row of existing) {
        existingScaleFactors[row.modifierGroupId] = row.scaleFactors;
      }
      await db.productModifierGroups.where("productId").equals(productId).delete();
      for (const gid of groupIds) {
        await db.productModifierGroups.put({
          productId,
          modifierGroupId: gid,
          scaleFactors: existingScaleFactors[gid] || null,
        });
      }
    });
  },

  async getAllProductModifierScaleFactors(): Promise<Record<string, ModifierScaleFactors | null>> {
    const rows = await db.productModifierGroups.toArray();
    const map: Record<string, ModifierScaleFactors | null> = {};
    for (const r of rows) {
      if (r.scaleFactors) {
        map[`${r.productId}::${r.modifierGroupId}`] = r.scaleFactors;
      }
    }
    return map;
  },

  async setProductModifierScaleFactors(productId: string, modifierGroupId: string, scaleFactors: ModifierScaleFactors | null): Promise<void> {
    await db.productModifierGroups.update([productId, modifierGroupId], { scaleFactors });
  },

  async getInventoryItems(): Promise<InventoryItem[]> {
    return db.inventoryItems.toArray();
  },

  async createInventoryItem(data: Partial<InventoryItem>): Promise<InventoryItem> {
    const item: InventoryItem = {
      id: data.id!,
      name: data.name!,
      unitOfMeasure: data.unitOfMeasure!,
      currentQuantity: data.currentQuantity ?? 0,
      lowStockThreshold: data.lowStockThreshold ?? null,
      lastPurchasePrice: data.lastPurchasePrice ?? null,
    };
    await db.inventoryItems.put(item);
    return item;
  },

  async updateInventoryItem(id: string, data: Partial<InventoryItem>): Promise<InventoryItem | undefined> {
    await db.inventoryItems.update(id, data);
    return db.inventoryItems.get(id);
  },

  async adjustInventoryQuantity(id: string, delta: number): Promise<InventoryItem | undefined> {
    const item = await db.inventoryItems.get(id);
    if (!item) return undefined;
    const newQty = Math.max(0, item.currentQuantity + delta);
    await db.inventoryItems.update(id, { currentQuantity: newQty });
    return db.inventoryItems.get(id);
  },

  async deleteInventoryItem(id: string): Promise<void> {
    await db.transaction("rw", [db.inventoryItems, db.billOfMaterials], async () => {
      await db.billOfMaterials.where("inventoryItemId").equals(id).delete();
      await db.inventoryItems.delete(id);
    });
  },

  async getBom(sourceType?: string, sourceId?: string): Promise<BomEntry[]> {
    if (sourceType && sourceId) {
      return db.billOfMaterials.where("[sourceType+sourceId]").equals([sourceType, sourceId]).toArray();
    }
    return db.billOfMaterials.toArray();
  },

  async createBom(data: Partial<BomEntry>): Promise<BomEntry> {
    const entry: BomEntry = {
      id: data.id!,
      sourceType: data.sourceType!,
      sourceId: data.sourceId!,
      inventoryItemId: data.inventoryItemId!,
      sourceProductId: data.sourceProductId ?? null,
      quantityDeducted: data.quantityDeducted!,
      scaleFactorMatrix: data.scaleFactorMatrix ?? null,
      overrideModifierGroupId: data.overrideModifierGroupId ?? null,
    };
    await db.billOfMaterials.put(entry);
    return entry;
  },

  async updateBom(id: string, data: Partial<BomEntry>): Promise<BomEntry | undefined> {
    await db.billOfMaterials.update(id, data);
    return db.billOfMaterials.get(id);
  },

  async deleteBom(id: string): Promise<void> {
    await db.billOfMaterials.delete(id);
  },

  async getEmployees(): Promise<Employee[]> {
    return db.employees.toArray();
  },

  async createEmployee(data: Partial<Employee>): Promise<Employee> {
    const employee: Employee = {
      id: data.id!,
      name: data.name!,
      role: data.role!,
      payRate: data.payRate!,
      pin: data.pin!,
    };
    await db.employees.put(employee);
    return employee;
  },

  async updateEmployee(id: string, data: Partial<Employee>): Promise<Employee | undefined> {
    await db.employees.update(id, data);
    return db.employees.get(id);
  },

  async deleteEmployee(id: string): Promise<void> {
    await db.employees.delete(id);
  },

  async getTimePunches(employeeId?: string): Promise<TimePunch[]> {
    if (employeeId) {
      return db.timePunches.where("employeeId").equals(employeeId).toArray();
    }
    return db.timePunches.toArray();
  },

  async createTimePunch(data: Partial<TimePunch>): Promise<TimePunch> {
    const punch: TimePunch = {
      id: data.id!,
      employeeId: data.employeeId!,
      timeIn: data.timeIn!,
      timeOut: data.timeOut ?? null,
    };
    await db.timePunches.put(punch);
    return punch;
  },

  async updateTimePunch(id: string, data: Partial<TimePunch>): Promise<TimePunch | undefined> {
    await db.timePunches.update(id, data);
    return db.timePunches.get(id);
  },

  async getSales(): Promise<Sale[]> {
    return db.sales.toArray();
  },

  async createSale(data: Partial<Sale>): Promise<Sale> {
    const sale: Sale = {
      id: data.id!,
      createdAt: data.createdAt!,
      subtotalCents: data.subtotalCents!,
      taxCents: data.taxCents!,
      totalCents: data.totalCents!,
      paymentMethod: data.paymentMethod!,
      status: data.status!,
      linesJson: data.linesJson!,
    };
    await db.sales.put(sale);
    return sale;
  },

  async getInvoices(): Promise<Invoice[]> {
    return db.invoices.toArray();
  },

  async getInvoice(id: string): Promise<Invoice | undefined> {
    return db.invoices.get(id);
  },

  async getInvoiceLineItems(invoiceId?: string): Promise<InvoiceLineItem[]> {
    if (invoiceId) {
      return db.invoiceLineItems.where("invoiceId").equals(invoiceId).toArray();
    }
    return db.invoiceLineItems.toArray();
  },

  async createInvoiceWithLineItems(
    invoiceData: Partial<Invoice>,
    lineItems: Partial<InvoiceLineItem>[]
  ): Promise<{ invoice: Invoice; lineItems: InvoiceLineItem[] }> {
    const invoice: Invoice = {
      id: invoiceData.id!,
      supplierName: invoiceData.supplierName!,
      invoiceNumber: invoiceData.invoiceNumber!,
      date: invoiceData.date!,
      status: invoiceData.status ?? "recorded",
      notes: invoiceData.notes ?? "",
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
        };
        await db.invoiceLineItems.put(lineItem);
        createdLineItems.push(lineItem);

        const existingItem = await db.inventoryItems.get(lineItem.inventoryItemId);
        if (existingItem) {
          await db.inventoryItems.update(existingItem.id, {
            lastPurchasePrice: lineItem.unitPriceCents,
            currentQuantity: existingItem.currentQuantity + lineItem.quantity,
          });
        } else {
          const newItem: InventoryItem = {
            id: lineItem.inventoryItemId,
            name: lineItem.description || "Unknown Item",
            unitOfMeasure: "each",
            currentQuantity: lineItem.quantity,
            lowStockThreshold: null,
            lastPurchasePrice: lineItem.unitPriceCents,
          };
          await db.inventoryItems.put(newItem);
        }
      }
    });

    return { invoice, lineItems: createdLineItems };
  },

  async createInvoiceLineItem(data: Partial<InvoiceLineItem>): Promise<InvoiceLineItem> {
    const lineItem: InvoiceLineItem = {
      id: data.id!,
      invoiceId: data.invoiceId!,
      inventoryItemId: data.inventoryItemId!,
      description: data.description ?? "",
      quantity: data.quantity!,
      unitPriceCents: data.unitPriceCents!,
    };

    await db.transaction("rw", [db.invoiceLineItems, db.inventoryItems], async () => {
      await db.invoiceLineItems.put(lineItem);

      const existingItem = await db.inventoryItems.get(lineItem.inventoryItemId);
      if (existingItem) {
        await db.inventoryItems.update(existingItem.id, {
          lastPurchasePrice: lineItem.unitPriceCents,
          currentQuantity: existingItem.currentQuantity + lineItem.quantity,
        });
      } else {
        const newItem: InventoryItem = {
          id: lineItem.inventoryItemId,
          name: lineItem.description || "Unknown Item",
          unitOfMeasure: "each",
          currentQuantity: lineItem.quantity,
          lowStockThreshold: null,
          lastPurchasePrice: lineItem.unitPriceCents,
        };
        await db.inventoryItems.put(newItem);
      }
    });

    return lineItem;
  },

  async updateInvoiceLineItem(id: string, data: Partial<InvoiceLineItem>): Promise<InvoiceLineItem | undefined> {
    await db.invoiceLineItems.update(id, data);
    return db.invoiceLineItems.get(id);
  },

  async deleteInvoiceLineItem(id: string): Promise<void> {
    await db.invoiceLineItems.delete(id);
  },

  async updateInvoice(id: string, data: Partial<Invoice>): Promise<Invoice | undefined> {
    await db.invoices.update(id, data);
    return db.invoices.get(id);
  },

  async deleteInvoice(id: string): Promise<void> {
    await db.transaction("rw", [db.invoices, db.invoiceLineItems], async () => {
      await db.invoiceLineItems.where("invoiceId").equals(id).delete();
      await db.invoices.delete(id);
    });
  },
};
