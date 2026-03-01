import React, { createContext, useContext, useState, useEffect } from "react";
import { toast } from "@/hooks/use-toast";

// --- Types ---

export type InventoryCategory = {
  id: string;
  name: string;
};

export type InventoryItem = {
  id: string;
  name: string;
  categoryId: string; // Links to InventoryCategory
  sku: string;
  onHand: number;
  reorderAt: number;
  unitCostCents: number;
  unit: string;
};

export type MenuCategory = {
  id: string;
  name: string;
};

export type MenuItem = {
  id: string;
  name: string;
  description?: string;
  priceCents: number;
  categoryIds: string[]; // Can belong to multiple menu categories
  taxable: boolean;
  recipeId?: string | null;
};

export type RecipeComponentType = "ingredient" | "subrecipe";

export type RecipeComponent = {
  id: string;
  type: RecipeComponentType;
  name: string; // Label for the slot, e.g. "Milk Choice"
  
  // For 'ingredient' type
  inventoryCategoryId?: string; // The pool of options
  defaultInventoryItemId?: string; // The default selection
  qty?: number;
  unit?: string;

  // For 'subrecipe' type
  menuItemId?: string; // The sub-item
};

export type Recipe = {
  id: string;
  name: string;
  components: RecipeComponent[];
};

export type CartItemCustomization = {
  componentId: string;
  inventoryItemId: string;
  qty: number;
};

export type CartItem = {
  instanceId: string;
  menuItemId: string;
  qty: number;
  customizations: CartItemCustomization[];
};

export type Sale = {
  id: string;
  createdAt: number;
  lines: CartItem[];
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  paymentMethod: "Cash" | "Card";
  status: "in-progress" | "completed";
};

export type Employee = {
  id: string;
  name: string;
  role: "manager" | "staff";
  payRate: number; // hourly rate in cents
  pin: string;
};

export type TimePunch = {
  id: string;
  employeeId: string;
  timeIn: number;
  timeOut?: number;
};

// --- Store Context ---

type StoreContextType = {
  // Data
  inventoryCategories: InventoryCategory[];
  inventory: InventoryItem[];
  menuCategories: MenuCategory[];
  menu: MenuItem[];
  recipes: Recipe[];
  sales: Sale[];
  integrations: string[];
  employees: Employee[];
  timePunches: TimePunch[];
  
  // Actions
  addInventoryCategory: (name: string) => void;
  addInventoryItem: (item: InventoryItem) => void;
  updateInventoryCount: (id: string, delta: number) => void;
  
  addMenuCategory: (name: string) => void;
  addMenuItem: (item: MenuItem) => void;
  updateMenuItem: (id: string, updates: Partial<MenuItem>) => void;
  
  addRecipe: (recipe: Recipe) => void;
  updateRecipe: (id: string, updates: Partial<Recipe>) => void;

  addSale: (sale: Sale) => void;
  toggleIntegration: (id: string) => void;
  
  addEmployee: (employee: Employee) => void;
  updateEmployee: (id: string, updates: Partial<Employee>) => void;
  addTimePunch: (punch: TimePunch) => void;
  updateTimePunch: (id: string, updates: Partial<TimePunch>) => void;
};

const StoreContext = createContext<StoreContextType | null>(null);

// --- Initial Data ---

const INITIAL_EMPLOYEES: Employee[] = [
  { id: "emp_1", name: "Manager", role: "manager", payRate: 2500, pin: "1234" },
  { id: "emp_2", name: "Barista", role: "staff", payRate: 1500, pin: "0000" },
];

const INITIAL_TIME_PUNCHES: TimePunch[] = [
  // Mock data for reports
  { id: "tp_1", employeeId: "emp_1", timeIn: Date.now() - 86400000 * 2, timeOut: Date.now() - 86400000 * 2 + 28800000 },
  { id: "tp_2", employeeId: "emp_2", timeIn: Date.now() - 86400000, timeOut: Date.now() - 86400000 + 18000000 },
];

const INITIAL_INV_CATS: InventoryCategory[] = [
  { id: "cat_fuel", name: "Fuel Bases" },
  { id: "cat_additives", name: "Additives" },
  { id: "cat_lubricants", name: "Lubricants" },
  { id: "cat_shop", name: "Convenience Items" },
];

const INITIAL_INVENTORY: InventoryItem[] = [
  // Fuel
  { id: "fuel_petrol_base", name: "Unleaded Base", categoryId: "cat_fuel", sku: "FL-PET-B", onHand: 50000, reorderAt: 10000, unitCostCents: 110, unit: "L" },
  { id: "fuel_diesel_base", name: "Diesel Base", categoryId: "cat_fuel", sku: "FL-DSL-B", onHand: 40000, reorderAt: 8000, unitCostCents: 120, unit: "L" },
  { id: "fuel_octane_booster", name: "Octane Booster", categoryId: "cat_additives", sku: "AD-OCT", onHand: 5000, reorderAt: 1000, unitCostCents: 50, unit: "L" },
  
  // Shop
  { id: "oil_synthetic", name: "Full Synthetic Oil", categoryId: "cat_lubricants", sku: "LB-SYN", onHand: 100, reorderAt: 20, unitCostCents: 1500, unit: "bottle" },
  { id: "water_bottle", name: "Spring Water 500ml", categoryId: "cat_shop", sku: "SH-WTR", onHand: 200, reorderAt: 50, unitCostCents: 40, unit: "each" },
];

const INITIAL_MENU_CATS: MenuCategory[] = [
  { id: "mc_petrol", name: "Petrol" },
  { id: "mc_diesel", name: "Diesel" },
  { id: "mc_premium", name: "Premium Fuels" },
  { id: "mc_shop", name: "Shop" },
];

const INITIAL_RECIPES: Recipe[] = [
  {
    id: "recipe_91",
    name: "Regular 91 Petrol",
    components: [
      { id: "comp_petrol", type: "ingredient", name: "Petrol Base", inventoryCategoryId: "cat_fuel", defaultInventoryItemId: "fuel_petrol_base", qty: 1, unit: "L" },
    ]
  },
  {
    id: "recipe_95",
    name: "Premium 95 Petrol",
    components: [
      { id: "comp_petrol", type: "ingredient", name: "Petrol Base", inventoryCategoryId: "cat_fuel", defaultInventoryItemId: "fuel_petrol_base", qty: 0.95, unit: "L" },
      { id: "comp_octane", type: "ingredient", name: "Octane Additive", inventoryCategoryId: "cat_additives", defaultInventoryItemId: "fuel_octane_booster", qty: 0.05, unit: "L" },
    ]
  },
  {
    id: "recipe_diesel",
    name: "Standard Diesel",
    components: [
      { id: "comp_diesel", type: "ingredient", name: "Diesel Base", inventoryCategoryId: "cat_fuel", defaultInventoryItemId: "fuel_diesel_base", qty: 1, unit: "L" },
    ]
  }
];

const INITIAL_MENU: MenuItem[] = [
  { id: "item_91", name: "Regular 91", priceCents: 185, categoryIds: ["mc_petrol"], taxable: true, recipeId: "recipe_91" },
  { id: "item_95", name: "Premium 95", priceCents: 205, categoryIds: ["mc_petrol", "mc_premium"], taxable: true, recipeId: "recipe_95" },
  { id: "item_98", name: "Ultimate 98", priceCents: 225, categoryIds: ["mc_petrol", "mc_premium"], taxable: true, recipeId: null },
  { id: "item_diesel", name: "Diesel", priceCents: 195, categoryIds: ["mc_diesel"], taxable: true, recipeId: "recipe_diesel" },
  { id: "item_water", name: "Bottled Water", priceCents: 250, categoryIds: ["mc_shop"], taxable: true, recipeId: null },
];

// --- Provider ---

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [inventoryCategories, setInventoryCategories] = useState<InventoryCategory[]>(INITIAL_INV_CATS);
  const [inventory, setInventory] = useState<InventoryItem[]>(INITIAL_INVENTORY);
  const [menuCategories, setMenuCategories] = useState<MenuCategory[]>(INITIAL_MENU_CATS);
  const [menu, setMenu] = useState<MenuItem[]>(INITIAL_MENU);
  const [recipes, setRecipes] = useState<Recipe[]>(INITIAL_RECIPES);
  const [sales, setSales] = useState<Sale[]>([]);
  const [integrations, setIntegrations] = useState<string[]>([]);
  const [employees, setEmployees] = useState<Employee[]>(INITIAL_EMPLOYEES);
  const [timePunches, setTimePunches] = useState<TimePunch[]>(INITIAL_TIME_PUNCHES);

  // Actions
  const addInventoryCategory = (name: string) => {
    const id = `cat_${Date.now()}`;
    setInventoryCategories(prev => [...prev, { id, name }]);
  };

  const addInventoryItem = (item: InventoryItem) => {
    setInventory(prev => [item, ...prev]);
  };

  const updateInventoryCount = (id: string, delta: number) => {
    setInventory(prev => prev.map(i => i.id === id ? { ...i, onHand: Math.max(0, i.onHand + delta) } : i));
  };

  const addMenuCategory = (name: string) => {
    const id = `mc_${Date.now()}`;
    setMenuCategories(prev => [...prev, { id, name }]);
  };

  const addMenuItem = (item: MenuItem) => {
    setMenu(prev => [item, ...prev]);
  };

  const updateMenuItem = (id: string, updates: Partial<MenuItem>) => {
    setMenu(prev => prev.map(m => m.id === id ? { ...m, ...updates } : m));
  };

  const addRecipe = (recipe: Recipe) => {
    setRecipes(prev => [recipe, ...prev]);
  };

  const updateRecipe = (id: string, updates: Partial<Recipe>) => {
    setRecipes(prev => prev.map(r => r.id === id ? { ...r, ...updates } : r));
  };

  const addSale = (sale: Sale) => {
    setSales(prev => [sale, ...prev]);
  };

  const toggleIntegration = (id: string) => {
    setIntegrations(prev => {
      if (prev.includes(id)) {
        return prev.filter(i => i !== id);
      } else {
        toast({ title: "Integration Connected", description: "Successfully linked to provider." });
        return [...prev, id];
      }
    });
  };

  const addEmployee = (employee: Employee) => {
    setEmployees(prev => [...prev, employee]);
  };

  const updateEmployee = (id: string, updates: Partial<Employee>) => {
    setEmployees(prev => prev.map(e => e.id === id ? { ...e, ...updates } : e));
  };

  const addTimePunch = (punch: TimePunch) => {
    setTimePunches(prev => [...prev, punch]);
  };

  const updateTimePunch = (id: string, updates: Partial<TimePunch>) => {
    setTimePunches(prev => prev.map(tp => tp.id === id ? { ...tp, ...updates } : tp));
  };

  const value = {
    inventoryCategories,
    inventory,
    menuCategories,
    menu,
    recipes,
    sales,
    integrations,
    employees,
    timePunches,
    addInventoryCategory,
    addInventoryItem,
    updateInventoryCount,
    addMenuCategory,
    addMenuItem,
    updateMenuItem,
    addRecipe,
    updateRecipe,
    addSale,
    toggleIntegration,
    addEmployee,
    updateEmployee,
    addTimePunch,
    updateTimePunch
  };

  return (
    <StoreContext.Provider value={value}>
      {children}
    </StoreContext.Provider>
  );
}

export function useStore() {
  const context = useContext(StoreContext);
  if (!context) {
    throw new Error("useStore must be used within a StoreProvider");
  }
  return context;
}
