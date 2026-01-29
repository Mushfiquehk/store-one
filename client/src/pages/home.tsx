import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  BarChart3,
  ClipboardList,
  FileDown,
  LayoutGrid,
  Package,
  Receipt,
  ShoppingBag,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";

type MenuItem = {
  id: string;
  name: string;
  priceCents: number;
  category: string;
  taxable: boolean;
};

type InventoryItem = {
  id: string;
  name: string;
  sku: string;
  onHand: number;
  reorderAt: number;
  unitCostCents: number;
};

type SaleLine = {
  menuItemId: string;
  qty: number;
};

type Sale = {
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

export default function Home() {
  // Deprecated: this page was split into dedicated routes.
  // Keeping this file temporarily to avoid breaking imports during iteration.
  const { toast } = useToast();

  const [businessName, setBusinessName] = useState("Corner Store");
  const [taxRatePct, setTaxRatePct] = useState(8.25);

  const [menu, setMenu] = useState<MenuItem[]>([
    { id: "coffee", name: "House Coffee", priceCents: 350, category: "Drinks", taxable: true },
    { id: "latte", name: "Vanilla Latte", priceCents: 575, category: "Drinks", taxable: true },
    { id: "muffin", name: "Blueberry Muffin", priceCents: 425, category: "Bakery", taxable: true },
    { id: "bagel", name: "Bagel + Cream Cheese", priceCents: 495, category: "Bakery", taxable: true },
    { id: "sandwich", name: "Turkey Sandwich", priceCents: 995, category: "Lunch", taxable: true },
  ]);

  const [inventory, setInventory] = useState<InventoryItem[]>([
    { id: "beans", name: "Coffee Beans (5lb)", sku: "BEANS-5LB", onHand: 6, reorderAt: 3, unitCostCents: 4200 },
    { id: "cups12", name: "Paper Cups 12oz", sku: "CUPS-12OZ", onHand: 420, reorderAt: 200, unitCostCents: 9 },
    { id: "milk", name: "Whole Milk (gallon)", sku: "MILK-1GAL", onHand: 10, reorderAt: 4, unitCostCents: 415 },
    { id: "muffins", name: "Muffins (case)", sku: "MUFF-CASE", onHand: 2, reorderAt: 2, unitCostCents: 2200 },
  ]);

  const [cartLines, setCartLines] = useState<SaleLine[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<Sale["paymentMethod"]>("Card");
  const [sales, setSales] = useState<Sale[]>([]);

  const [menuDraftName, setMenuDraftName] = useState("");
  const [menuDraftCategory, setMenuDraftCategory] = useState("General");
  const [menuDraftPrice, setMenuDraftPrice] = useState("");
  const [menuDraftTaxable, setMenuDraftTaxable] = useState(true);

  const [invDraftName, setInvDraftName] = useState("");
  const [invDraftSku, setInvDraftSku] = useState("");
  const [invDraftOnHand, setInvDraftOnHand] = useState("0");
  const [invDraftReorderAt, setInvDraftReorderAt] = useState("0");
  const [invDraftUnitCost, setInvDraftUnitCost] = useState("");

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

  const lowStockCount = useMemo(() => {
    return inventory.filter((i) => i.onHand <= i.reorderAt).length;
  }, [inventory]);

  const todaysSales = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return sales.filter((s) => s.createdAt >= start.getTime());
  }, [sales]);

  const todayTotalCents = useMemo(() => sumBy(todaysSales, (s) => s.totalCents), [todaysSales]);

  const reports = useMemo(() => {
    const totalSalesCents = sumBy(sales, (s) => s.totalCents);
    const totalTaxCents = sumBy(sales, (s) => s.taxCents);

    const itemCounts = new Map<string, number>();
    for (const s of sales) {
      for (const line of s.lines) {
        itemCounts.set(line.menuItemId, (itemCounts.get(line.menuItemId) ?? 0) + line.qty);
      }
    }

    const topItems = Array.from(itemCounts.entries())
      .map(([id, qty]) => ({ id, qty, name: menuById.get(id)?.name ?? id }))
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 5);

    const lowStock = inventory
      .filter((i) => i.onHand <= i.reorderAt)
      .map((i) => ({ name: i.name, onHand: i.onHand, reorderAt: i.reorderAt }));

    return {
      kpis: {
        salesCount: sales.length,
        totalSalesCents,
        totalTaxCents,
        avgTicketCents: sales.length ? Math.round(totalSalesCents / sales.length) : 0,
      },
      topItems,
      lowStock,
    };
  }, [inventory, menuById, sales]);

  const exportText = useMemo(() => {
    const now = new Date();

    const payload = {
      app: "CornerPOS (prototype)",
      generatedAt: now.toISOString(),
      business: {
        name: businessName,
        taxRatePct,
      },
      menu: menu.map((m) => ({
        id: m.id,
        name: m.name,
        category: m.category,
        price: formatMoney(m.priceCents),
        taxable: m.taxable,
      })),
      inventory: inventory.map((i) => ({
        id: i.id,
        name: i.name,
        sku: i.sku,
        onHand: i.onHand,
        reorderAt: i.reorderAt,
        unitCost: formatMoney(i.unitCostCents),
      })),
      reports: {
        kpis: {
          salesCount: reports.kpis.salesCount,
          totalSales: formatMoney(reports.kpis.totalSalesCents),
          totalTax: formatMoney(reports.kpis.totalTaxCents),
          avgTicket: formatMoney(reports.kpis.avgTicketCents),
        },
        topItems: reports.topItems,
        lowStock: reports.lowStock,
      },
      prompt: {
        instruction:
          "You are a retail operations assistant. Based on the menu, inventory, and sales KPIs, suggest 5 improvements for pricing, menu layout, and reorder quantities. Keep it practical for a single-location mom-and-pop shop.",
      },
    };

    return [
      `# CornerPOS Export`,
      `Generated: ${payload.generatedAt}`,
      `Business: ${payload.business.name}`,
      "",
      "## Recommended LLM Prompt",
      payload.prompt.instruction,
      "",
      "## Data (JSON)",
      JSON.stringify(payload, null, 2),
      "",
    ].join("\n");
  }, [businessName, inventory, menu, reports, taxRatePct]);

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

    toast({
      title: "Sale recorded",
      description: `${formatMoney(totalCents)} • ${paymentMethod}`,
    });

    clearCart();
  }

  function addMenuItem() {
    const name = menuDraftName.trim();
    if (!name) {
      toast({ title: "Name is required", description: "Enter a menu item name." });
      return;
    }

    const price = Number(menuDraftPrice);
    if (!Number.isFinite(price) || price <= 0) {
      toast({ title: "Price is required", description: "Enter a valid price (e.g., 4.50)." });
      return;
    }

    const item: MenuItem = {
      id: uid("menu"),
      name,
      category: menuDraftCategory.trim() || "General",
      priceCents: Math.round(price * 100),
      taxable: menuDraftTaxable,
    };

    setMenu((prev) => [item, ...prev]);
    setMenuDraftName("");
    setMenuDraftPrice("");
    toast({ title: "Menu updated", description: `Added “${name}”.` });
  }

  function addInventoryItem() {
    const name = invDraftName.trim();
    const sku = invDraftSku.trim();

    if (!name || !sku) {
      toast({ title: "Name + SKU required", description: "Enter a name and a SKU." });
      return;
    }

    const onHand = Number(invDraftOnHand);
    const reorderAt = Number(invDraftReorderAt);
    const unitCost = Number(invDraftUnitCost);

    if (!Number.isFinite(onHand) || !Number.isFinite(reorderAt) || onHand < 0 || reorderAt < 0) {
      toast({ title: "Counts must be valid", description: "Use whole numbers for on-hand and reorder level." });
      return;
    }

    if (!Number.isFinite(unitCost) || unitCost < 0) {
      toast({ title: "Unit cost must be valid", description: "Enter a valid cost (e.g., 0.09 or 4.15)." });
      return;
    }

    const item: InventoryItem = {
      id: uid("inv"),
      name,
      sku,
      onHand: Math.trunc(onHand),
      reorderAt: Math.trunc(reorderAt),
      unitCostCents: Math.round(unitCost * 100),
    };

    setInventory((prev) => [item, ...prev]);

    setInvDraftName("");
    setInvDraftSku("");
    setInvDraftOnHand("0");
    setInvDraftReorderAt("0");
    setInvDraftUnitCost("");

    toast({ title: "Inventory updated", description: `Added “${name}”.` });
  }

  function adjustOnHand(id: string, delta: number) {
    setInventory((prev) => prev.map((i) => (i.id === id ? { ...i, onHand: Math.max(0, i.onHand + delta) } : i)));
  }

  async function copyExport() {
    try {
      await navigator.clipboard.writeText(exportText);
      toast({ title: "Copied", description: "Export text copied to clipboard." });
    } catch {
      toast({
        title: "Copy failed",
        description: "Your browser blocked clipboard access. You can still select & copy manually.",
      });
    }
  }

  function downloadExport() {
    const blob = new Blob([exportText], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${businessName.replaceAll(/\s+/g, "-").toLowerCase()}-cornerpos-export.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

    toast({ title: "Downloaded", description: "Export file saved." });
  }

  const shell = (
    <div className="min-h-screen app-shell">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <header className="relative overflow-hidden rounded-3xl border bg-card shadow-soft grain">
          <div className="absolute inset-0 -z-10 opacity-80" />
          <div className="p-6 sm:p-8">
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div className="min-w-0">
                <p className="text-sm font-medium text-muted-foreground" data-testid="text-tagline">
                  Storefront + Back Office
                </p>
                <h1
                  className="mt-2 font-serif text-3xl leading-tight tracking-[-0.02em] sm:text-4xl"
                  data-testid="text-title"
                >
                  {businessName}
                </h1>
                <p className="mt-2 max-w-2xl text-sm text-muted-foreground" data-testid="text-subtitle">
                  Ring up a sale, keep your menu tidy, track inventory, and pull quick reports — built for single-location
                  shops.
                </p>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <div className="w-full sm:w-[240px]">
                  <Label htmlFor="biz" className="text-xs text-muted-foreground">
                    Business name
                  </Label>
                  <Input
                    id="biz"
                    value={businessName}
                    onChange={(e) => setBusinessName(e.target.value)}
                    className="mt-1"
                    data-testid="input-business-name"
                  />
                </div>

                <div className="w-full sm:w-[160px]">
                  <Label htmlFor="tax" className="text-xs text-muted-foreground">
                    Tax rate (%)
                  </Label>
                  <Input
                    id="tax"
                    value={String(taxRatePct)}
                    onChange={(e) => setTaxRatePct(Number(e.target.value))}
                    className="mt-1"
                    inputMode="decimal"
                    data-testid="input-tax-rate"
                  />
                </div>
              </div>
            </div>

            <Separator className="my-6" />

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <KpiCard
                icon={<Receipt className="h-4 w-4" />}
                label="Today"
                value={formatMoney(todayTotalCents)}
                meta={`${todaysSales.length} sales`}
                testid="kpi-today-sales"
              />
              <KpiCard
                icon={<ShoppingBag className="h-4 w-4" />}
                label="Menu items"
                value={`${menu.length}`}
                meta="Tap to add to cart"
                testid="kpi-menu-count"
              />
              <KpiCard
                icon={<Package className="h-4 w-4" />}
                label="Low stock"
                value={`${lowStockCount}`}
                meta="At or below reorder level"
                testid="kpi-low-stock"
                tone={lowStockCount ? "warn" : "ok"}
              />
              <KpiCard
                icon={<BarChart3 className="h-4 w-4" />}
                label="Avg ticket"
                value={formatMoney(reports.kpis.avgTicketCents)}
                meta="All-time"
                testid="kpi-avg-ticket"
              />
            </div>
          </div>
        </header>

        <div className="mt-8 grid gap-6 lg:grid-cols-12">
          <div className="lg:col-span-7">
            <Card className="border bg-card shadow-soft">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 font-serif" data-testid="text-pos-title">
                  <LayoutGrid className="h-5 w-5" />
                  Record a sale
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
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
                  </div>

                  <div>
                    <p className="text-xs font-medium text-muted-foreground" data-testid="text-cart-heading">
                      Current sale
                    </p>
                    <div className="mt-3 rounded-2xl border bg-background/50 p-3">
                      {cartDetailed.length ? (
                        <div className="space-y-3">
                          {cartDetailed.map((l) => (
                            <div key={l.item.id} className="flex items-center justify-between gap-3">
                              <div className="min-w-0">
                                <p className="truncate text-sm font-medium" data-testid={`text-cart-item-${l.item.id}`}>
                                  {l.item.name}
                                </p>
                                <p className="text-xs text-muted-foreground" data-testid={`text-cart-item-meta-${l.item.id}`}>
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
                          Tap items on the left to add them.
                        </div>
                      )}
                    </div>

                    <p className="mt-3 text-xs text-muted-foreground" data-testid="text-sale-note">
                      This is a prototype: sales are kept in memory and reset on refresh.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="lg:col-span-5">
            <Tabs defaultValue="menu" className="w-full" data-testid="tabs-back-office">
              <TabsList className="grid w-full grid-cols-3 rounded-2xl" data-testid="tabslist-back-office">
                <TabsTrigger value="menu" data-testid="tab-menu">
                  Menu
                </TabsTrigger>
                <TabsTrigger value="inventory" data-testid="tab-inventory">
                  Inventory
                </TabsTrigger>
                <TabsTrigger value="reports" data-testid="tab-reports">
                  Reports
                </TabsTrigger>
              </TabsList>

              <TabsContent value="menu" className="mt-4">
                <Card className="border bg-card shadow-soft">
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 font-serif" data-testid="text-menu-admin-title">
                      <ClipboardList className="h-5 w-5" />
                      Configure menu
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-3">
                      <div className="grid gap-2 sm:grid-cols-2">
                        <div>
                          <Label className="text-xs text-muted-foreground" htmlFor="menuName">
                            Name
                          </Label>
                          <Input
                            id="menuName"
                            value={menuDraftName}
                            onChange={(e) => setMenuDraftName(e.target.value)}
                            className="mt-1"
                            placeholder="e.g., Lemonade"
                            data-testid="input-menu-name"
                          />
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground" htmlFor="menuCategory">
                            Category
                          </Label>
                          <Input
                            id="menuCategory"
                            value={menuDraftCategory}
                            onChange={(e) => setMenuDraftCategory(e.target.value)}
                            className="mt-1"
                            placeholder="e.g., Drinks"
                            data-testid="input-menu-category"
                          />
                        </div>
                      </div>

                      <div className="grid gap-2 sm:grid-cols-2">
                        <div>
                          <Label className="text-xs text-muted-foreground" htmlFor="menuPrice">
                            Price (USD)
                          </Label>
                          <Input
                            id="menuPrice"
                            value={menuDraftPrice}
                            onChange={(e) => setMenuDraftPrice(e.target.value)}
                            className="mt-1"
                            inputMode="decimal"
                            placeholder="e.g., 4.50"
                            data-testid="input-menu-price"
                          />
                        </div>
                        <div className="flex items-end justify-between gap-3 rounded-2xl border bg-background/50 px-3 py-2">
                          <div>
                            <p className="text-xs font-medium" data-testid="text-taxable-label">
                              Taxable
                            </p>
                            <p className="text-xs text-muted-foreground" data-testid="text-taxable-hint">
                              Include in tax calculation
                            </p>
                          </div>
                          <Button
                            variant={menuDraftTaxable ? "default" : "secondary"}
                            className="rounded-xl"
                            onClick={() => setMenuDraftTaxable((v) => !v)}
                            data-testid="button-toggle-taxable"
                          >
                            {menuDraftTaxable ? "Yes" : "No"}
                          </Button>
                        </div>
                      </div>

                      <Button className="rounded-2xl" onClick={addMenuItem} data-testid="button-add-menu-item">
                        Add menu item
                      </Button>

                      <Separator />

                      <div className="max-h-[260px] overflow-auto rounded-2xl border bg-background/40">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="w-[48%]">Item</TableHead>
                              <TableHead>Category</TableHead>
                              <TableHead className="text-right">Price</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {menu.map((m) => (
                              <TableRow key={m.id} data-testid={`row-menu-${m.id}`}>
                                <TableCell className="font-medium" data-testid={`text-menu-row-name-${m.id}`}>
                                  {m.name}
                                </TableCell>
                                <TableCell className="text-muted-foreground" data-testid={`text-menu-row-category-${m.id}`}>
                                  {m.category}
                                </TableCell>
                                <TableCell className="text-right" data-testid={`text-menu-row-price-${m.id}`}>
                                  {formatMoney(m.priceCents)}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="inventory" className="mt-4">
                <Card className="border bg-card shadow-soft">
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 font-serif" data-testid="text-inventory-title">
                      <Package className="h-5 w-5" />
                      Inventory
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-3">
                      <div className="grid gap-2 sm:grid-cols-2">
                        <div>
                          <Label className="text-xs text-muted-foreground" htmlFor="invName">
                            Item name
                          </Label>
                          <Input
                            id="invName"
                            value={invDraftName}
                            onChange={(e) => setInvDraftName(e.target.value)}
                            className="mt-1"
                            placeholder="e.g., Paper Towels"
                            data-testid="input-inventory-name"
                          />
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground" htmlFor="invSku">
                            SKU
                          </Label>
                          <Input
                            id="invSku"
                            value={invDraftSku}
                            onChange={(e) => setInvDraftSku(e.target.value)}
                            className="mt-1"
                            placeholder="e.g., TOWEL-ROLL"
                            data-testid="input-inventory-sku"
                          />
                        </div>
                      </div>

                      <div className="grid gap-2 sm:grid-cols-3">
                        <div>
                          <Label className="text-xs text-muted-foreground" htmlFor="invOnHand">
                            On hand
                          </Label>
                          <Input
                            id="invOnHand"
                            value={invDraftOnHand}
                            onChange={(e) => setInvDraftOnHand(e.target.value)}
                            className="mt-1"
                            inputMode="numeric"
                            data-testid="input-inventory-onhand"
                          />
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground" htmlFor="invReorder">
                            Reorder at
                          </Label>
                          <Input
                            id="invReorder"
                            value={invDraftReorderAt}
                            onChange={(e) => setInvDraftReorderAt(e.target.value)}
                            className="mt-1"
                            inputMode="numeric"
                            data-testid="input-inventory-reorderat"
                          />
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground" htmlFor="invCost">
                            Unit cost (USD)
                          </Label>
                          <Input
                            id="invCost"
                            value={invDraftUnitCost}
                            onChange={(e) => setInvDraftUnitCost(e.target.value)}
                            className="mt-1"
                            inputMode="decimal"
                            placeholder="e.g., 0.09"
                            data-testid="input-inventory-unitcost"
                          />
                        </div>
                      </div>

                      <Button className="rounded-2xl" onClick={addInventoryItem} data-testid="button-add-inventory-item">
                        Add inventory item
                      </Button>

                      <Separator />

                      <div className="max-h-[320px] overflow-auto rounded-2xl border bg-background/40">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Item</TableHead>
                              <TableHead className="w-[120px] text-center">On hand</TableHead>
                              <TableHead className="w-[180px] text-center">Adjust</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {inventory.map((i) => {
                              const isLow = i.onHand <= i.reorderAt;
                              return (
                                <TableRow key={i.id} data-testid={`row-inventory-${i.id}`}>
                                  <TableCell>
                                    <div className="flex items-start justify-between gap-3">
                                      <div className="min-w-0">
                                        <p className="truncate font-medium" data-testid={`text-inventory-name-${i.id}`}>
                                          {i.name}
                                        </p>
                                        <p className="text-xs text-muted-foreground" data-testid={`text-inventory-sku-${i.id}`}>
                                          {i.sku} • Reorder at {i.reorderAt}
                                        </p>
                                      </div>
                                      <span
                                        className={`rounded-full px-2 py-1 text-xs font-medium ${
                                          isLow ? "bg-destructive/10 text-destructive" : "bg-accent/10 text-accent"
                                        }`}
                                        data-testid={`status-inventory-level-${i.id}`}
                                      >
                                        {isLow ? "Low" : "OK"}
                                      </span>
                                    </div>
                                  </TableCell>
                                  <TableCell className="text-center">
                                    <span className="font-serif text-lg" data-testid={`text-inventory-onhand-${i.id}`}>
                                      {i.onHand}
                                    </span>
                                  </TableCell>
                                  <TableCell>
                                    <div className="flex items-center justify-center gap-2">
                                      <Button
                                        variant="secondary"
                                        size="sm"
                                        className="h-8 rounded-xl"
                                        onClick={() => adjustOnHand(i.id, -1)}
                                        data-testid={`button-inventory-dec-${i.id}`}
                                      >
                                        -1
                                      </Button>
                                      <Button
                                        variant="secondary"
                                        size="sm"
                                        className="h-8 rounded-xl"
                                        onClick={() => adjustOnHand(i.id, 1)}
                                        data-testid={`button-inventory-inc-${i.id}`}
                                      >
                                        +1
                                      </Button>
                                      <Button
                                        size="sm"
                                        className="h-8 rounded-xl"
                                        onClick={() => adjustOnHand(i.id, 10)}
                                        data-testid={`button-inventory-plus10-${i.id}`}
                                      >
                                        +10
                                      </Button>
                                    </div>
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="reports" className="mt-4">
                <Card className="border bg-card shadow-soft">
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 font-serif" data-testid="text-reports-title">
                      <BarChart3 className="h-5 w-5" />
                      Reports
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-3">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <MiniCard
                          label="All-time sales"
                          value={formatMoney(reports.kpis.totalSalesCents)}
                          testid="report-alltime-sales"
                        />
                        <MiniCard label="All-time tax" value={formatMoney(reports.kpis.totalTaxCents)} testid="report-alltime-tax" />
                        <MiniCard label="Sales count" value={`${reports.kpis.salesCount}`} testid="report-sales-count" />
                        <MiniCard label="Avg ticket" value={formatMoney(reports.kpis.avgTicketCents)} testid="report-avg-ticket" />
                      </div>

                      <Separator />

                      <div className="grid gap-4">
                        <div>
                          <p className="text-xs font-medium text-muted-foreground" data-testid="text-top-items-heading">
                            Top items
                          </p>
                          <div className="mt-2 rounded-2xl border bg-background/40 p-3">
                            {reports.topItems.length ? (
                              <ul className="space-y-2">
                                {reports.topItems.map((t) => (
                                  <li
                                    key={t.id}
                                    className="flex items-center justify-between text-sm"
                                    data-testid={`row-topitem-${t.id}`}
                                  >
                                    <span className="text-muted-foreground">{t.name}</span>
                                    <span className="font-medium" data-testid={`text-topitem-qty-${t.id}`}>
                                      {t.qty}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <p className="text-sm text-muted-foreground" data-testid="empty-top-items">
                                Record a few sales to see your best sellers.
                              </p>
                            )}
                          </div>
                        </div>

                        <div>
                          <p className="text-xs font-medium text-muted-foreground" data-testid="text-low-stock-heading">
                            Low stock
                          </p>
                          <div className="mt-2 rounded-2xl border bg-background/40 p-3">
                            {reports.lowStock.length ? (
                              <ul className="space-y-2">
                                {reports.lowStock.map((i) => (
                                  <li
                                    key={i.name}
                                    className="flex items-center justify-between text-sm"
                                    data-testid={`row-lowstock-${i.name}`}
                                  >
                                    <span className="text-muted-foreground">{i.name}</span>
                                    <span className="font-medium" data-testid={`text-lowstock-meta-${i.name}`}>
                                      {i.onHand} (reorder {i.reorderAt})
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <p className="text-sm text-muted-foreground" data-testid="empty-low-stock">
                                Looking good — nothing is at reorder level.
                              </p>
                            )}
                          </div>
                        </div>
                      </div>

                      <Separator />

                      <div>
                        <p className="text-xs font-medium text-muted-foreground" data-testid="text-export-heading">
                          Export for an LLM
                        </p>
                        <p className="mt-1 text-sm text-muted-foreground" data-testid="text-export-subheading">
                          Copy or download one text file containing your menu, inventory, and reports + a suggested prompt.
                        </p>

                        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                          <Button
                            variant="secondary"
                            className="rounded-2xl"
                            onClick={copyExport}
                            data-testid="button-copy-export"
                          >
                            <FileDown className="mr-2 h-4 w-4" />
                            Copy export
                          </Button>
                          <Button className="rounded-2xl" onClick={downloadExport} data-testid="button-download-export">
                            <FileDown className="mr-2 h-4 w-4" />
                            Download .txt
                          </Button>
                        </div>

                        <div className="mt-3">
                          <Label className="text-xs text-muted-foreground" htmlFor="export">
                            Preview
                          </Label>
                          <Textarea
                            id="export"
                            value={exportText}
                            readOnly
                            className="mt-1 h-[220px] rounded-2xl font-mono text-xs"
                            data-testid="textarea-export-preview"
                          />
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        </div>

        <footer className="mt-10 pb-4 text-center text-xs text-muted-foreground" data-testid="text-footer">
          Prototype UI for mom-and-pop shops • Single location • No login • No backend yet
        </footer>
      </div>
    </div>
  );

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
      {shell}
    </motion.div>
  );
}

function KpiCard({
  icon,
  label,
  value,
  meta,
  testid,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  meta: string;
  testid: string;
  tone?: "ok" | "warn";
}) {
  return (
    <div
      className={"group relative overflow-hidden rounded-2xl border bg-background/60 p-4 shadow-sm backdrop-blur hover-lift"}
      data-testid={testid}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 text-primary">
            {icon}
          </span>
          <span className="text-xs font-medium text-muted-foreground">{label}</span>
        </div>
        <span
          className={
            tone === "warn"
              ? "rounded-full bg-destructive/10 px-2 py-1 text-[11px] font-medium text-destructive"
              : tone === "ok"
                ? "rounded-full bg-accent/10 px-2 py-1 text-[11px] font-medium text-accent"
                : ""
          }
          data-testid={`${testid}-tone`}
        >
          {tone === "warn" ? "Attention" : tone === "ok" ? "OK" : ""}
        </span>
      </div>
      <div className="mt-3">
        <p className="font-serif text-2xl" data-testid={`${testid}-value`}>
          {value}
        </p>
        <p className="mt-1 text-xs text-muted-foreground" data-testid={`${testid}-meta`}>
          {meta}
        </p>
      </div>
    </div>
  );
}

function MiniCard({
  label,
  value,
  testid,
}: {
  label: string;
  value: string;
  testid: string;
}) {
  return (
    <div className="rounded-2xl border bg-background/50 p-3" data-testid={testid}>
      <p className="text-xs text-muted-foreground" data-testid={`${testid}-label`}>
        {label}
      </p>
      <p className="mt-1 font-serif text-xl" data-testid={`${testid}-value`}>
        {value}
      </p>
    </div>
  );
}
