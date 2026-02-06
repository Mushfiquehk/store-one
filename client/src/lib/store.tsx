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
};

const StoreContext = createContext<StoreContextType | null>(null);

// --- Initial Data ---

const INITIAL_INV_CATS: InventoryCategory[] = [
  { id: "cat_beans", name: "Coffee Beans" },
  { id: "cat_dairy", name: "Dairy & Alt Milks" },
  { id: "cat_syrups", name: "Syrups" },
  { id: "cat_dry", name: "Dry Goods" },
  { id: "cat_bakery", name: "Bakery Stock" },
];

const INITIAL_INVENTORY: InventoryItem[] = [
  { id: "beans_house", name: "House Blend Beans", categoryId: "cat_beans", sku: "BEAN-HSE", onHand: 5000, reorderAt: 1000, unitCostCents: 2, unit: "g" },
  { id: "beans_decaf", name: "Decaf Beans", categoryId: "cat_beans", sku: "BEAN-DEC", onHand: 2000, reorderAt: 500, unitCostCents: 2, unit: "g" },
  { id: "milk_whole", name: "Whole Milk", categoryId: "cat_dairy", sku: "MILK-WHL", onHand: 8000, reorderAt: 2000, unitCostCents: 0.5, unit: "ml" },
  { id: "milk_oat", name: "Oat Milk", categoryId: "cat_dairy", sku: "MILK-OAT", onHand: 4000, reorderAt: 1000, unitCostCents: 0.8, unit: "ml" },
  { id: "milk_almond", name: "Almond Milk", categoryId: "cat_dairy", sku: "MILK-ALM", onHand: 3000, reorderAt: 1000, unitCostCents: 0.7, unit: "ml" },
  { id: "syrup_vanilla", name: "Vanilla Syrup", categoryId: "cat_syrups", sku: "SYP-VAN", onHand: 2000, reorderAt: 500, unitCostCents: 1.2, unit: "ml" },
  { id: "cup_12oz", name: "Hot Cup 12oz", categoryId: "cat_dry", sku: "CUP-12", onHand: 500, reorderAt: 100, unitCostCents: 8, unit: "each" },
  { id: "muffin_blueberry", name: "Blueberry Muffin", categoryId: "cat_bakery", sku: "MUF-BLU", onHand: 12, reorderAt: 6, unitCostCents: 120, unit: "each" },
];

const INITIAL_MENU_CATS: MenuCategory[] = [
  { id: "mc_drinks", name: "Drinks" },
  { id: "mc_food", name: "Food" },
  { id: "mc_combos", name: "Combos" },
];

const INITIAL_RECIPES: Recipe[] = [
  {
    id: "recipe_latte",
    name: "Latte 12oz",
    components: [
      { id: "comp_beans", type: "ingredient", name: "Espresso", inventoryCategoryId: "cat_beans", defaultInventoryItemId: "beans_house", qty: 18, unit: "g" },
      { id: "comp_milk", type: "ingredient", name: "Milk", inventoryCategoryId: "cat_dairy", defaultInventoryItemId: "milk_whole", qty: 250, unit: "ml" },
      { id: "comp_cup", type: "ingredient", name: "Cup", inventoryCategoryId: "cat_dry", defaultInventoryItemId: "cup_12oz", qty: 1, unit: "each" },
    ]
  },
  {
    id: "recipe_vanilla_latte",
    name: "Vanilla Latte 12oz",
    components: [
      // Re-using same logic manually for now (in a real app, recipes could inherit)
      { id: "comp_beans", type: "ingredient", name: "Espresso", inventoryCategoryId: "cat_beans", defaultInventoryItemId: "beans_house", qty: 18, unit: "g" },
      { id: "comp_milk", type: "ingredient", name: "Milk", inventoryCategoryId: "cat_dairy", defaultInventoryItemId: "milk_whole", qty: 230, unit: "ml" }, // less milk to fit syrup
      { id: "comp_syrup", type: "ingredient", name: "Flavor", inventoryCategoryId: "cat_syrups", defaultInventoryItemId: "syrup_vanilla", qty: 20, unit: "ml" },
      { id: "comp_cup", type: "ingredient", name: "Cup", inventoryCategoryId: "cat_dry", defaultInventoryItemId: "cup_12oz", qty: 1, unit: "each" },
    ]
  },
  {
    id: "recipe_coffee",
    name: "Drip Coffee 12oz",
    components: [
       { id: "comp_beans", type: "ingredient", name: "Beans", inventoryCategoryId: "cat_beans", defaultInventoryItemId: "beans_house", qty: 20, unit: "g" },
       { id: "comp_cup", type: "ingredient", name: "Cup", inventoryCategoryId: "cat_dry", defaultInventoryItemId: "cup_12oz", qty: 1, unit: "each" },
    ]
  }
];

const INITIAL_MENU: MenuItem[] = [
  { id: "item_latte", name: "Latte", priceCents: 450, categoryIds: ["mc_drinks"], taxable: true, recipeId: "recipe_latte" },
  { id: "item_vanilla_latte", name: "Vanilla Latte", priceCents: 525, categoryIds: ["mc_drinks"], taxable: true, recipeId: "recipe_vanilla_latte" },
  { id: "item_coffee", name: "House Coffee", priceCents: 350, categoryIds: ["mc_drinks"], taxable: true, recipeId: "recipe_coffee" },
  { id: "item_muffin", name: "Blueberry Muffin", priceCents: 375, categoryIds: ["mc_food"], taxable: true, recipeId: null }, // Simple item, no recipe
];

// --- Provider ---

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [inventoryCategories, setInventoryCategories] = useState<InventoryCategory[]>(INITIAL_INV_CATS);
  const [inventory, setInventory] = useState<InventoryItem[]>(INITIAL_INVENTORY);
  const [menuCategories, setMenuCategories] = useState<MenuCategory[]>(INITIAL_MENU_CATS);
  const [menu, setMenu] = useState<MenuItem[]>(INITIAL_MENU);
  const [recipes, setRecipes] = useState<Recipe[]>(INITIAL_RECIPES);
  const [sales, setSales] = useState<Sale[]>([]);

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

  const value = {
    inventoryCategories,
    inventory,
    menuCategories,
    menu,
    recipes,
    sales,
    addInventoryCategory,
    addInventoryItem,
    updateInventoryCount,
    addMenuCategory,
    addMenuItem,
    updateMenuItem,
    addRecipe,
    updateRecipe,
    addSale
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
