import { useMemo, useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { LayoutGrid, Receipt, ShoppingBag, X, Clock, Search } from "lucide-react";
import AppShell from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useStore, type CartItem } from "@/lib/store";
import ModifierSelector, { type SelectedModifier } from "@/components/modifier-selector";
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
  const {
    products, variants, inventory, bom, sales, modifierGroups, modifiers,
    productModifierLinks, productModifierScaleFactors, addSale, adjustInventory, integrations, isLoading,
  } = useStore();

  const [taxRatePct, setTaxRatePct] = useState(8.25);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isPaymentOpen, setIsPaymentOpen] = useState(false);
  const [paymentType, setPaymentType] = useState<"Cash" | "Card">("Cash");

  const [modSelectorOpen, setModSelectorOpen] = useState(false);
  const [modSelectorProduct, setModSelectorProduct] = useState<typeof products[0] | null>(null);

  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (searchOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [searchOpen]);

  const handleSearchClose = useCallback(() => {
    setSearchOpen(false);
    setSearchQuery("");
  }, []);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && searchOpen) {
        handleSearchClose();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [searchOpen, handleSearchClose]);

  useEffect(() => {
    if (!searchOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        handleSearchClose();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [searchOpen, handleSearchClose]);

  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase().trim();
    return products.filter(p => p.name.toLowerCase().includes(q));
  }, [products, searchQuery]);

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

  const displayProducts = useMemo(() => {
    if (searchOpen && searchQuery.trim()) {
      return searchResults;
    }
    return filteredProducts;
  }, [searchOpen, searchQuery, searchResults, filteredProducts]);

  const variantsByProduct = useMemo(() => {
    const map: Record<string, typeof variants> = {};
    variants.forEach(v => {
      if (!map[v.productId]) map[v.productId] = [];
      map[v.productId].push(v);
    });
    return map;
  }, [variants]);

  const hasPaymentIntegration = useMemo(() => integrations.some(id => id.startsWith('pay_')), [integrations]);

  function getLinkedGroupIds(productId: string): string[] {
    return productModifierLinks[productId] || [];
  }

  function hasModifiers(productId: string): boolean {
    const groupIds = getLinkedGroupIds(productId);
    return groupIds.length > 0;
  }

  function handleProductTap(product: typeof products[0], variantId: string) {
    if (product.isComposite && hasModifiers(product.id)) {
      setModSelectorProduct(product);
      setModSelectorOpen(true);
    } else {
      addToCart(variantId, product.id, []);
    }
  }

  function addToCart(variantId: string, productId: string, selectedModifiers: SelectedModifier[]) {
    if (selectedModifiers.length === 0) {
      const existing = cart.find(c => c.variantId === variantId && c.modifiers.length === 0);
      if (existing) {
        setCart(prev => prev.map(c => c.instanceId === existing.instanceId ? { ...c, qty: c.qty + 1 } : c));
        return;
      }
    }
    setCart(prev => [...prev, { instanceId: uid("line"), variantId, productId, qty: 1, modifiers: selectedModifiers }]);
  }

  function handleModifierAdd(variantId: string, selectedModifiers: SelectedModifier[]) {
    if (!modSelectorProduct) return;
    addToCart(variantId, modSelectorProduct.id, selectedModifiers);
  }

  function removeFromCart(instanceId: string) {
    setCart(prev => prev.filter(item => item.instanceId !== instanceId));
  }

  function clearCart() {
    setCart([]);
  }

  function getModifierPrice(mod: typeof modifiers[0], variantId: string): number {
    const variant = variants.find(v => v.id === variantId);
    if (variant) {
      const productId = variant.productId;
      const sfKey = `${productId}::${mod.modifierGroupId}`;
      const sfJson = productModifierScaleFactors[sfKey];
      if (sfJson) {
        try {
          const allSf: Record<string, Record<string, number>> = JSON.parse(sfJson);
          const modSf = allSf[mod.id];
          if (modSf) {
            if (modSf[variant.name] !== undefined) return Math.round(modSf[variant.name]);
            if (modSf[variant.id] !== undefined) return Math.round(modSf[variant.id]);
          }
        } catch {}
      }
    }
    return mod.baseUpcharge;
  }

  function getCartItemModifierTotal(item: CartItem): number {
    return item.modifiers.reduce((sum, sel) => {
      const mod = modifiers.find(m => m.id === sel.modifierId);
      if (!mod) return sum;
      return sum + getModifierPrice(mod, item.variantId) * sel.qty;
    }, 0);
  }

  function getCartItemPrice(item: CartItem): number {
    const v = variants.find(x => x.id === item.variantId);
    const basePrice = v?.basePrice ?? 0;
    const modTotal = getCartItemModifierTotal(item);
    return basePrice + modTotal;
  }

  const subtotalCents = cart.reduce((acc, item) => {
    return acc + getCartItemPrice(item) * item.qty;
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
      const selectedModGroupIds = new Set(
        line.modifiers.map(sel => {
          const mod = modifiers.find(m => m.id === sel.modifierId);
          return mod?.modifierGroupId;
        }).filter(Boolean)
      );

      if (bomEntries.length === 0) {
        const variant = variants.find(v => v.id === line.variantId);
        if (variant?.directInventoryId) {
          adjustInventory(variant.directInventoryId, -line.qty);
        }
      } else {
        bomEntries.forEach(entry => {
          if (entry.overrideModifierGroupId && selectedModGroupIds.has(entry.overrideModifierGroupId)) {
            return;
          }
          let qty = entry.quantityDeducted * line.qty;
          if (entry.scaleFactorMatrix) {
            try {
              const sfm: Record<string, number> = JSON.parse(entry.scaleFactorMatrix);
              const variant = variants.find(v => v.id === line.variantId);
              if (variant) {
                const scale = sfm[variant.name] ?? sfm[variant.id] ?? 1;
                qty = entry.quantityDeducted * scale * line.qty;
              }
            } catch {}
          }
          adjustInventory(entry.inventoryItemId, -qty);
        });
      }

      line.modifiers.forEach(sel => {
        const modBomEntries = bom.filter(b => b.sourceType === "MODIFIER" && b.sourceId === sel.modifierId);
        if (modBomEntries.length > 0) {
          modBomEntries.forEach(entry => {
            let qty = entry.quantityDeducted * sel.qty * line.qty;
            if (entry.scaleFactorMatrix) {
              try {
                const sfm: Record<string, number> = JSON.parse(entry.scaleFactorMatrix);
                const variant = variants.find(v => v.id === line.variantId);
                if (variant) {
                  const scale = sfm[variant.name] ?? sfm[variant.id] ?? 1;
                  qty = entry.quantityDeducted * scale * sel.qty * line.qty;
                }
              } catch {}
            }
            adjustInventory(entry.inventoryItemId, -qty);
          });
        } else {
          const mod = modifiers.find(m => m.id === sel.modifierId);
          if (mod?.inventoryItemId && mod.quantityPerUse) {
            adjustInventory(mod.inventoryItemId, -(mod.quantityPerUse * sel.qty * line.qty));
          }
        }
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
        modifiers: c.modifiers.map(sel => {
          const mod = modifiers.find(m => m.id === sel.modifierId);
          return {
            modifierId: sel.modifierId,
            name: mod?.name ?? "",
            qty: sel.qty,
            unitPrice: mod ? getModifierPrice(mod, c.variantId) : 0,
          };
        }),
        unitPrice: getCartItemPrice(c),
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
              <div ref={searchContainerRef} className="flex items-center justify-between relative">
                <AnimatePresence mode="wait">
                  {searchOpen ? (
                    <motion.div
                      key="search-bar"
                      initial={{ width: 0, opacity: 0 }}
                      animate={{ width: "100%", opacity: 1 }}
                      exit={{ width: 0, opacity: 0 }}
                      transition={{ duration: 0.25, ease: "easeInOut" }}
                      className="flex items-center gap-2 flex-1"
                    >
                      <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          ref={searchInputRef}
                          value={searchQuery}
                          onChange={e => setSearchQuery(e.target.value)}
                          placeholder="Search products..."
                          className="pl-9 pr-8 h-9 rounded-full"
                          data-testid="input-product-search"
                        />
                        {searchQuery && (
                          <button
                            onClick={() => setSearchQuery("")}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                            data-testid="button-clear-search"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleSearchClose}
                        className="h-9 px-2 shrink-0"
                        data-testid="button-close-search"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="title"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.15 }}
                      className="flex items-center justify-between w-full"
                    >
                      <CardTitle className="flex items-center gap-2 font-serif" data-testid="text-pos-title">
                        <LayoutGrid className="h-5 w-5" />
                        Ring up a sale
                      </CardTitle>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSearchOpen(true)}
                        className="h-8 w-8 p-0 rounded-full"
                        data-testid="button-open-search"
                      >
                        <Search className="h-4 w-4" />
                      </Button>
                    </motion.div>
                  )}
                </AnimatePresence>

                <AnimatePresence>
                  {searchOpen && searchQuery.trim() && searchResults.length > 0 && (
                    <motion.div
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.15 }}
                      className="absolute top-full left-0 right-0 mt-1 z-50 bg-popover border border-border rounded-xl shadow-lg max-h-60 overflow-y-auto"
                      data-testid="dropdown-search-suggestions"
                    >
                      {searchResults.slice(0, 8).map(p => {
                        const pvariants = variantsByProduct[p.id] || [];
                        const isCompositeWithMods = p.isComposite && hasModifiers(p.id);
                        return (
                          <button
                            key={p.id}
                            className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-muted/60 transition-colors text-left border-b border-border/30 last:border-b-0"
                            onClick={() => {
                              handleProductTap(p, pvariants[0]?.id);
                              handleSearchClose();
                            }}
                            data-testid={`suggestion-product-${p.id}`}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="text-sm font-medium truncate">{p.name}</span>
                              {isCompositeWithMods && (
                                <Badge variant="outline" className="text-[9px] px-1.5 py-0 shrink-0">
                                  customize
                                </Badge>
                              )}
                            </div>
                            <span className="text-xs text-muted-foreground ml-2 shrink-0">
                              {pvariants.length > 1
                                ? `from ${formatMoney(Math.min(...pvariants.map(v => v.basePrice)))}`
                                : formatMoney(pvariants[0]?.basePrice ?? 0)}
                            </span>
                          </button>
                        );
                      })}
                      {searchResults.length > 8 && (
                        <div className="px-3 py-2 text-xs text-muted-foreground text-center">
                          +{searchResults.length - 8} more results below
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </CardHeader>

            {!(searchOpen && searchQuery.trim()) && (
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
            )}

            <CardContent className="flex-1 overflow-y-auto p-4 bg-muted/10">
              {searchOpen && searchQuery.trim() && (
                <div className="flex items-center gap-2 mb-3 text-sm text-muted-foreground" data-testid="text-search-results-count">
                  <Search className="h-3.5 w-3.5" />
                  {displayProducts.length} result{displayProducts.length !== 1 ? "s" : ""} for "{searchQuery}"
                </div>
              )}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-3 pb-4">
                {displayProducts.length > 0 ? (
                  displayProducts.map(p => {
                    const pvariants = variantsByProduct[p.id] || [];
                    const isCompositeWithMods = p.isComposite && hasModifiers(p.id);

                    if (isCompositeWithMods) {
                      return (
                        <Button
                          key={p.id}
                          variant="secondary"
                          className="h-auto flex-col items-start gap-1 rounded-2xl p-3 text-left hover-lift transition-all bg-secondary/50 hover:bg-secondary relative"
                          onClick={() => handleProductTap(p, pvariants[0]?.id)}
                          data-testid={`button-add-menu-${p.id}`}
                        >
                          <div className="w-full">
                            <p className="font-semibold leading-tight line-clamp-2 text-base">{p.name}</p>
                            {pvariants.length > 1 && (
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {pvariants.length} sizes
                              </p>
                            )}
                            <p className="text-sm font-medium text-primary mt-1">
                              {pvariants.length > 1
                                ? `from ${formatMoney(Math.min(...pvariants.map(v => v.basePrice)))}`
                                : formatMoney(pvariants[0]?.basePrice ?? 0)}
                            </p>
                          </div>
                          <Badge variant="outline" className="absolute top-2 right-2 text-[9px] px-1.5 py-0">
                            customize
                          </Badge>
                        </Button>
                      );
                    }

                    return pvariants.map(v => (
                      <Button
                        key={v.id}
                        variant="secondary"
                        className="h-auto flex-col items-start gap-1 rounded-2xl p-3 text-left hover-lift transition-all bg-secondary/50 hover:bg-secondary"
                        onClick={() => handleProductTap(p, v.id)}
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
                    <p>{searchOpen && searchQuery.trim() ? "No products match your search." : "No items in this category."}</p>
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
                          const itemPrice = getCartItemPrice(item);
                          const hasItemModifiers = item.modifiers.length > 0;
                          return (
                            <li key={item.instanceId} className="flex flex-col gap-1 rounded-xl border bg-background p-3" data-testid={`cart-item-${item.instanceId}`}>
                              <div className="flex items-start justify-between">
                                <div>
                                  <p className="font-medium">{p?.name} {v?.name !== "Per Litre" && v?.name !== p?.name ? `(${v?.name})` : ""}</p>
                                  <p className="text-xs text-muted-foreground">{formatMoney(itemPrice)} x {item.qty}</p>
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
                              {hasItemModifiers && (
                                <div className="ml-1 mt-1 space-y-0.5">
                                  {item.modifiers.map(sel => {
                                    const mod = modifiers.find(m => m.id === sel.modifierId);
                                    if (!mod) return null;
                                    const price = getModifierPrice(mod, item.variantId);
                                    return (
                                      <div key={sel.modifierId} className="flex items-center justify-between text-xs text-muted-foreground" data-testid={`cart-modifier-${item.instanceId}-${sel.modifierId}`}>
                                        <span className="flex items-center gap-1">
                                          <span className="text-primary/60">+</span>
                                          {mod.name}
                                          {sel.qty > 1 && <span className="font-medium">x{sel.qty}</span>}
                                        </span>
                                        {price > 0 && <span>{formatMoney(price * sel.qty)}</span>}
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
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

        {modSelectorProduct && (
          <ModifierSelector
            open={modSelectorOpen}
            onOpenChange={setModSelectorOpen}
            product={modSelectorProduct}
            variants={variants}
            modifierGroups={modifierGroups}
            modifiers={modifiers}
            linkedGroupIds={getLinkedGroupIds(modSelectorProduct.id)}
            productModifierScaleFactors={productModifierScaleFactors}
            onAddToCart={handleModifierAdd}
          />
        )}
      </AppShell>
    </motion.div>
  );
}
