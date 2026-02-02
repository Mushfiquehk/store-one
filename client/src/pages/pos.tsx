import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { LayoutGrid, Receipt, ShoppingBag } from "lucide-react";
import AppShell from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";

export type MenuItem = {
  id: string;
  name: string;
  priceCents: number;
  category: string;
  taxable: boolean;
  recipeId?: string | null;
};

export type SaleLine = {
  menuItemId: string;
  qty: number;
};

export type Sale = {
  id: string;
  createdAt: number;
  lines: SaleLine[];
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

function clampInt(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

function sumBy<T>(arr: T[], fn: (t: T) => number) {
  return arr.reduce((acc, item) => acc + fn(item), 0);
}

export default function PosPage() {
  const { toast } = useToast();

  const [businessName, setBusinessName] = useState("Corner Store");
  const [taxRatePct, setTaxRatePct] = useState(8.25);

  const [menu, setMenu] = useState<MenuItem[]>([
    {
      id: "coffee",
      name: "House Coffee",
      priceCents: 350,
      category: "Drinks",
      taxable: true,
      recipeId: "recipe_coffee",
    },
    {
      id: "latte",
      name: "Vanilla Latte",
      priceCents: 575,
      category: "Drinks",
      taxable: true,
      recipeId: "recipe_latte",
    },
    {
      id: "muffin",
      name: "Blueberry Muffin",
      priceCents: 425,
      category: "Bakery",
      taxable: true,
      recipeId: "recipe_muffin",
    },
  ]);

  const [inventory, setInventory] = useState<Record<string, number>>({
    beans_g: 2500,
    milk_ml: 6000,
    cup_12oz: 250,
    muffin_each: 24,
  });

  const recipesById = useMemo(
    () =>
      new Map<string, { id: string; name: string; ingredients: Array<{ invId: string; qty: number }> }>([
        [
          "recipe_coffee",
          {
            id: "recipe_coffee",
            name: "Coffee (12oz)",
            ingredients: [
              { invId: "beans_g", qty: 18 },
              { invId: "cup_12oz", qty: 1 },
            ],
          },
        ],
        [
          "recipe_latte",
          {
            id: "recipe_latte",
            name: "Vanilla Latte (12oz)",
            ingredients: [
              { invId: "beans_g", qty: 18 },
              { invId: "milk_ml", qty: 220 },
              { invId: "cup_12oz", qty: 1 },
            ],
          },
        ],
        [
          "recipe_muffin",
          {
            id: "recipe_muffin",
            name: "Muffin",
            ingredients: [{ invId: "muffin_each", qty: 1 }],
          },
        ],
      ]),
    [],
  );

  const [cartLines, setCartLines] = useState<SaleLine[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<Sale["paymentMethod"]>("Card");
  const [sales, setSales] = useState<Sale[]>([]);

  const menuById = useMemo(() => {
    const map = new Map<string, MenuItem>();
    for (const item of menu) map.set(item.id, item);
    return map;
  }, [menu]);

  const cartDetailed = useMemo(() => {
    return cartLines
      .map((l) => {
        const item = menuById.get(l.menuItemId);
        if (!item) return null;
        return {
          ...l,
          item,
          lineTotalCents: item.priceCents * l.qty,
        };
      })
      .filter(Boolean) as Array<{ item: MenuItem; qty: number; lineTotalCents: number }>;
  }, [cartLines, menuById]);

  const subtotalCents = useMemo(() => sumBy(cartDetailed, (l) => l.lineTotalCents), [cartDetailed]);

  const taxCents = useMemo(() => {
    const taxableSubtotal = sumBy(cartDetailed, (l) => (l.item.taxable ? l.lineTotalCents : 0));
    return Math.round((taxableSubtotal * taxRatePct) / 100);
  }, [cartDetailed, taxRatePct]);

  const totalCents = subtotalCents + taxCents;

  const recipeWarnings = useMemo(() => {
    const warnings: Array<{ menuItemId: string; reason: string }> = [];

    for (const line of cartLines) {
      const menuItem = menuById.get(line.menuItemId);
      if (!menuItem) continue;
      if (!menuItem.recipeId) {
        warnings.push({ menuItemId: menuItem.id, reason: "No recipe assigned" });
        continue;
      }

      const recipe = recipesById.get(menuItem.recipeId);
      if (!recipe) {
        warnings.push({ menuItemId: menuItem.id, reason: "Recipe missing" });
        continue;
      }

      for (const ing of recipe.ingredients) {
        const available = inventory[ing.invId] ?? 0;
        const needed = ing.qty * line.qty;
        if (available < needed) {
          warnings.push({
            menuItemId: menuItem.id,
            reason: `Not enough ${ing.invId} (${available} available, need ${needed})`,
          });
        }
      }
    }

    return warnings;
  }, [cartLines, inventory, menuById, recipesById]);

  function addToCart(id: string) {
    setCartLines((prev) => {
      const existing = prev.find((l) => l.menuItemId === id);
      if (existing) {
        return prev.map((l) => (l.menuItemId === id ? { ...l, qty: clampInt(l.qty + 1, 1, 999) } : l));
      }
      return [...prev, { menuItemId: id, qty: 1 }];
    });
  }

  function setQty(id: string, qty: number) {
    setCartLines((prev) => {
      if (qty <= 0) return prev.filter((l) => l.menuItemId !== id);
      return prev.map((l) => (l.menuItemId === id ? { ...l, qty: clampInt(qty, 1, 999) } : l));
    });
  }

  function clearCart() {
    setCartLines([]);
  }

  function recordSale() {
    if (!cartLines.length) {
      toast({ title: "Add at least one item", description: "Tap a menu item to add it to the sale." });
      return;
    }

    if (recipeWarnings.length) {
      toast({
        title: "Fix recipe / inventory first",
        description: "One or more cart items can’t be fulfilled based on recipes and on-hand counts.",
      });
      return;
    }

    setInventory((prev) => {
      const next = { ...prev };

      for (const line of cartLines) {
        const menuItem = menuById.get(line.menuItemId);
        if (!menuItem?.recipeId) continue;
        const recipe = recipesById.get(menuItem.recipeId);
        if (!recipe) continue;

        for (const ing of recipe.ingredients) {
          next[ing.invId] = Math.max(0, (next[ing.invId] ?? 0) - ing.qty * line.qty);
        }
      }

      return next;
    });

    const createdAt = Date.now();
    const sale: Sale = {
      id: uid("sale"),
      createdAt,
      lines: cartLines,
      subtotalCents,
      taxCents,
      totalCents,
      paymentMethod,
    };

    setSales((prev) => [sale, ...prev]);

    toast({ title: "Sale recorded", description: `${formatMoney(totalCents)} • ${paymentMethod} (inventory deducted)` });

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
                  {businessName}\u00A0POS
                </h2>
                <p className="mt-2 max-w-2xl text-sm text-muted-foreground" data-testid="text-subtitle">
                  Tap to add items. When you record a sale, inventory is deducted using each item’s recipe.
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
                          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 text-primary">
                            <ShoppingBag className="h-4 w-4" />
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium" data-testid={`text-menu-name-${m.id}`}>
                              {m.name}
                            </span>
                            <span className="block text-xs text-muted-foreground" data-testid={`text-menu-price-${m.id}`}>
                              {formatMoney(m.priceCents)} • {m.category}
                            </span>
                          </span>
                        </Button>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                <Card className="border bg-card shadow-soft lg:col-span-5">
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 font-serif" data-testid="text-cart-title">
                      <Receipt className="h-5 w-5" />
                      Current sale
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="rounded-2xl border bg-background/50 p-3">
                      {cartDetailed.length ? (
                        <div className="space-y-3">
                          {cartDetailed.map((l) => (
                            <div key={l.item.id} className="flex items-center justify-between gap-3">
                              <div className="min-w-0">
                                <p className="truncate text-sm font-medium" data-testid={`text-cart-item-${l.item.id}`}>
                                  {l.item.name}
                                </p>
                                <p
                                  className="text-xs text-muted-foreground"
                                  data-testid={`text-cart-item-meta-${l.item.id}`}
                                >
                                  {formatMoney(l.item.priceCents)} each
                                </p>
                              </div>
                              <div className="flex items-center gap-2">
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  className="h-8 w-8 rounded-xl p-0"
                                  onClick={() => setQty(l.item.id, l.qty - 1)}
                                  data-testid={`button-qty-dec-${l.item.id}`}
                                >
                                  –
                                </Button>
                                <Input
                                  value={String(l.qty)}
                                  onChange={(e) => setQty(l.item.id, Number(e.target.value))}
                                  className="h-8 w-14 rounded-xl text-center"
                                  inputMode="numeric"
                                  data-testid={`input-qty-${l.item.id}`}
                                />
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  className="h-8 w-8 rounded-xl p-0"
                                  onClick={() => setQty(l.item.id, l.qty + 1)}
                                  data-testid={`button-qty-inc-${l.item.id}`}
                                >
                                  +
                                </Button>
                              </div>
                            </div>
                          ))}

                          {recipeWarnings.length ? (
                            <div
                              className="rounded-2xl border border-destructive/30 bg-destructive/5 p-3"
                              data-testid="status-recipe-warnings"
                            >
                              <p className="text-sm font-medium text-destructive" data-testid="text-recipe-warning-title">
                                Can’t record this sale yet
                              </p>
                              <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                                {recipeWarnings.slice(0, 4).map((w, idx) => (
                                  <li key={`${w.menuItemId}-${idx}`} data-testid={`text-warning-${idx}`}>
                                    {w.menuItemId}: {w.reason}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          ) : null}

                          <Separator />

                          <div className="space-y-1 text-sm">
                            <div className="flex items-center justify-between" data-testid="row-subtotal">
                              <span className="text-muted-foreground">Subtotal</span>
                              <span className="font-medium" data-testid="text-subtotal">
                                {formatMoney(subtotalCents)}
                              </span>
                            </div>
                            <div className="flex items-center justify-between" data-testid="row-tax">
                              <span className="text-muted-foreground">Tax</span>
                              <span className="font-medium" data-testid="text-tax">
                                {formatMoney(taxCents)}
                              </span>
                            </div>
                            <div className="flex items-center justify-between" data-testid="row-total">
                              <span className="font-medium">Total</span>
                              <span className="font-serif text-lg" data-testid="text-total">
                                {formatMoney(totalCents)}
                              </span>
                            </div>
                          </div>

                          <div className="mt-3 grid gap-2 sm:grid-cols-2">
                            <Button
                              variant={paymentMethod === "Card" ? "default" : "secondary"}
                              className="rounded-2xl"
                              onClick={() => setPaymentMethod("Card")}
                              data-testid="button-payment-card"
                            >
                              Card
                            </Button>
                            <Button
                              variant={paymentMethod === "Cash" ? "default" : "secondary"}
                              className="rounded-2xl"
                              onClick={() => setPaymentMethod("Cash")}
                              data-testid="button-payment-cash"
                            >
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
                      ) : (
                        <div className="rounded-xl bg-card p-4 text-sm text-muted-foreground" data-testid="empty-cart">
                          Tap menu items to add them.
                        </div>
                      )}
                    </div>

                    <p className="mt-3 text-xs text-muted-foreground" data-testid="text-sale-note">
                      Prototype: data resets on refresh.
                    </p>

                    <p className="mt-2 text-xs text-muted-foreground" data-testid="text-sales-count">
                      Sales logged: {sales.length}
                    </p>
                  </CardContent>
                </Card>
            </div>
          </div>
        </header>
      </AppShell>
    </motion.div>
  );
}
