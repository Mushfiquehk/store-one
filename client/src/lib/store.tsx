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
  ModifierScaleFactors,
} from "./db";

export type { Product, Variant, ModifierGroup, Modifier, InventoryItem, BomEntry, Employee, TimePunch, Sale, ModifierScaleFactors };

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

  toggleIntegration: (id: string) => void;
};

const StoreContext = createContext<StoreContextType | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [integrations, setIntegrations] = useState<string[]>([]);

  const [dbReady, setDbReady] = useState(false);

  const products = useLiveQuery(() => db.products.toArray(), []) as Product[] | undefined;
  const variants = useLiveQuery(() => db.variants.toArray(), []) as Variant[] | undefined;
  const modifierGroupsList = useLiveQuery(() => db.modifierGroups.toArray(), []) as ModifierGroup[] | undefined;
  const modifiersList = useLiveQuery(() => db.modifiers.toArray(), []) as Modifier[] | undefined;
  const inventory = useLiveQuery(() => db.inventoryItems.toArray(), []) as InventoryItem[] | undefined;
  const bom = useLiveQuery(() => db.billOfMaterials.toArray(), []) as BomEntry[] | undefined;
  const employees = useLiveQuery(() => db.employees.toArray(), []) as Employee[] | undefined;
  const timePunches = useLiveQuery(() => db.timePunches.toArray(), []) as TimePunch[] | undefined;
  const sales = useLiveQuery(() => db.sales.toArray(), []) as Sale[] | undefined;

  const productModifierLinksRaw = useLiveQuery(async () => {
    const rows = await db.productModifierGroups.toArray();
    const map: Record<string, string[]> = {};
    for (const r of rows) {
      if (!map[r.productId]) map[r.productId] = [];
      map[r.productId].push(r.modifierGroupId);
    }
    return map;
  }, []) as Record<string, string[]> | undefined;

  const productModifierScaleFactorsRaw = useLiveQuery(async () => {
    const rows = await db.productModifierGroups.toArray();
    const map: Record<string, ModifierScaleFactors | null> = {};
    for (const r of rows) {
      if (r.scaleFactors) {
        map[`${r.productId}::${r.modifierGroupId}`] = r.scaleFactors;
      }
    }
    return map;
  }, []) as Record<string, ModifierScaleFactors | null> | undefined;

  const productModifierLinks = productModifierLinksRaw ?? {};
  const productModifierScaleFactors = productModifierScaleFactorsRaw ?? {};

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
