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
  const { menu, recipes, inventory, inventoryCategories, updateInventoryCount } = useStore();

  const [businessName, setBusinessName] = useState("Corner Store");
  const [taxRatePct, setTaxRatePct] = useState(8.25);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);

  // --- Customization Dialog State ---
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

  function recordSale() {
    if (cart.length === 0) return;

    const paymentMethod = "Cash"; // Simplified for now

    // 1. Deduct Inventory based on customizations
    cart.forEach(line => {
       line.customizations.forEach(cust => {
          // Deduct: cust.qty * line.qty from cust.inventoryItemId
          // In a real app, we'd batch this or use a transaction
          // Here we just fire individual updates
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
      paymentMethod,
    };

    setSales((prev) => [sale, ...prev]);

    toast({ title: "Sale recorded", description: `${formatMoney(totalCents)} • Inventory deducted based on customizations.` });
    clearCart();
  }

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
      <AppShell title="POS">
        <header className="relative overflow-hidden rounded-3xl border bg-card shadow-soft grain">
          <div className="p-6 sm:p-8">
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div className="min-w-0">
                <p className="text-sm font-medium text-muted-foreground" data-testid="text-tagline">
                  Storefront
                </p>
                <h2 className="mt-2 font-serif text-3xl leading-tight tracking-[-0.02em] sm:text-4xl" data-testid="text-title">
                  {businessName}&nbsp;POS
                </h2>
                <p className="mt-2 max-w-2xl text-sm text-muted-foreground" data-testid="text-subtitle">
                  Tap items. Customize recipes. Record sale.
                </p>
              </div>

              <div className="grid w-full gap-2 sm:w-auto sm:grid-cols-2">
                <Input
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  className="rounded-2xl"
                  data-testid="input-business-name"
                />
                <Input
                  value={String(taxRatePct)}
                  onChange={(e) => setTaxRatePct(Number(e.target.value))}
                  className="rounded-2xl"
                  inputMode="decimal"
                  data-testid="input-tax-rate"
                />
              </div>
            </div>

            <Separator className="my-6" />

            <div className="grid gap-6 lg:grid-cols-12">
                {/* Menu Grid */}
                <Card className="border bg-card shadow-soft lg:col-span-7">
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 font-serif" data-testid="text-pos-title">
                      <LayoutGrid className="h-5 w-5" />
                      Ring up a sale
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-xs font-medium text-muted-foreground" data-testid="text-menu-heading">
                      Menu
                    </p>
                    <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {menu.map((m) => (
                        <Button
                          key={m.id}
                          variant="secondary"
                          className="h-auto justify-start gap-2 rounded-2xl px-3 py-3 text-left hover-lift"
                          onClick={() => addToCart(m.id)}
                          data-testid={`button-add-menu-${m.id}`}
                        >
                          <div className="min-w-0 flex-1">
                            <p className="font-medium leading-tight truncate">{m.name}</p>
                            <p className="text-xs text-muted-foreground mt-1">{formatMoney(m.priceCents)}</p>
                          </div>
                        </Button>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                {/* Cart / Receipt */}
                <Card className="border bg-card shadow-soft lg:col-span-5 flex flex-col h-full">
                  <CardHeader className="pb-3 border-b bg-muted/20">
                    <CardTitle className="flex items-center gap-2 font-serif" data-testid="text-cart-title">
                      <Receipt className="h-5 w-5" />
                      Current Order
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="flex-1 flex flex-col p-0">
                    <div className="flex-1 overflow-auto p-4 min-h-[300px]">
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

                      <div className="mt-4 grid grid-cols-2 gap-2">
                        <Button className="w-full rounded-2xl" variant="outline" data-testid="button-payment-card">
                          Card
                        </Button>
                        <Button className="w-full rounded-2xl" variant="outline" data-testid="button-payment-cash">
                          Cash
                        </Button>
                      </div>

                      <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        <Button className="rounded-2xl" onClick={recordSale} data-testid="button-record-sale">
                          Record sale
                        </Button>
                        <Button
                          variant="secondary"
                          className="rounded-2xl"
                          onClick={clearCart}
                          data-testid="button-clear-sale"
                        >
                          Clear
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
            </div>
          </div>
        </header>

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

      </AppShell>
    </motion.div>
  );
}
