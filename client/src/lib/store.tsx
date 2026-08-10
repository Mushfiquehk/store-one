import React, { createContext, useContext, useState, useCallback, useEffect } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "./db";
import { storage } from "./local-storage";
import { toast } from "@/hooks/use-toast";
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

export type { Product, Variant, ModifierGroup, Modifier, InventoryItem, BomEntry, Employee, TimePunch, Sale, Invoice, InvoiceLineItem, ModifierScaleFactors, Combo, ComboItem, ProductGroup, ProductGroupItem };

export type CartItem = {
  instanceId: string;
  variantId: string;
  productId: string;
  qty: number;
  modifiers: { modifierId: string; qty: number }[];
};

export type ProductModifierGroupLink = {
  productId: string;
  groupIds: string[];
};

type StoreContextType = {
  products: Product[];
  variants: Variant[];
  modifierGroups: ModifierGroup[];
  modifiers: Modifier[];
  inventory: InventoryItem[];
  bom: BomEntry[];
  employees: Employee[];
  timePunches: TimePunch[];
  sales: Sale[];
  invoices: Invoice[];
  invoiceLineItems: InvoiceLineItem[];
  combos: Combo[];
  comboItems: ComboItem[];
  productGroups: ProductGroup[];
  productGroupItems: ProductGroupItem[];
  integrations: string[];
  productModifierLinks: Record<string, string[]>;
  productModifierScaleFactors: Record<string, ModifierScaleFactors | null>;
  isLoading: boolean;

  addProduct: (data: Partial<Product>) => void;
  addProductAsync: (data: Partial<Product>) => Promise<any>;
  updateProduct: (id: string, data: Partial<Product>) => void;
  deleteProduct: (id: string) => void;

  addVariant: (data: Partial<Variant>) => void;
  addVariantAsync: (data: Partial<Variant>) => Promise<any>;
  updateVariant: (id: string, data: Partial<Variant>) => void;
  deleteVariant: (id: string) => void;

  addModifierGroup: (data: Partial<ModifierGroup>) => void;
  addModifierGroupAsync: (data: Partial<ModifierGroup>) => Promise<any>;
  updateModifierGroup: (id: string, data: Partial<ModifierGroup>) => void;
  deleteModifierGroup: (id: string) => void;

  addModifier: (data: Partial<Modifier>) => void;
  updateModifier: (id: string, data: Partial<Modifier>) => void;
  deleteModifier: (id: string) => void;

  setProductModifierGroups: (productId: string, groupIds: string[]) => void;
  setProductModifierGroupsAsync: (productId: string, groupIds: string[]) => Promise<any>;
  setProductModifierScaleFactors: (productId: string, groupId: string, scaleFactors: ModifierScaleFactors | null) => void;
  setProductModifierScaleFactorsAsync: (productId: string, groupId: string, scaleFactors: ModifierScaleFactors | null) => Promise<any>;

  addInventoryItem: (data: Partial<InventoryItem>) => void;
  addInventoryItemAsync: (data: Partial<InventoryItem>) => Promise<any>;
  updateInventoryItem: (id: string, data: Partial<InventoryItem>) => void;
  updateInventoryItemAsync: (id: string, data: Partial<InventoryItem>) => Promise<any>;
  adjustInventory: (id: string, delta: number) => void;
  deleteInventoryItem: (id: string) => void;

  addBom: (data: Partial<BomEntry>) => void;
  addBomAsync: (data: Partial<BomEntry>) => Promise<any>;
  updateBom: (id: string, data: Partial<BomEntry>) => void;
  deleteBom: (id: string) => void;

  addEmployee: (data: Partial<Employee>) => void;
  updateEmployee: (id: string, data: Partial<Employee>) => void;

  addTimePunch: (data: Partial<TimePunch>) => void;
  updateTimePunch: (id: string, data: Partial<TimePunch>) => void;

  addSale: (data: Partial<Sale>) => void;
  updateSale: (id: string, data: Partial<Sale>) => void;

  createInvoiceWithLineItems: (invoiceData: Partial<Invoice>, lineItems: Partial<InvoiceLineItem>[]) => Promise<any>;
  createInvoiceLineItem: (data: Partial<InvoiceLineItem>) => Promise<any>;
  updateInvoiceLineItem: (id: string, data: Partial<InvoiceLineItem>) => Promise<any>;
  deleteInvoiceLineItem: (id: string) => Promise<void>;
  updateInvoice: (id: string, data: Partial<Invoice>) => Promise<any>;
  deleteInvoice: (id: string) => Promise<void>;

  addCombo: (data: Partial<Combo>) => Promise<any>;
  updateCombo: (id: string, data: Partial<Combo>) => void;
  deleteCombo: (id: string) => void;
  addComboItem: (data: Partial<ComboItem>) => Promise<any>;
  deleteComboItem: (id: string) => void;
  addProductGroup: (data: Partial<ProductGroup>) => Promise<any>;
  updateProductGroup: (id: string, data: Partial<ProductGroup>) => void;
  deleteProductGroup: (id: string) => void;
  addProductGroupItem: (data: Partial<ProductGroupItem>) => Promise<any>;
  deleteProductGroupItem: (id: string) => void;

  toggleIntegration: (id: string) => void;
};

export const StoreContext = createContext<StoreContextType | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [integrations, setIntegrations] = useState<string[]>([]);

  const [dbReady, setDbReady] = useState(false);

  const products = useLiveQuery(() => db.products.filter(r => !r.deletedAt).toArray(), []) as Product[] | undefined;
  const variants = useLiveQuery(() => db.variants.filter(r => !r.deletedAt).toArray(), []) as Variant[] | undefined;
  const modifierGroupsList = useLiveQuery(() => db.modifierGroups.filter(r => !r.deletedAt).toArray(), []) as ModifierGroup[] | undefined;
  const modifiersList = useLiveQuery(() => db.modifiers.filter(r => !r.deletedAt).toArray(), []) as Modifier[] | undefined;
  const inventory = useLiveQuery(() => db.inventoryItems.filter(r => !r.deletedAt).toArray(), []) as InventoryItem[] | undefined;
  const bom = useLiveQuery(() => db.billOfMaterials.filter(r => !r.deletedAt).toArray(), []) as BomEntry[] | undefined;
  const employees = useLiveQuery(() => db.employees.filter(r => !r.deletedAt).toArray(), []) as Employee[] | undefined;
  const timePunches = useLiveQuery(() => db.timePunches.filter(r => !r.deletedAt).toArray(), []) as TimePunch[] | undefined;
  const sales = useLiveQuery(() => db.sales.filter(r => !r.deletedAt).toArray(), []) as Sale[] | undefined;
  const invoices = useLiveQuery(() => db.invoices.filter(r => !r.deletedAt).toArray(), []) as Invoice[] | undefined;
  const invoiceLineItemsList = useLiveQuery(() => db.invoiceLineItems.filter(r => !r.deletedAt).toArray(), []) as InvoiceLineItem[] | undefined;
  const combosList = useLiveQuery(() => db.combos.filter(r => !r.deletedAt).toArray(), []) as Combo[] | undefined;
  const comboItemsList = useLiveQuery(() => db.comboItems.filter(r => !r.deletedAt).toArray(), []) as ComboItem[] | undefined;
  const productGroupsList = useLiveQuery(() => db.productGroups.filter(r => !r.deletedAt).toArray(), []) as ProductGroup[] | undefined;
  const productGroupItemsList = useLiveQuery(() => db.productGroupItems.filter(r => !r.deletedAt).toArray(), []) as ProductGroupItem[] | undefined;

  const productModifierData = useLiveQuery(async () => {
    const rows = await db.productModifierGroups.filter(r => !r.deletedAt).toArray();
    const links: Record<string, string[]> = {};
    const sf: Record<string, ModifierScaleFactors | null> = {};
    for (const r of rows) {
      if (!links[r.productId]) links[r.productId] = [];
      links[r.productId].push(r.modifierGroupId);
      if (r.scaleFactors) {
        sf[`${r.productId}::${r.modifierGroupId}`] = r.scaleFactors;
      }
    }
    return { links, sf };
  }, []) as { links: Record<string, string[]>; sf: Record<string, ModifierScaleFactors | null> } | undefined;

  const productModifierLinks = productModifierData?.links ?? {};
  const productModifierScaleFactors = productModifierData?.sf ?? {};

  useEffect(() => {
    if (!dbReady && products !== undefined && variants !== undefined && inventory !== undefined) {
      setDbReady(true);
    }
  }, [dbReady, products, variants, inventory]);

  const isLoading = !dbReady;

  const addProduct = useCallback((data: Partial<Product>) => { storage.createProduct(data); }, []);
  const addProductAsync = useCallback((data: Partial<Product>) => storage.createProduct(data), []);
  const updateProduct = useCallback((id: string, data: Partial<Product>) => { storage.updateProduct(id, data); }, []);
  const deleteProduct = useCallback((id: string) => { storage.deleteProduct(id); }, []);

  const addVariant = useCallback((data: Partial<Variant>) => { storage.createVariant(data); }, []);
  const addVariantAsync = useCallback((data: Partial<Variant>) => storage.createVariant(data), []);
  const updateVariant = useCallback((id: string, data: Partial<Variant>) => { storage.updateVariant(id, data); }, []);
  const deleteVariant = useCallback((id: string) => { storage.deleteVariant(id); }, []);

  const addModifierGroup = useCallback((data: Partial<ModifierGroup>) => { storage.createModifierGroup(data); }, []);
  const addModifierGroupAsync = useCallback((data: Partial<ModifierGroup>) => storage.createModifierGroup(data), []);
  const updateModifierGroup = useCallback((id: string, data: Partial<ModifierGroup>) => { storage.updateModifierGroup(id, data); }, []);
  const deleteModifierGroup = useCallback((id: string) => { storage.deleteModifierGroup(id); }, []);

  const addModifier = useCallback((data: Partial<Modifier>) => { storage.createModifier(data); }, []);
  const updateModifier = useCallback((id: string, data: Partial<Modifier>) => { storage.updateModifier(id, data); }, []);
  const deleteModifier = useCallback((id: string) => { storage.deleteModifier(id); }, []);

  const setProductModifierGroups = useCallback((productId: string, groupIds: string[]) => { storage.setProductModifierGroups(productId, groupIds); }, []);
  const setProductModifierGroupsAsync = useCallback((productId: string, groupIds: string[]) => storage.setProductModifierGroups(productId, groupIds), []);
  const setProductModifierScaleFactorsSync = useCallback((productId: string, groupId: string, scaleFactors: ModifierScaleFactors | null) => { storage.setProductModifierScaleFactors(productId, groupId, scaleFactors); }, []);
  const setProductModifierScaleFactorsAsyncFn = useCallback((productId: string, groupId: string, scaleFactors: ModifierScaleFactors | null) => storage.setProductModifierScaleFactors(productId, groupId, scaleFactors), []);

  const addInventoryItem = useCallback((data: Partial<InventoryItem>) => { storage.createInventoryItem(data); }, []);
  const addInventoryItemAsync = useCallback((data: Partial<InventoryItem>) => storage.createInventoryItem(data), []);
  const updateInventoryItem = useCallback((id: string, data: Partial<InventoryItem>) => { storage.updateInventoryItem(id, data); }, []);
  const updateInventoryItemAsync = useCallback((id: string, data: Partial<InventoryItem>) => storage.updateInventoryItem(id, data), []);
  const adjustInventory = useCallback((id: string, delta: number) => { storage.adjustInventoryQuantity(id, delta); }, []);
  const deleteInventoryItem = useCallback((id: string) => { storage.deleteInventoryItem(id); }, []);

  const addBom = useCallback((data: Partial<BomEntry>) => { storage.createBom(data); }, []);
  const addBomAsync = useCallback((data: Partial<BomEntry>) => storage.createBom(data), []);
  const updateBom = useCallback((id: string, data: Partial<BomEntry>) => { storage.updateBom(id, data); }, []);
  const deleteBom = useCallback((id: string) => { storage.deleteBom(id); }, []);

  const addEmployee = useCallback((data: Partial<Employee>) => { storage.createEmployee(data); }, []);
  const updateEmployee = useCallback((id: string, data: Partial<Employee>) => { storage.updateEmployee(id, data); }, []);

  const addTimePunch = useCallback((data: Partial<TimePunch>) => { storage.createTimePunch(data); }, []);
  const updateTimePunch = useCallback((id: string, data: Partial<TimePunch>) => { storage.updateTimePunch(id, data); }, []);

  const addSale = useCallback((data: Partial<Sale>) => { storage.createSale(data); }, []);
  const updateSale = useCallback((id: string, data: Partial<Sale>) => { storage.updateSale(id, data); }, []);

  const createInvoiceWithLineItems = useCallback((invoiceData: Partial<Invoice>, lineItems: Partial<InvoiceLineItem>[]) => storage.createInvoiceWithLineItems(invoiceData, lineItems), []);
  const createInvoiceLineItem = useCallback((data: Partial<InvoiceLineItem>) => storage.createInvoiceLineItem(data), []);
  const updateInvoiceLineItem = useCallback((id: string, data: Partial<InvoiceLineItem>) => storage.updateInvoiceLineItem(id, data), []);
  const deleteInvoiceLineItem = useCallback((id: string) => storage.deleteInvoiceLineItem(id), []);
  const updateInvoice = useCallback((id: string, data: Partial<Invoice>) => storage.updateInvoice(id, data), []);
  const deleteInvoice = useCallback((id: string) => storage.deleteInvoice(id), []);

  const addCombo = useCallback((data: Partial<Combo>) => storage.createCombo(data), []);
  const updateCombo = useCallback((id: string, data: Partial<Combo>) => { storage.updateCombo(id, data); }, []);
  const deleteCombo = useCallback((id: string) => { storage.deleteCombo(id); }, []);
  const addComboItem = useCallback((data: Partial<ComboItem>) => storage.createComboItem(data), []);
  const deleteComboItem = useCallback((id: string) => { storage.deleteComboItem(id); }, []);
  const addProductGroup = useCallback((data: Partial<ProductGroup>) => storage.createProductGroup(data), []);
  const updateProductGroup = useCallback((id: string, data: Partial<ProductGroup>) => { storage.updateProductGroup(id, data); }, []);
  const deleteProductGroup = useCallback((id: string) => { storage.deleteProductGroup(id); }, []);
  const addProductGroupItem = useCallback((data: Partial<ProductGroupItem>) => storage.createProductGroupItem(data), []);
  const deleteProductGroupItem = useCallback((id: string) => { storage.deleteProductGroupItem(id); }, []);

  const toggleIntegration = useCallback((id: string) => {
    setIntegrations(prev => {
      if (prev.includes(id)) return prev.filter(i => i !== id);
      toast({ title: "Integration Connected", description: "Successfully linked to provider." });
      return [...prev, id];
    });
  }, []);

  const value: StoreContextType = {
    products: products ?? [],
    variants: variants ?? [],
    modifierGroups: modifierGroupsList ?? [],
    modifiers: modifiersList ?? [],
    inventory: inventory ?? [],
    bom: bom ?? [],
    employees: employees ?? [],
    timePunches: timePunches ?? [],
    sales: sales ?? [],
    invoices: invoices ?? [],
    invoiceLineItems: invoiceLineItemsList ?? [],
    combos: combosList ?? [],
    comboItems: comboItemsList ?? [],
    productGroups: productGroupsList ?? [],
    productGroupItems: productGroupItemsList ?? [],
    integrations,
    productModifierLinks,
    productModifierScaleFactors,
    isLoading,

    addProduct,
    addProductAsync,
    updateProduct,
    deleteProduct,

    addVariant,
    addVariantAsync,
    updateVariant,
    deleteVariant,

    addModifierGroup,
    addModifierGroupAsync,
    updateModifierGroup,
    deleteModifierGroup,

    addModifier,
    updateModifier,
    deleteModifier,

    setProductModifierGroups,
    setProductModifierGroupsAsync,
    setProductModifierScaleFactors: setProductModifierScaleFactorsSync,
    setProductModifierScaleFactorsAsync: setProductModifierScaleFactorsAsyncFn,

    addInventoryItem,
    addInventoryItemAsync,
    updateInventoryItem,
    updateInventoryItemAsync,
    adjustInventory,
    deleteInventoryItem,

    addBom,
    addBomAsync,
    updateBom,
    deleteBom,

    addEmployee,
    updateEmployee,

    addTimePunch,
    updateTimePunch,

    addSale,
    updateSale,

    createInvoiceWithLineItems,
    createInvoiceLineItem,
    updateInvoiceLineItem,
    deleteInvoiceLineItem,
    updateInvoice,
    deleteInvoice,

    addCombo,
    updateCombo,
    deleteCombo,
    addComboItem,
    deleteComboItem,
    addProductGroup,
    updateProductGroup,
    deleteProductGroup,
    addProductGroupItem,
    deleteProductGroupItem,

    toggleIntegration,
  };

  return (
    <StoreContext.Provider value={value}>
      {children}
    </StoreContext.Provider>
  );
}

export function useStore() {
  const context = useContext(StoreContext);
  if (!context) throw new Error("useStore must be used within a StoreProvider");
  return context;
}
