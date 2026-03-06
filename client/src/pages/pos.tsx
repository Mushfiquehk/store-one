import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { LayoutGrid, Receipt, ShoppingBag, X, Clock } from "lucide-react";
import AppShell from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useStore, type CartItem } from "@/lib/store";
import { format } from "date-fns";

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
  const { products, variants, inventory, bom, sales, addSale, adjustInventory, integrations, isLoading } = useStore();

  const [taxRatePct, setTaxRatePct] = useState(8.25);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isPaymentOpen, setIsPaymentOpen] = useState(false);
  const [paymentType, setPaymentType] = useState<"Cash" | "Card">("Cash");

  const tags = useMemo(() => {
    const tagSet = new Set<string>();
    products.forEach(p => {
      try {
        const attrs = p.attributes ? JSON.parse(p.attributes) : {};
        (attrs.tags || []).forEach((t: string) => tagSet.add(t));
      } catch {}
    });
    return Array.from(tagSet);
  }, [products]);

  const [activeTag, setActiveTag] = useState<string | null>(null);

  if (!activeTag && tags.length > 0) {
    setActiveTag(tags[0]);
  }

  const filteredProducts = useMemo(() => {
    if (!activeTag) return products;
    return products.filter(p => {
      try {
        const attrs = p.attributes ? JSON.parse(p.attributes) : {};
        return (attrs.tags || []).includes(activeTag);
      } catch { return false; }
    });
  }, [products, activeTag]);

  const variantsByProduct = useMemo(() => {
    const map: Record<string, typeof variants> = {};
    variants.forEach(v => {
      if (!map[v.productId]) map[v.productId] = [];
      map[v.productId].push(v);
    });
    return map;
  }, [variants]);

  const hasPaymentIntegration = useMemo(() => integrations.some(id => id.startsWith('pay_')), [integrations]);

  function addToCart(variantId: string, productId: string) {
    const existing = cart.find(c => c.variantId === variantId);
    if (existing) {
      setCart(prev => prev.map(c => c.variantId === variantId ? { ...c, qty: c.qty + 1 } : c));
    } else {
      setCart(prev => [...prev, { instanceId: uid("line"), variantId, productId, qty: 1, modifiers: [] }]);
    }
  }

  function removeFromCart(instanceId: string) {
    setCart(prev => prev.filter(item => item.instanceId !== instanceId));
  }

  function clearCart() {
    setCart([]);
  }

  const subtotalCents = cart.reduce((acc, item) => {
    const v = variants.find(x => x.id === item.variantId);
    return acc + (v?.basePrice ?? 0) * item.qty;
  }, 0);

  const taxCents = Math.round((subtotalCents * taxRatePct) / 100);
  const totalCents = subtotalCents + taxCents;

  function handleConfirmOrder() {
    if (cart.length === 0) {
      toast({ title: "Cart is empty", description: "Add items first." });
      return;
    }
    if (!hasPaymentIntegration) setPaymentType("Cash");
    setIsPaymentOpen(true);
  }

  function handleRecordSale() {
    cart.forEach(line => {
      const bomEntries = bom.filter(b => b.sourceType === "VARIANT" && b.sourceId === line.variantId);
      bomEntries.forEach(entry => {
        adjustInventory(entry.inventoryItemId, -(entry.quantityDeducted * line.qty));
      });
    });

    addSale({
      id: uid("sale"),
      createdAt: Date.now(),
      subtotalCents,
      taxCents,
      totalCents,
      paymentMethod: paymentType,
      status: "completed",
      linesJson: JSON.stringify(cart.map(c => ({
        variantId: c.variantId,
        productId: c.productId,
        qty: c.qty,
      }))),
    });

    toast({ title: "Sale recorded", description: `${formatMoney(totalCents)} • ${paymentType}` });
    clearCart();
    setIsPaymentOpen(false);
  }

  if (isLoading) {
    return (
      <AppShell title="POS">
        <div className="flex items-center justify-center h-[60vh] text-muted-foreground">Loading...</div>
      </AppShell>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
      <AppShell title="POS">
        <div className="grid gap-6 lg:grid-cols-12 h-[calc(100vh-90px)] pb-2">
          <Card className="border bg-card shadow-soft lg:col-span-7 flex flex-col overflow-hidden h-full">
            <CardHeader className="pb-3 flex-shrink-0 pt-4 px-4">
              <CardTitle className="flex items-center gap-2 font-serif" data-testid="text-pos-title">
                <LayoutGrid className="h-5 w-5" />
                Ring up a sale
              </CardTitle>
            </CardHeader>

            <div className="px-6 pb-2">
              <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide" data-testid="nav-menu-categories">
                {tags.map(tag => (
                  <Button
                    key={tag}
                    variant={activeTag === tag ? "default" : "secondary"}
                    onClick={() => setActiveTag(tag)}
                    className="rounded-full flex-shrink-0 capitalize"
                    size="sm"
                    data-testid={`tab-category-${tag}`}
                  >
                    {tag}
                  </Button>
                ))}
              </div>
            </div>

            <CardContent className="flex-1 overflow-y-auto p-4 bg-muted/10">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-3 pb-4">
                {filteredProducts.length > 0 ? (
                  filteredProducts.map(p => {
                    const pvariants = variantsByProduct[p.id] || [];
                    return pvariants.map(v => (
                      <Button
                        key={v.id}
                        variant="secondary"
                        className="h-auto flex-col items-start gap-1 rounded-2xl p-3 text-left hover-lift transition-all bg-secondary/50 hover:bg-secondary"
                        onClick={() => addToCart(v.id, p.id)}
                        data-testid={`button-add-menu-${v.id}`}
                      >
                        <div className="w-full">
                          <p className="font-semibold leading-tight line-clamp-2 text-base">{p.name}</p>
                          {pvariants.length > 1 && (
                            <p className="text-xs text-muted-foreground mt-0.5">{v.name}</p>
                          )}
                          <p className="text-sm font-medium text-primary mt-1">{formatMoney(v.basePrice)}</p>
                        </div>
                      </Button>
                    ));
                  })
                ) : (
                  <div className="col-span-full py-10 text-center text-muted-foreground">
                    <p>No items in this category.</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="border bg-card shadow-soft lg:col-span-5 flex flex-col h-full overflow-hidden">
            <Tabs defaultValue="current" className="flex flex-col h-full">
              <div className="px-4 pt-4 pb-2 border-b bg-muted/20">
                <TabsList className="grid w-full grid-cols-2 rounded-xl h-10 p-1">
                  <TabsTrigger value="current" className="rounded-lg">
                    <Receipt className="h-4 w-4 mr-2" /> New Order
                  </TabsTrigger>
                  <TabsTrigger value="recent" className="rounded-lg">
                    <Clock className="h-4 w-4 mr-2" /> Recent Sales
                  </TabsTrigger>
                </TabsList>
              </div>

              <TabsContent value="current" className="flex-1 flex flex-col overflow-hidden m-0 data-[state=active]:flex">
                <div className="flex-1 overflow-auto p-4">
                  {cart.length > 0 ? (
                    <div className="space-y-4">
                      <ul className="space-y-3">
                        {[...cart].reverse().map(item => {
                          const v = variants.find(x => x.id === item.variantId);
                          const p = products.find(x => x.id === item.productId);
                          return (
                            <li key={item.instanceId} className="flex flex-col gap-1 rounded-xl border bg-background p-3" data-testid={`cart-item-${item.instanceId}`}>
                              <div className="flex items-start justify-between">
                                <div>
                                  <p className="font-medium">{p?.name} {v?.name !== "Per Litre" && v?.name !== p?.name ? `(${v?.name})` : ""}</p>
                                  <p className="text-xs text-muted-foreground">{formatMoney(v?.basePrice ?? 0)} x {item.qty}</p>
                                </div>
                                <div className="flex items-center gap-2">
                                  <div className="flex items-center gap-1">
                                    <Button size="sm" variant="outline" className="h-7 w-7 p-0 rounded-lg" onClick={() => setCart(prev => prev.map(c => c.instanceId === item.instanceId ? { ...c, qty: Math.max(1, c.qty - 1) } : c))}>-</Button>
                                    <span className="w-6 text-center text-sm font-medium">{item.qty}</span>
                                    <Button size="sm" variant="outline" className="h-7 w-7 p-0 rounded-lg" onClick={() => setCart(prev => prev.map(c => c.instanceId === item.instanceId ? { ...c, qty: c.qty + 1 } : c))}>+</Button>
                                  </div>
                                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" onClick={() => removeFromCart(item.instanceId)}>
                                    <X className="h-4 w-4" />
                                  </Button>
                                </div>
                              </div>
                            </li>
                          );
                        })}
                      </ul>

                      <div className="rounded-xl bg-muted/30 p-4 border border-border/50 space-y-1.5 text-sm mt-4">
                        <div className="flex justify-between text-muted-foreground">
                          <span>Subtotal</span>
                          <span>{formatMoney(subtotalCents)}</span>
                        </div>
                        <div className="flex justify-between text-muted-foreground">
                          <span>Tax ({taxRatePct}%)</span>
                          <span>{formatMoney(taxCents)}</span>
                        </div>
                        <Separator className="my-2" />
                        <div className="flex justify-between text-lg font-medium text-foreground">
                          <span>Total</span>
                          <span>{formatMoney(totalCents)}</span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex h-full flex-col items-center justify-center text-muted-foreground">
                      <ShoppingBag className="h-8 w-8 opacity-20" />
                      <p className="mt-2 text-sm">Cart is empty</p>
                    </div>
                  )}
                </div>

                <div className="border-t bg-muted/20 p-4 sm:p-6 shrink-0">
                  <Button className="w-full rounded-2xl h-12 text-lg shadow-lg hover-lift" onClick={handleConfirmOrder} data-testid="button-confirm-order">
                    Checkout {formatMoney(totalCents)}
                  </Button>
                </div>
              </TabsContent>

              <TabsContent value="recent" className="flex-1 flex flex-col overflow-hidden m-0 data-[state=active]:flex">
                <div className="flex-1 overflow-auto p-4">
                  {sales.length > 0 ? (
                    <div className="space-y-4">
                      {sales.slice(0, 20).map(sale => (
                        <div key={sale.id} className="rounded-xl border bg-background p-4 shadow-sm">
                          <div className="flex justify-between items-start mb-2">
                            <div>
                              <p className="font-semibold text-lg">{formatMoney(sale.totalCents)}</p>
                              <p className="text-xs text-muted-foreground">{format(sale.createdAt, "h:mm a")}</p>
                            </div>
                            <span className="text-xs font-medium px-2 py-1 rounded-full bg-primary/10 text-primary border border-primary/20 capitalize">
                              {sale.paymentMethod}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex h-full flex-col items-center justify-center text-muted-foreground">
                      <Clock className="h-8 w-8 opacity-20" />
                      <p className="mt-2 text-sm">No sales yet</p>
                    </div>
                  )}
                </div>
              </TabsContent>
            </Tabs>
          </Card>
        </div>

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
                  onClick={() => hasPaymentIntegration && setPaymentType("Card")}
                  disabled={!hasPaymentIntegration}
                >
                  <span className="font-semibold text-lg">Card</span>
                  {!hasPaymentIntegration && <span className="text-[10px] font-normal opacity-70">(Setup Integration)</span>}
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
                <div className="flex justify-between mb-1">
                  <span className="text-muted-foreground">Tax</span>
                  <span>{formatMoney(taxCents)}</span>
                </div>
                <Separator className="my-2" />
                <div className="flex justify-between font-medium text-lg">
                  <span>Total</span>
                  <span>{formatMoney(totalCents)}</span>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="secondary" onClick={() => setIsPaymentOpen(false)}>Cancel</Button>
              <Button onClick={handleRecordSale} className="rounded-2xl px-8">Record Sale</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </AppShell>
    </motion.div>
  );
}
