import Dexie, { type Table } from "dexie";
import type { StoreSetting } from "@shared/api-handlers";
import type { InventoryLedgerEntry } from "@shared/ledger";
import type { ActionLogEntry } from "@shared/action-log";
import type { CashMovement, DrawerSession } from "@shared/drawer";
import { DEFAULT_POS_CHANNEL, POS_CHANNEL_KEY, type Channel } from "@shared/channels";
import { normalisedPurchaseUnit, normalisedSaleLines, normalisedUnitsPerPurchase } from "@shared/migrations";
import type {
  ProductAttributes,
  ModifierScaleFactors,
  ScaleFactorMatrix,
  SaleLine,
  PricingStrategy,
  ComboItemType,
  Product,
  Variant,
  ModifierGroup,
  ProductModifierGroup,
  Modifier,
  InventoryItem,
  Invoice,
  InvoiceLineItem,
  BomEntry,
  Employee,
  TimePunch,
  Sale,
  Combo,
  ComboItem,
  ProductGroup,
  ProductGroupItem,
} from "@shared/schema";

export type { InventoryLedgerEntry };
export type { ActionLogEntry };
export type { CashMovement, DrawerSession };
/**
 * The entity types are packages/domain's, re-exported so every `from "@/lib/db"`
 * in the till keeps working.
 *
 * They used to be declared here as well — sixteen interfaces that shadowed the
 * domain's sixteen and were kept equal by hand. Feature 28 T2 found out what that
 * costs: a field added to the domain `Sale` produced no error here, because this
 * file was never reading it, and the till would simply have stopped carrying the
 * field. One of the sixteen had already drifted by then — see Feature 36.
 *
 * packages/domain/no-shadow.test.ts fails if a second declaration appears.
 */
export type {
  ProductAttributes, ModifierScaleFactors, ScaleFactorMatrix, SaleLine, PricingStrategy, ComboItemType,
  Product, Variant, ModifierGroup, ProductModifierGroup, Modifier, InventoryItem,
  Invoice, InvoiceLineItem, BomEntry, Employee, TimePunch, Sale,
  Combo, ComboItem, ProductGroup, ProductGroupItem,
};

















class PosDatabase extends Dexie {
  products!: Table<Product, string>;
  variants!: Table<Variant, string>;
  modifierGroups!: Table<ModifierGroup, string>;
  productModifierGroups!: Table<ProductModifierGroup, [string, string]>;
  modifiers!: Table<Modifier, string>;
  inventoryItems!: Table<InventoryItem, string>;
  billOfMaterials!: Table<BomEntry, string>;
  employees!: Table<Employee, string>;
  timePunches!: Table<TimePunch, string>;
  sales!: Table<Sale, string>;
  invoices!: Table<Invoice, string>;
  invoiceLineItems!: Table<InvoiceLineItem, string>;
  combos!: Table<Combo, string>;
  comboItems!: Table<ComboItem, string>;
  productGroups!: Table<ProductGroup, string>;
  productGroupItems!: Table<ProductGroupItem, string>;
  settings!: Table<StoreSetting, string>;
  // Append-only: why every quantity moved. See shared/ledger.ts.
  inventoryLedger!: Table<InventoryLedgerEntry, string>;
  // Append-only: who decided what. No update, no delete — see shared/action-log.ts.
  actionLog!: Table<ActionLogEntry, string>;
  // What was in the drawer when it opened, and what was counted when it closed.
  drawerSessions!: Table<DrawerSession, string>;
  // Cash that moved without a sale, each row carrying why.
  cashMovements!: Table<CashMovement, string>;
  channels!: Table<Channel, string>;

  constructor() {
    super("cornerpos");

    this.version(1).stores({
      products: "id, name, type",
      variants: "id, productId, sku",
      modifierGroups: "id, name",
      productModifierGroups: "[productId+modifierGroupId], productId, modifierGroupId",
      modifiers: "id, modifierGroupId",
      inventoryItems: "id, name",
      billOfMaterials: "id, sourceType, sourceId, inventoryItemId, [sourceType+sourceId]",
      employees: "id, name",
      timePunches: "id, employeeId",
      sales: "id, createdAt",
    });

    this.version(2).stores({
      products: "id, name, type, availableAsIngredient",
      variants: "id, productId, sku",
      modifierGroups: "id, name",
      productModifierGroups: "[productId+modifierGroupId], productId, modifierGroupId",
      modifiers: "id, modifierGroupId",
      inventoryItems: "id, name",
      billOfMaterials: "id, sourceType, sourceId, inventoryItemId, sourceProductId, [sourceType+sourceId]",
      employees: "id, name",
      timePunches: "id, employeeId",
      sales: "id, createdAt",
    }).upgrade(async tx => {
      await tx.table("products").toCollection().modify(product => {
        if (product.availableAsIngredient === undefined) {
          product.availableAsIngredient = false;
        }
      });
      await tx.table("billOfMaterials").toCollection().modify(entry => {
        if (entry.sourceProductId === undefined) {
          entry.sourceProductId = null;
        }
      });
    });

    this.version(3).stores({}).upgrade(async tx => {
      function safeParse(val: unknown): unknown {
        if (typeof val !== "string") return val;
        try { return JSON.parse(val); } catch { return val; }
      }

      await tx.table("products").toCollection().modify(product => {
        if (typeof product.attributes === "string") {
          product.attributes = safeParse(product.attributes);
        }
      });

      await tx.table("productModifierGroups").toCollection().modify(pmg => {
        if (typeof pmg.scaleFactors === "string") {
          pmg.scaleFactors = safeParse(pmg.scaleFactors);
        }
      });

      await tx.table("billOfMaterials").toCollection().modify(entry => {
        if (typeof entry.scaleFactorMatrix === "string") {
          entry.scaleFactorMatrix = safeParse(entry.scaleFactorMatrix);
        }
      });

      await tx.table("sales").toCollection().modify(sale => {
        if (typeof sale.linesJson === "string") {
          sale.linesJson = (safeParse(sale.linesJson) as SaleLine[]) ?? [];
        }
      });
    });

    this.version(4).stores({}).upgrade(async tx => {
      const allVariants = await tx.table("variants").toArray();
      const variantsByProduct: Record<string, { id: string; name: string }[]> = {};
      for (const v of allVariants) {
        if (!variantsByProduct[v.productId]) variantsByProduct[v.productId] = [];
        variantsByProduct[v.productId].push({ id: v.id, name: v.name });
      }

      await tx.table("productModifierGroups").toCollection().modify(pmg => {
        if (!pmg.scaleFactors) return;
        const pVariants = variantsByProduct[pmg.productId] || [];
        const nameToId: Record<string, string> = {};
        for (const v of pVariants) nameToId[v.name] = v.id;
        const newSf: Record<string, Record<string, number>> = {};
        for (const [modId, sizeMap] of Object.entries(pmg.scaleFactors as Record<string, Record<string, number>>)) {
          const newInner: Record<string, number> = {};
          for (const [key, val] of Object.entries(sizeMap)) {
            const resolvedId = nameToId[key] || key;
            newInner[resolvedId] = val;
          }
          newSf[modId] = newInner;
        }
        pmg.scaleFactors = newSf;
      });

      const allModifiers = await tx.table("modifiers").toArray();
      const modToGroup: Record<string, string> = {};
      for (const m of allModifiers) modToGroup[m.id] = m.modifierGroupId;

      const allPmg = await tx.table("productModifierGroups").toArray();
      const groupToProducts: Record<string, string[]> = {};
      for (const pmg of allPmg) {
        if (!groupToProducts[pmg.modifierGroupId]) groupToProducts[pmg.modifierGroupId] = [];
        groupToProducts[pmg.modifierGroupId].push(pmg.productId);
      }

      await tx.table("billOfMaterials").toCollection().modify(entry => {
        if (!entry.scaleFactorMatrix) return;
        const nameToId: Record<string, string> = {};
        if (entry.sourceType === "VARIANT") {
          const v = allVariants.find((vr: { id: string; productId: string }) => vr.id === entry.sourceId);
          if (v) {
            for (const pv of variantsByProduct[v.productId] || []) nameToId[pv.name] = pv.id;
          }
        } else if (entry.sourceType === "MODIFIER") {
          const groupId = modToGroup[entry.sourceId];
          if (groupId) {
            for (const pId of groupToProducts[groupId] || []) {
              for (const pv of variantsByProduct[pId] || []) nameToId[pv.name] = pv.id;
            }
          }
        }
        const newMatrix: Record<string, number> = {};
        for (const [key, val] of Object.entries(entry.scaleFactorMatrix as Record<string, number>)) {
          const resolvedId = nameToId[key] || key;
          newMatrix[resolvedId] = val;
        }
        entry.scaleFactorMatrix = newMatrix;
      });

      await tx.table("inventoryItems").toCollection().modify(item => {
        if (item.trackingConfig !== undefined) {
          let threshold: number | null = null;
          if (typeof item.trackingConfig === "string") {
            try {
              const config = JSON.parse(item.trackingConfig);
              if (config && typeof config.low_stock_alert === "number") {
                threshold = config.low_stock_alert;
              }
            } catch { /* ignore parse errors */ }
          }
          item.lowStockThreshold = threshold;
          delete item.trackingConfig;
        }
      });

      await tx.table("sales").toCollection().modify(sale => {
        if (Array.isArray(sale.linesJson)) {
          for (const line of sale.linesJson) {
            if (line.productName === undefined) line.productName = "";
            if (line.variantName === undefined) line.variantName = "";
          }
        }
      });
    });

    this.version(5).stores({
      invoices: "id, supplierName, invoiceNumber, date, updatedAt",
      invoiceLineItems: "id, invoiceId, inventoryItemId, updatedAt",
      products: "id, name, type, availableAsIngredient, updatedAt",
      variants: "id, productId, sku, updatedAt",
      modifierGroups: "id, name, updatedAt",
      productModifierGroups: "[productId+modifierGroupId], productId, modifierGroupId, updatedAt",
      modifiers: "id, modifierGroupId, updatedAt",
      inventoryItems: "id, name, updatedAt",
      billOfMaterials: "id, sourceType, sourceId, inventoryItemId, sourceProductId, [sourceType+sourceId], updatedAt",
      employees: "id, name, updatedAt",
      timePunches: "id, employeeId, updatedAt",
      sales: "id, createdAt, updatedAt",
    }).upgrade(async tx => {
      const now = Date.now();
      const tables = [
        "products", "variants", "modifierGroups", "productModifierGroups",
        "modifiers", "inventoryItems", "billOfMaterials", "employees",
        "timePunches", "sales",
      ];
      for (const tableName of tables) {
        await tx.table(tableName).toCollection().modify(record => {
          if (record.updatedAt === undefined) record.updatedAt = now;
          if (record.deletedAt === undefined) record.deletedAt = null;
        });
      }
      await tx.table("inventoryItems").toCollection().modify(item => {
        if (item.lastPurchasePrice === undefined) {
          item.lastPurchasePrice = null;
        }
      });
    });

    this.version(6).stores({}).upgrade(async tx => {
      await tx.table("sales").toCollection().modify(sale => {
        if (sale.customerName === undefined) sale.customerName = "";
        if (sale.closedAt === undefined) sale.closedAt = sale.createdAt;
      });
    });

    this.version(7).stores({
      combos: "id, name, updatedAt",
      comboItems: "id, comboId, itemType, itemId, updatedAt",
      productGroups: "id, name, updatedAt",
      productGroupItems: "id, productGroupId, itemType, itemId, updatedAt",
    }).upgrade(async tx => {
      await tx.table("sales").toCollection().modify(sale => {
        if (sale.comboDiscountCents === undefined) sale.comboDiscountCents = 0;
        if (Array.isArray(sale.linesJson)) {
          for (const line of sale.linesJson) {
            if (line.comboId === undefined) line.comboId = null;
            if (line.comboName === undefined) line.comboName = null;
            if (line.originalPriceCents === undefined) line.originalPriceCents = line.unitPrice;
            if (line.finalPriceCents === undefined) line.finalPriceCents = line.unitPrice;
          }
        }
      });
    });

    this.version(8).stores({}).upgrade(async tx => {
      await tx.table("employees").toCollection().modify(emp => {
        if (emp.email === undefined) emp.email = "";
      });
    });

    this.version(9).stores({
      settings: "key, updatedAt",
    });

    // Feature 11: items bought by the pack. Existing rows are bought and stocked in the same
    // unit until an operator says otherwise, which is exactly unitsPerPurchase = 1.
    this.version(10).stores({}).upgrade(async tx => {
      await tx.table("inventoryItems").toCollection().modify(item => {
        if (item.unitsPerPurchase === undefined) item.unitsPerPurchase = 1;
        if (item.purchaseUnit === undefined) item.purchaseUnit = null;
      });
    });

    // Feature 16: what the customer handed over. Null on rows recorded before the till
    // asked — an honest "unknown", distinguishable from a zero.
    this.version(11).stores({}).upgrade(async tx => {
      await tx.table("sales").toCollection().modify(sale => {
        if (sale.tenderedCents === undefined) sale.tenderedCents = null;
        if (sale.changeCents === undefined) sale.changeCents = null;
      });
    });

    // Feature 15: the ledger. New table only — nothing to backfill, because there is no
    // history to invent. It starts explaining movements from here on.
    this.version(12).stores({
      inventoryLedger: "id, inventoryItemId, createdAt, reason, refId",
    });

    // Feature 21 T4: the rate a sale was charged at. Null on older rows — what they were
    // charged is genuinely unknown, and inventing 8.25% would be a lie with a decimal point.
    this.version(13).stores({}).upgrade(async tx => {
      await tx.table("sales").toCollection().modify(sale => {
        if (sale.taxRatePct === undefined) sale.taxRatePct = null;
        if (sale.taxInclusive === undefined) sale.taxInclusive = null;
      });
    });

    // Feature 25 T2: a category of its own. Seeded from each product's first tag, with tags
    // left exactly as they were — no data is lost and nothing needs re-tagging.
    this.version(14).stores({}).upgrade(async tx => {
      await tx.table("products").toCollection().modify(product => {
        if (product.category === undefined) {
          product.category = (product.attributes?.tags || [])[0] ?? null;
        }
      });
    });

    // Feature 25 T3: grid arrangement. Seeded from the order rows already come back in, so an
    // upgrade preserves what the operator was looking at instead of resorting the menu.
    this.version(15).stores({}).upgrade(async tx => {
      const products = await tx.table("products").toArray();
      let position = 0;
      for (const product of products) {
        if (product.sortOrder === undefined || product.sortOrder === null) {
          await tx.table("products").update(product.id, { sortOrder: position });
        }
        position += 1;
      }
    });

    // Feature 19 T2: who rang the sale. Null on existing rows — nobody recorded it, and
    // inventing a cashier for last week's takings is the kind of guess an audit hates.
    this.version(16).stores({ sales: "id, createdAt, updatedAt, employeeId" }).upgrade(async tx => {
      await tx.table("sales").toCollection().modify(sale => {
        if (sale.employeeId === undefined) sale.employeeId = null;
      });
    });

    // Feature 19 T3: the action log. New table only; nothing to backfill, because there is no
    // history of decisions to invent.
    this.version(17).stores({
      actionLog: "id, at, action, targetId, actorId",
    });

    // Feature 22 T1: the drawer session. openedAt is indexed because "which session covers this
    // sale" is the query the whole feature turns on.
    this.version(18).stores({
      drawerSessions: "id, openedAt, closedAt",
    });

    // Feature 22 T2: paid in / paid out.
    this.version(19).stores({
      cashMovements: "id, sessionId, at, kind",
    });

    // Feature 28: the channel registry, so the till's local admin server answers
    // the same /api/admin/channels the core does. Seeded with the till's own
    // channel on upgrade, because a database that has never seen one still has a
    // front counter.
    this.version(20).stores({
      channels: "key, kind, updatedAt",
    }).upgrade(async tx => {
      await tx.table("channels").put({ ...DEFAULT_POS_CHANNEL, updatedAt: Date.now() });
    });

    // Every sale in a till's IndexedDB was rung on the till, by construction —
    // there was no other way for one to exist. Stamped rather than left undefined
    // because a browser's database has no reseed path short of clearing it, and
    // three lines here costs less than every reader guarding for a missing field.
    this.version(21).stores({ sales: "id, createdAt, updatedAt, employeeId, channelKey" }).upgrade(async tx => {
      await tx.table("sales").toCollection().modify(sale => {
        if (!sale.channelKey) sale.channelKey = POS_CHANNEL_KEY;
      });
    });

    /**
     * Feature 36 T1. The till kept its own copy of sixteen entity types and one of
     * them had already drifted: InventoryItem's purchaseUnit and unitsPerPurchase
     * were optional here and required in packages/domain, which is the shape the
     * server's columns actually have (units_per_purchase is NOT NULL DEFAULT 1).
     *
     * T2 deletes the duplicate declarations. This runs first, because an optional
     * field becoming required is a promise about rows that already exist — and a
     * type that promises a field the data does not carry is worse than the
     * duplication it replaces.
     *
     * A missing unitsPerPurchase is exactly the input Feature 11 was written
     * about: costPerStockUnit passes the price through unconverted when the factor
     * is absent, so an item bought by the case has been costed as though it were
     * bought by the unit.
     */
    this.version(22).stores({}).upgrade(async tx => {
      await tx.table("inventoryItems").toCollection().modify(item => {
        item.unitsPerPurchase = normalisedUnitsPerPurchase(item.unitsPerPurchase);
        item.purchaseUnit = normalisedPurchaseUnit(item.purchaseUnit);
      });
      // Version 3 normalised these once already, which is the evidence that a sale
      // can carry linesJson as a string. Anything arriving since — a restore, a
      // sync from an older device — would have slipped past it.
      await tx.table("sales").toCollection().modify(sale => {
        sale.linesJson = normalisedSaleLines(sale.linesJson);
      });
    });
  }
}

export const db = new PosDatabase();

/**
 * Every table backup and restore operate on.
 *
 * Derived from the Dexie schema rather than written out by hand. The bug this
 * replaces was three hand-maintained copies of this list that had drifted to ten
 * entries while the schema had sixteen — combos, product groups and invoices were
 * silently missing from every backup. A derived list cannot drift: add a table to
 * the schema and it is backed up.
 */
export const BACKUP_TABLES: string[] = db.tables.map(t => t.name);
