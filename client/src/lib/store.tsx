import React, { createContext, useContext, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";
import { toast } from "@/hooks/use-toast";

export type Product = {
  id: string;
  name: string;
  type: string;
  isComposite: boolean;
  attributes: string | null;
  createdAt: string | null;
};

export type Variant = {
  id: string;
  productId: string;
  sku: string | null;
  name: string;
  basePrice: number;
  directInventoryId: string | null;
  config: string | null;
};

export type ModifierGroup = {
  id: string;
  name: string;
  minSelections: number;
  maxSelections: number;
  selectionRules: string | null;
};

export type Modifier = {
  id: string;
  modifierGroupId: string;
  name: string;
  baseUpcharge: number;
  scaleFactor: string | null;
  pricingLogic: string | null;
  inventoryItemId: string | null;
  quantityPerUse: number | null;
};

export type InventoryItem = {
  id: string;
  name: string;
  unitOfMeasure: string;
  currentQuantity: number;
  trackingConfig: string | null;
};

export type BomEntry = {
  id: string;
  sourceType: string;
  sourceId: string;
  inventoryItemId: string;
  quantityDeducted: number;
  scaleFactorMatrix: string | null;
  overrideModifierGroupId: string | null;
};

export type Employee = {
  id: string;
  name: string;
  role: string;
  payRate: number;
  pin: string;
};

export type TimePunch = {
  id: string;
  employeeId: string;
  timeIn: number;
  timeOut: number | null;
};

export type Sale = {
  id: string;
  createdAt: number;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  paymentMethod: string;
  status: string;
  linesJson: string;
};

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
  productModifierScaleFactors: Record<string, string | null>;
  isLoading: boolean;

  addProduct: (data: Partial<Product>) => void;
  updateProduct: (id: string, data: Partial<Product>) => void;
  deleteProduct: (id: string) => void;

  addVariant: (data: Partial<Variant>) => void;
  updateVariant: (id: string, data: Partial<Variant>) => void;
  deleteVariant: (id: string) => void;

  addModifierGroup: (data: Partial<ModifierGroup>) => void;
  updateModifierGroup: (id: string, data: Partial<ModifierGroup>) => void;
  deleteModifierGroup: (id: string) => void;

  addModifier: (data: Partial<Modifier>) => void;
  updateModifier: (id: string, data: Partial<Modifier>) => void;
  deleteModifier: (id: string) => void;

  setProductModifierGroups: (productId: string, groupIds: string[]) => void;
  setProductModifierScaleFactors: (productId: string, groupId: string, scaleFactors: string | null) => void;

  addInventoryItem: (data: Partial<InventoryItem>) => void;
  updateInventoryItem: (id: string, data: Partial<InventoryItem>) => void;
  adjustInventory: (id: string, delta: number) => void;
  deleteInventoryItem: (id: string) => void;

  addBom: (data: Partial<BomEntry>) => void;
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
  const qc = useQueryClient();
  const [integrations, setIntegrations] = useState<string[]>([]);

  const { data: products = [], isLoading: loadingProducts } = useQuery({ queryKey: ["products"], queryFn: api.products.list });
  const { data: variants = [], isLoading: loadingVariants } = useQuery({ queryKey: ["variants"], queryFn: () => api.variants.list() });
  const { data: modifierGroups = [] } = useQuery({ queryKey: ["modifierGroups"], queryFn: api.modifierGroups.list });
  const { data: modifiersList = [] } = useQuery({ queryKey: ["modifiers"], queryFn: () => api.modifiers.list() });
  const { data: inventory = [], isLoading: loadingInventory } = useQuery({ queryKey: ["inventory"], queryFn: api.inventory.list });
  const { data: bom = [] } = useQuery({ queryKey: ["bom"], queryFn: () => api.bom.list() });
  const { data: employees = [] } = useQuery({ queryKey: ["employees"], queryFn: api.employees.list });
  const { data: timePunches = [] } = useQuery({ queryKey: ["timePunches"], queryFn: () => api.timePunches.list() });
  const { data: sales = [] } = useQuery({ queryKey: ["sales"], queryFn: api.sales.list });

  const { data: productModifierLinksData = {} } = useQuery({ queryKey: ["productModifierLinks"], queryFn: api.productModifierGroups.listAll });
  const [localProductModifierLinks, setLocalProductModifierLinks] = useState<Record<string, string[]>>({});
  const productModifierLinks = { ...productModifierLinksData, ...localProductModifierLinks };

  const { data: productModifierScaleFactorsData = {} } = useQuery({ queryKey: ["productModifierScaleFactors"], queryFn: api.productModifierGroups.listAllScaleFactors });
  const [localScaleFactors, setLocalScaleFactors] = useState<Record<string, string | null>>({});
  const productModifierScaleFactors = { ...productModifierScaleFactorsData, ...localScaleFactors };

  const isLoading = loadingProducts || loadingVariants || loadingInventory;

  const inv = (keys: string[][]) => keys.forEach(k => qc.invalidateQueries({ queryKey: k }));

  const addProductMut = useMutation({ mutationFn: api.products.create, onSuccess: () => inv([["products"]]) });
  const updateProductMut = useMutation({ mutationFn: ({ id, data }: { id: string; data: any }) => api.products.update(id, data), onSuccess: () => inv([["products"]]) });
  const deleteProductMut = useMutation({ mutationFn: api.products.delete, onSuccess: () => inv([["products"], ["variants"]]) });

  const addVariantMut = useMutation({ mutationFn: api.variants.create, onSuccess: () => inv([["variants"]]) });
  const updateVariantMut = useMutation({ mutationFn: ({ id, data }: { id: string; data: any }) => api.variants.update(id, data), onSuccess: () => inv([["variants"]]) });
  const deleteVariantMut = useMutation({ mutationFn: api.variants.delete, onSuccess: () => inv([["variants"]]) });

  const addModGroupMut = useMutation({ mutationFn: api.modifierGroups.create, onSuccess: () => inv([["modifierGroups"]]) });
  const updateModGroupMut = useMutation({ mutationFn: ({ id, data }: { id: string; data: any }) => api.modifierGroups.update(id, data), onSuccess: () => inv([["modifierGroups"]]) });
  const deleteModGroupMut = useMutation({ mutationFn: api.modifierGroups.delete, onSuccess: () => inv([["modifierGroups"]]) });

  const addModMut = useMutation({ mutationFn: api.modifiers.create, onSuccess: () => inv([["modifiers"]]) });
  const updateModMut = useMutation({ mutationFn: ({ id, data }: { id: string; data: any }) => api.modifiers.update(id, data), onSuccess: () => inv([["modifiers"]]) });
  const deleteModMut = useMutation({ mutationFn: api.modifiers.delete, onSuccess: () => inv([["modifiers"]]) });

  const setProductModGroupsMut = useMutation({
    mutationFn: ({ productId, groupIds }: { productId: string; groupIds: string[] }) =>
      api.productModifierGroups.set(productId, groupIds),
    onSuccess: (_data, variables) => {
      setLocalProductModifierLinks(prev => ({ ...prev, [variables.productId]: variables.groupIds }));
      inv([["productModifierLinks"]]);
    },
  });

  const setScaleFactorsMut = useMutation({
    mutationFn: ({ productId, groupId, scaleFactors }: { productId: string; groupId: string; scaleFactors: string | null }) =>
      api.productModifierGroups.setScaleFactors(productId, groupId, scaleFactors),
    onSuccess: (_data, variables) => {
      const key = `${variables.productId}::${variables.groupId}`;
      setLocalScaleFactors(prev => ({ ...prev, [key]: variables.scaleFactors }));
      inv([["productModifierScaleFactors"]]);
    },
  });

  const addInvMut = useMutation({ mutationFn: api.inventory.create, onSuccess: () => inv([["inventory"]]) });
  const updateInvMut = useMutation({ mutationFn: ({ id, data }: { id: string; data: any }) => api.inventory.update(id, data), onSuccess: () => inv([["inventory"]]) });
  const adjustInvMut = useMutation({ mutationFn: ({ id, delta }: { id: string; delta: number }) => api.inventory.adjust(id, delta), onSuccess: () => inv([["inventory"]]) });
  const deleteInvMut = useMutation({ mutationFn: api.inventory.delete, onSuccess: () => inv([["inventory"], ["bom"], ["variants"], ["modifiers"]]) });

  const addBomMut = useMutation({ mutationFn: api.bom.create, onSuccess: () => inv([["bom"]]) });
  const updateBomMut = useMutation({ mutationFn: ({ id, data }: { id: string; data: any }) => api.bom.update(id, data), onSuccess: () => inv([["bom"]]) });
  const deleteBomMut = useMutation({ mutationFn: api.bom.delete, onSuccess: () => inv([["bom"]]) });

  const addEmpMut = useMutation({ mutationFn: api.employees.create, onSuccess: () => inv([["employees"]]) });
  const updateEmpMut = useMutation({ mutationFn: ({ id, data }: { id: string; data: any }) => api.employees.update(id, data), onSuccess: () => inv([["employees"]]) });

  const addTPMut = useMutation({ mutationFn: api.timePunches.create, onSuccess: () => inv([["timePunches"]]) });
  const updateTPMut = useMutation({ mutationFn: ({ id, data }: { id: string; data: any }) => api.timePunches.update(id, data), onSuccess: () => inv([["timePunches"]]) });

  const addSaleMut = useMutation({ mutationFn: api.sales.create, onSuccess: () => inv([["sales"]]) });

  const value: StoreContextType = {
    products,
    variants,
    modifierGroups,
    modifiers: modifiersList,
    inventory,
    bom,
    employees,
    timePunches,
    sales,
    integrations,
    productModifierLinks,
    productModifierScaleFactors,
    isLoading,

    addProduct: (data) => addProductMut.mutate(data),
    updateProduct: (id, data) => updateProductMut.mutate({ id, data }),
    deleteProduct: (id) => deleteProductMut.mutate(id),

    addVariant: (data) => addVariantMut.mutate(data),
    updateVariant: (id, data) => updateVariantMut.mutate({ id, data }),
    deleteVariant: (id) => deleteVariantMut.mutate(id),

    addModifierGroup: (data) => addModGroupMut.mutate(data),
    updateModifierGroup: (id, data) => updateModGroupMut.mutate({ id, data }),
    deleteModifierGroup: (id) => deleteModGroupMut.mutate(id),

    addModifier: (data) => addModMut.mutate(data),
    updateModifier: (id, data) => updateModMut.mutate({ id, data }),
    deleteModifier: (id) => deleteModMut.mutate(id),

    setProductModifierGroups: (productId, groupIds) => setProductModGroupsMut.mutate({ productId, groupIds }),
    setProductModifierScaleFactors: (productId, groupId, scaleFactors) => setScaleFactorsMut.mutate({ productId, groupId, scaleFactors }),

    addInventoryItem: (data) => addInvMut.mutate(data),
    updateInventoryItem: (id, data) => updateInvMut.mutate({ id, data }),
    adjustInventory: (id, delta) => adjustInvMut.mutate({ id, delta }),
    deleteInventoryItem: (id) => deleteInvMut.mutate(id),

    addBom: (data) => addBomMut.mutate(data),
    updateBom: (id, data) => updateBomMut.mutate({ id, data }),
    deleteBom: (id) => deleteBomMut.mutate(id),

    addEmployee: (data) => addEmpMut.mutate(data),
    updateEmployee: (id, data) => updateEmpMut.mutate({ id, data }),

    addTimePunch: (data) => addTPMut.mutate(data),
    updateTimePunch: (id, data) => updateTPMut.mutate({ id, data }),

    addSale: (data) => addSaleMut.mutate(data),

    toggleIntegration: (id) => {
      setIntegrations(prev => {
        if (prev.includes(id)) return prev.filter(i => i !== id);
        toast({ title: "Integration Connected", description: "Successfully linked to provider." });
        return [...prev, id];
      });
    },
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
