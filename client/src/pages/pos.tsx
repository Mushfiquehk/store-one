import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { LayoutGrid, Receipt, ShoppingBag, Edit2, Check, X } from "lucide-react";
import AppShell from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useStore, type MenuItem } from "@/lib/store";

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

function formatMoney(cents: number) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

function uid(prefix: string) {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now()}`;
}

export default function PosPage() {
  const { toast } = useToast();
  const { menu, recipes, inventory, inventoryCategories, menuCategories, updateInventoryCount } = useStore();

  const [businessName, setBusinessName] = useState("Corner Store");
  const [taxRatePct, setTaxRatePct] = useState(8.25);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  
  // Menu Navigation State
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);

  // Initialize active category
  if (!activeCategoryId && menuCategories.length > 0) {
    setActiveCategoryId(menuCategories[0].id);
  }

  // Filter items by category
  const activeMenuItems = useMemo(() => {
    if (!activeCategoryId) return [];
    return menu.filter(m => m.categoryIds.includes(activeCategoryId));
  }, [menu, activeCategoryId]);
  const [editingItemInstanceId, setEditingItemInstanceId] = useState<string | null>(null);
  const [tempCustomizations, setTempCustomizations] = useState<CartItemCustomization[]>([]);

  // Derived state for editing
  const editingCartItem = useMemo(() => cart.find(c => c.instanceId === editingItemInstanceId), [cart, editingItemInstanceId]);
  const editingMenuItem = useMemo(() => editingCartItem ? menu.find(m => m.id === editingCartItem.menuItemId) : null, [editingCartItem, menu]);
  const editingRecipe = useMemo(() => editingMenuItem?.recipeId ? recipes.find(r => r.id === editingMenuItem.recipeId) : null, [editingMenuItem, recipes]);

  function addToCart(menuItemId: string) {
    const menuItem = menu.find((m) => m.id === menuItemId);
    if (!menuItem) return;

    // Initialize customizations from recipe defaults
    let initialCustomizations: CartItemCustomization[] = [];
    if (menuItem.recipeId) {
      const recipe = recipes.find(r => r.id === menuItem.recipeId);
      if (recipe) {
        initialCustomizations = recipe.components
          .filter(c => c.type === 'ingredient' && c.defaultInventoryItemId)
          .map(c => ({
            componentId: c.id,
            inventoryItemId: c.defaultInventoryItemId!,
            qty: c.qty ?? 0
          }));
      }
    }

    const newItem: CartItem = {
      instanceId: uid("line"),
      menuItemId,
      qty: 1,
      customizations: initialCustomizations
    };

    setCart((prev) => [...prev, newItem]);
  }

  function removeFromCart(instanceId: string) {
    setCart((prev) => prev.filter((item) => item.instanceId !== instanceId));
  }

  function clearCart() {
    setCart([]);
  }

  // Open the customization dialog
  function openEdit(item: CartItem) {
    setEditingItemInstanceId(item.instanceId);
    // Deep copy current customizations to temp state
    setTempCustomizations(item.customizations.map(c => ({ ...c })));
  }

  // Update a specific slot in the temp state
  function updateTempCustomization(componentId: string, field: 'inventoryItemId' | 'qty', value: string | number) {
    setTempCustomizations(prev => prev.map(c => {
      if (c.componentId !== componentId) return c;
      return { ...c, [field]: value };
    }));
  }

  // Save changes back to cart
  function saveCustomizations() {
    if (!editingItemInstanceId) return;
    setCart(prev => prev.map(item => {
      if (item.instanceId !== editingItemInstanceId) return item;
      return { ...item, customizations: tempCustomizations };
    }));
    setEditingItemInstanceId(null);
    toast({ title: "Item updated", description: "Customizations saved." });
  }

  // --- Payment Dialog State ---
  const [isPaymentOpen, setIsPaymentOpen] = useState(false);
  const [paymentType, setPaymentType] = useState<"Cash" | "Card">("Card");

  // Calculations
  const subtotalCents = cart.reduce((acc, item) => {
    const m = menu.find((x) => x.id === item.menuItemId);
    return acc + (m?.priceCents ?? 0) * item.qty;
  }, 0);

  const taxCents = cart.reduce((acc, item) => {
    const m = menu.find((x) => x.id === item.menuItemId);
    if (!m || !m.taxable) return acc;
    return acc + Math.round((m.priceCents * item.qty * taxRatePct) / 100);
  }, 0);

  const totalCents = subtotalCents + taxCents;

  function handleConfirmOrder() {
    if (cart.length === 0) {
      toast({ title: "Cart is empty", description: "Add items first." });
      return;
    }
    setIsPaymentOpen(true);
  }

  function handleRecordSale() {
    // 1. Deduct Inventory based on customizations
    cart.forEach(line => {
       line.customizations.forEach(cust => {
          updateInventoryCount(cust.inventoryItemId, -(cust.qty * line.qty));
       });
    });

    const sale: Sale = {
      id: uid("sale"),
      createdAt: Date.now(),
      lines: [...cart],
      subtotalCents,
      taxCents,
      totalCents,
      paymentMethod: paymentType,
    };

    setSales((prev) => [sale, ...prev]);

    toast({ title: "Sale recorded", description: `${formatMoney(totalCents)} • ${paymentType}` });
    clearCart();
    setIsPaymentOpen(false);
  }

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
      <AppShell title="POS">
        <div className="grid gap-6 lg:grid-cols-12 h-[calc(100vh-140px)] pb-6">
                {/* Menu Grid */}
                <Card className="border bg-card shadow-soft lg:col-span-7 flex flex-col overflow-hidden h-full">
                  <CardHeader className="pb-3 flex-shrink-0 pt-4 px-4">
                    <CardTitle className="flex items-center gap-2 font-serif" data-testid="text-pos-title">
                      <LayoutGrid className="h-5 w-5" />
                      Ring up a sale
                    </CardTitle>
                  </CardHeader>
                  
                  {/* Category Navigation */}
                  <div className="px-6 pb-2">
                    <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide" data-testid="nav-menu-categories">
                      {menuCategories.map(cat => (
                        <Button
                          key={cat.id}
                          variant={activeCategoryId === cat.id ? "default" : "secondary"}
                          onClick={() => setActiveCategoryId(cat.id)}
                          className="rounded-full flex-shrink-0"
                          size="sm"
                          data-testid={`tab-category-${cat.id}`}
                        >
                          {cat.name}
                        </Button>
                      ))}
                    </div>
                  </div>

                  <CardContent className="flex-1 overflow-y-auto p-4 bg-muted/10">
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-3 pb-20">
                      {activeMenuItems.length > 0 ? (
                        activeMenuItems.map((m) => (
                          <Button
                            key={m.id}
                            variant="secondary"
                            className="h-auto flex-col items-start gap-2 rounded-2xl p-4 text-left hover-lift transition-all bg-secondary/50 hover:bg-secondary"
                            onClick={() => addToCart(m.id)}
                            data-testid={`button-add-menu-${m.id}`}
                          >
                            <div className="w-full">
                              <p className="font-semibold leading-tight line-clamp-2 text-base">{m.name}</p>
                              {m.description && (
                                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{m.description}</p>
                              )}
                              <p className="text-sm font-medium text-primary mt-2">{formatMoney(m.priceCents)}</p>
                            </div>
                          </Button>
                        ))
                      ) : (
                        <div className="col-span-full py-10 text-center text-muted-foreground">
                          <p>No items in this category.</p>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>

                {/* Cart / Receipt */}
                <Card className="border bg-card shadow-soft lg:col-span-5 flex flex-col h-full overflow-hidden">
                  <CardHeader className="pb-3 border-b bg-muted/20 pt-4 px-4">
                    <CardTitle className="flex items-center gap-2 font-serif" data-testid="text-cart-title">
                      <Receipt className="h-5 w-5" />
                      Current Order
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="flex-1 flex flex-col p-0">
                    <div className="flex-1 overflow-auto p-4">
                      {cart.length > 0 ? (
                        <ul className="space-y-3">
                          {cart.map((item) => {
                            const m = menu.find((x) => x.id === item.menuItemId);
                            const hasRecipe = !!m?.recipeId;
                            return (
                              <li key={item.instanceId} className="flex flex-col gap-1 rounded-xl border bg-background p-3" data-testid={`cart-item-${item.instanceId}`}>
                                <div className="flex items-start justify-between">
                                  <div>
                                    <p className="font-medium">{m?.name}</p>
                                    <p className="text-xs text-muted-foreground">{formatMoney(m?.priceCents ?? 0)}</p>
                                  </div>
                                  <div className="flex items-center gap-2">
                                     {hasRecipe && (
                                       <Button size="sm" variant="outline" className="h-7 px-2 rounded-lg text-xs" onClick={() => openEdit(item)}>
                                          <Edit2 className="h-3 w-3 mr-1" /> Edit
                                       </Button>
                                     )}
                                     <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" onClick={() => removeFromCart(item.instanceId)}>
                                       <X className="h-4 w-4" />
                                     </Button>
                                  </div>
                                </div>
                                {hasRecipe && item.customizations.length > 0 && (
                                  <div className="mt-1 pl-2 border-l-2 border-primary/20">
                                     {item.customizations.map(c => {
                                        // We need to look up the slot name from the recipe
                                        const recipe = recipes.find(r => r.id === m?.recipeId);
                                        const comp = recipe?.components.find(comp => comp.id === c.componentId);
                                        const invItem = inventory.find(i => i.id === c.inventoryItemId);
                                        
                                        return (
                                          <p key={c.componentId} className="text-[10px] text-muted-foreground">
                                            {comp?.name}: {invItem?.name ?? "Unknown"} ({c.qty} {comp?.unit})
                                          </p>
                                        );
                                     })}
                                  </div>
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      ) : (
                        <div className="flex h-full flex-col items-center justify-center text-muted-foreground">
                          <ShoppingBag className="h-8 w-8 opacity-20" />
                          <p className="mt-2 text-sm">Cart is empty</p>
                        </div>
                      )}
                    </div>

                    <div className="border-t bg-muted/20 p-6">
                      <div className="space-y-1.5 text-sm">
                        <div className="flex justify-between text-muted-foreground">
                          <span>Subtotal</span>
                          <span>{formatMoney(subtotalCents)}</span>
                        </div>
                        <div className="flex justify-between text-muted-foreground">
                          <span>Tax ({taxRatePct}%)</span>
                          <span>{formatMoney(taxCents)}</span>
                        </div>
                        <div className="flex justify-between text-lg font-medium text-foreground">
                          <span>Total</span>
                          <span>{formatMoney(totalCents)}</span>
                        </div>
                      </div>

                      <div className="mt-4">
                        <Button className="w-full rounded-2xl h-12 text-lg" onClick={handleConfirmOrder} data-testid="button-confirm-order">
                          Checkout {formatMoney(totalCents)}
                        </Button>
                        <Button
                          variant="ghost"
                          className="w-full mt-2 rounded-xl text-muted-foreground hover:text-destructive"
                          onClick={clearCart}
                          data-testid="button-clear-sale"
                        >
                          Clear Order
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
            </div>

        {/* Customization Dialog */}
        <Dialog open={!!editingItemInstanceId} onOpenChange={(open) => !open && setEditingItemInstanceId(null)}>
           <DialogContent>
             <DialogHeader>
               <DialogTitle>Customize {editingMenuItem?.name}</DialogTitle>
             </DialogHeader>
             
             <div className="py-4 space-y-4 max-h-[60vh] overflow-y-auto">
               {editingRecipe && editingRecipe.components.length > 0 ? (
                 editingRecipe.components.map(comp => {
                    const cust = tempCustomizations.find(c => c.componentId === comp.id);
                    if (!cust) return null;

                    // Filter inventory for this category
                    const options = inventory.filter(i => i.categoryId === comp.inventoryCategoryId);
                    
                    return (
                      <div key={comp.id} className="grid gap-2 border rounded-xl p-3">
                        <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{comp.name}</Label>
                        
                        <div className="grid grid-cols-[2fr_1fr] gap-2">
                           <div>
                              <Select 
                                value={cust.inventoryItemId} 
                                onValueChange={(val) => updateTempCustomization(comp.id, 'inventoryItemId', val)}
                              >
                                <SelectTrigger className="h-9">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {options.map(opt => (
                                    <SelectItem key={opt.id} value={opt.id}>
                                      {opt.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                           </div>
                           <div className="relative">
                              <Input 
                                type="number" 
                                className="h-9 pr-8"
                                value={cust.qty}
                                onChange={(e) => updateTempCustomization(comp.id, 'qty', Number(e.target.value))}
                              />
                              <span className="absolute right-2 top-2.5 text-xs text-muted-foreground pointer-events-none">
                                {comp.unit}
                              </span>
                           </div>
                        </div>
                      </div>
                    );
                 })
               ) : (
                 <p className="text-center text-muted-foreground">No customizable components.</p>
               )}
             </div>

             <DialogFooter>
               <Button variant="secondary" onClick={() => setEditingItemInstanceId(null)}>Cancel</Button>
               <Button onClick={saveCustomizations}>Save Changes</Button>
             </DialogFooter>
           </DialogContent>
        </Dialog>

        {/* Payment Popup */}
        <Dialog open={isPaymentOpen} onOpenChange={setIsPaymentOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Confirm Payment</DialogTitle>
            </DialogHeader>
            
            <div className="py-6 flex flex-col gap-6">
              <div className="text-center">
                <p className="text-sm text-muted-foreground uppercase tracking-wider">Total Due</p>
                <p className="text-4xl font-serif mt-1">{formatMoney(totalCents)}</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Button 
                  variant={paymentType === "Card" ? "default" : "outline"} 
                  className="h-16 rounded-2xl flex flex-col gap-1"
                  onClick={() => setPaymentType("Card")}
                >
                  <span className="font-semibold text-lg">Card</span>
                </Button>
                <Button 
                  variant={paymentType === "Cash" ? "default" : "outline"} 
                  className="h-16 rounded-2xl flex flex-col gap-1"
                  onClick={() => setPaymentType("Cash")}
                >
                  <span className="font-semibold text-lg">Cash</span>
                </Button>
              </div>

              <div className="rounded-xl bg-muted/30 p-4 border border-border/50 text-sm">
                <div className="flex justify-between mb-1">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span>{formatMoney(subtotalCents)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Tax ({taxRatePct}%)</span>
                  <span>{formatMoney(taxCents)}</span>
                </div>
              </div>
            </div>

            <DialogFooter>
              <div className="w-full grid gap-2">
                <Button size="lg" className="w-full rounded-2xl h-12 text-lg" onClick={handleRecordSale}>
                  Complete Payment
                </Button>
                <Button variant="ghost" onClick={() => setIsPaymentOpen(false)}>
                  Back
                </Button>
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>

      </AppShell>
    </motion.div>
  );
}
