import React, { useState, useCallback, useEffect, useRef } from "react";
import { StoreContext } from "./store";
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

  createInvoiceWithLineItems: (invoiceData: Partial<Invoice>, lineItems: Partial<InvoiceLineItem>[]) => Promise<any>;
  createInvoiceLineItem: (data: Partial<InvoiceLineItem>) => Promise<any>;
  updateInvoiceLineItem: (id: string, data: Partial<InvoiceLineItem>) => Promise<any>;
  deleteInvoiceLineItem: (id: string) => Promise<void>;
  updateInvoice: (id: string, data: Partial<Invoice>) => Promise<any>;
  deleteInvoice: (id: string) => Promise<void>;

  toggleIntegration: (id: string) => void;
};


async function apiGet(path: string) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`GET ${path} failed`);
  return res.json();
}

async function apiPost(path: string, body: unknown) {
  const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`POST ${path} failed`);
  return res.json();
}

async function apiPut(path: string, body: unknown) {
  const res = await fetch(path, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`PUT ${path} failed`);
  return res.json();
}

async function apiDelete(path: string) {
  const res = await fetch(path, { method: "DELETE" });
  if (!res.ok) throw new Error(`DELETE ${path} failed`);
  return res.json();
}

export function AdminStoreProvider({ children }: { children: React.ReactNode }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [modifierGroups, setModifierGroups] = useState<ModifierGroup[]>([]);
  const [modifiers, setModifiers] = useState<Modifier[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [bom, setBom] = useState<BomEntry[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [invoiceLineItems, setInvoiceLineItems] = useState<InvoiceLineItem[]>([]);
  const [pmgData, setPmgData] = useState<{ links: Record<string, string[]>; sf: Record<string, ModifierScaleFactors | null> }>({ links: {}, sf: {} });
  const [isLoading, setIsLoading] = useState(true);
  const [integrations] = useState<string[]>([]);
  const mountedRef = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const [p, v, mg, m, inv, b, i, ili, pmgs] = await Promise.all([
        apiGet("/api/admin/products"),
        apiGet("/api/admin/variants"),
        apiGet("/api/admin/modifier-groups"),
        apiGet("/api/admin/modifiers"),
        apiGet("/api/admin/inventory-items"),
        apiGet("/api/admin/bom"),
        apiGet("/api/admin/invoices"),
        apiGet("/api/admin/invoice-line-items"),
        apiGet("/api/admin/product-modifier-groups"),
      ]);
      if (!mountedRef.current) return;
      setProducts(p);
      setVariants(v);
      setModifierGroups(mg);
      setModifiers(m);
      setInventory(inv);
      setBom(b);
      setInvoices(i);
      setInvoiceLineItems(ili);

      const links: Record<string, string[]> = {};
      const sf: Record<string, ModifierScaleFactors | null> = {};
      for (const r of pmgs) {
        if (!links[r.productId]) links[r.productId] = [];
        links[r.productId].push(r.modifierGroupId);
        if (r.scaleFactors) {
          sf[`${r.productId}::${r.modifierGroupId}`] = r.scaleFactors as ModifierScaleFactors;
        }
      }
      setPmgData({ links, sf });
    } catch (err) {
      console.error("Admin store refresh error:", err);
    } finally {
      if (mountedRef.current) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    refresh();
    return () => { mountedRef.current = false; };
  }, [refresh]);

  const addProduct = useCallback((data: Partial<Product>) => { apiPost("/api/admin/products", data).then(refresh); }, [refresh]);
  const addProductAsync = useCallback(async (data: Partial<Product>) => { const r = await apiPost("/api/admin/products", data); await refresh(); return r; }, [refresh]);
  const updateProduct = useCallback((id: string, data: Partial<Product>) => { apiPut(`/api/admin/products/${id}`, data).then(refresh); }, [refresh]);
  const deleteProduct = useCallback((id: string) => { apiDelete(`/api/admin/products/${id}`).then(refresh); }, [refresh]);

  const addVariant = useCallback((data: Partial<Variant>) => { apiPost("/api/admin/variants", data).then(refresh); }, [refresh]);
  const addVariantAsync = useCallback(async (data: Partial<Variant>) => { const r = await apiPost("/api/admin/variants", data); await refresh(); return r; }, [refresh]);
  const updateVariant = useCallback((id: string, data: Partial<Variant>) => { apiPut(`/api/admin/variants/${id}`, data).then(refresh); }, [refresh]);
  const deleteVariant = useCallback((id: string) => { apiDelete(`/api/admin/variants/${id}`).then(refresh); }, [refresh]);

  const addModifierGroup = useCallback((data: Partial<ModifierGroup>) => { apiPost("/api/admin/modifier-groups", data).then(refresh); }, [refresh]);
  const addModifierGroupAsync = useCallback(async (data: Partial<ModifierGroup>) => { const r = await apiPost("/api/admin/modifier-groups", data); await refresh(); return r; }, [refresh]);
  const updateModifierGroup = useCallback((id: string, data: Partial<ModifierGroup>) => { apiPut(`/api/admin/modifier-groups/${id}`, data).then(refresh); }, [refresh]);
  const deleteModifierGroup = useCallback((id: string) => { apiDelete(`/api/admin/modifier-groups/${id}`).then(refresh); }, [refresh]);

  const addModifier = useCallback((data: Partial<Modifier>) => { apiPost("/api/admin/modifiers", data).then(refresh); }, [refresh]);
  const updateModifier = useCallback((id: string, data: Partial<Modifier>) => { apiPut(`/api/admin/modifiers/${id}`, data).then(refresh); }, [refresh]);
  const deleteModifier = useCallback((id: string) => { apiDelete(`/api/admin/modifiers/${id}`).then(refresh); }, [refresh]);

  const setProductModifierGroups = useCallback((productId: string, groupIds: string[]) => {
    apiPost("/api/admin/product-modifier-groups/set", { productId, groupIds }).then(refresh);
  }, [refresh]);
  const setProductModifierGroupsAsync = useCallback(async (productId: string, groupIds: string[]) => {
    const r = await apiPost("/api/admin/product-modifier-groups/set", { productId, groupIds });
    await refresh();
    return r;
  }, [refresh]);
  const setProductModifierScaleFactors = useCallback((productId: string, groupId: string, scaleFactors: ModifierScaleFactors | null) => {
    apiPost("/api/admin/product-modifier-groups/scale-factors", { productId, modifierGroupId: groupId, scaleFactors }).then(refresh);
  }, [refresh]);
  const setProductModifierScaleFactorsAsync = useCallback(async (productId: string, groupId: string, scaleFactors: ModifierScaleFactors | null) => {
    const r = await apiPost("/api/admin/product-modifier-groups/scale-factors", { productId, modifierGroupId: groupId, scaleFactors });
    await refresh();
    return r;
  }, [refresh]);

  const addInventoryItem = useCallback((data: Partial<InventoryItem>) => { apiPost("/api/admin/inventory-items", data).then(refresh); }, [refresh]);
  const addInventoryItemAsync = useCallback(async (data: Partial<InventoryItem>) => { const r = await apiPost("/api/admin/inventory-items", data); await refresh(); return r; }, [refresh]);
  const updateInventoryItem = useCallback((id: string, data: Partial<InventoryItem>) => { apiPut(`/api/admin/inventory-items/${id}`, data).then(refresh); }, [refresh]);
  const adjustInventory = useCallback((id: string, delta: number) => { apiPost(`/api/admin/inventory-items/${id}/adjust`, { delta }).then(refresh); }, [refresh]);
  const deleteInventoryItem = useCallback((id: string) => { apiDelete(`/api/admin/inventory-items/${id}`).then(refresh); }, [refresh]);

  const addBom = useCallback((data: Partial<BomEntry>) => { apiPost("/api/admin/bom", data).then(refresh); }, [refresh]);
  const addBomAsync = useCallback(async (data: Partial<BomEntry>) => { const r = await apiPost("/api/admin/bom", data); await refresh(); return r; }, [refresh]);
  const updateBom = useCallback((id: string, data: Partial<BomEntry>) => { apiPut(`/api/admin/bom/${id}`, data).then(refresh); }, [refresh]);
  const deleteBom = useCallback((id: string) => { apiDelete(`/api/admin/bom/${id}`).then(refresh); }, [refresh]);

  const addEmployee = useCallback((_data: Partial<Employee>) => {}, []);
  const updateEmployee = useCallback((_id: string, _data: Partial<Employee>) => {}, []);
  const addTimePunch = useCallback((_data: Partial<TimePunch>) => {}, []);
  const updateTimePunch = useCallback((_id: string, _data: Partial<TimePunch>) => {}, []);
  const addSale = useCallback((_data: Partial<Sale>) => {}, []);

  const createInvoiceWithLineItems = useCallback(async (invoiceData: Partial<Invoice>, lineItems: Partial<InvoiceLineItem>[]) => {
    const r = await apiPost("/api/admin/invoices/with-line-items", { invoice: invoiceData, lineItems });
    await refresh();
    return r;
  }, [refresh]);
  const createInvoiceLineItem = useCallback(async (data: Partial<InvoiceLineItem>) => {
    const r = await apiPost("/api/admin/invoice-line-items", data);
    await refresh();
    return r;
  }, [refresh]);
  const updateInvoiceLineItem = useCallback(async (id: string, data: Partial<InvoiceLineItem>) => {
    const r = await apiPut(`/api/admin/invoice-line-items/${id}`, data);
    await refresh();
    return r;
  }, [refresh]);
  const deleteInvoiceLineItem = useCallback(async (id: string) => {
    await apiDelete(`/api/admin/invoice-line-items/${id}`);
    await refresh();
  }, [refresh]);
  const updateInvoice = useCallback(async (id: string, data: Partial<Invoice>) => {
    const r = await apiPut(`/api/admin/invoices/${id}`, data);
    await refresh();
    return r;
  }, [refresh]);
  const deleteInvoice = useCallback(async (id: string) => {
    await apiDelete(`/api/admin/invoices/${id}`);
    await refresh();
  }, [refresh]);

  const toggleIntegration = useCallback((_id: string) => {}, []);

  const value: StoreContextType = {
    products,
    variants,
    modifierGroups,
    modifiers,
    inventory,
    bom,
    employees: [],
    timePunches: [],
    sales: [],
    invoices,
    invoiceLineItems,
    integrations,
    productModifierLinks: pmgData.links,
    productModifierScaleFactors: pmgData.sf,
    isLoading,
    addProduct, addProductAsync, updateProduct, deleteProduct,
    addVariant, addVariantAsync, updateVariant, deleteVariant,
    addModifierGroup, addModifierGroupAsync, updateModifierGroup, deleteModifierGroup,
    addModifier, updateModifier, deleteModifier,
    setProductModifierGroups, setProductModifierGroupsAsync,
    setProductModifierScaleFactors, setProductModifierScaleFactorsAsync,
    addInventoryItem, addInventoryItemAsync, updateInventoryItem, adjustInventory, deleteInventoryItem,
    addBom, addBomAsync, updateBom, deleteBom,
    addEmployee, updateEmployee,
    addTimePunch, updateTimePunch,
    addSale,
    createInvoiceWithLineItems, createInvoiceLineItem, updateInvoiceLineItem, deleteInvoiceLineItem,
    updateInvoice, deleteInvoice,
    toggleIntegration,
  };

  return (
    <StoreContext.Provider value={value}>
      {children}
    </StoreContext.Provider>
  );
}
