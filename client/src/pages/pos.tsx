import { useMemo, useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { LayoutGrid, Receipt, ShoppingBag, X, Clock, Search, SlidersHorizontal, Ruler, Layers, Tag } from "lucide-react";
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
import OrderReceipts from "@/components/order-receipts";
import { format } from "date-fns";
import type { Combo } from "@/lib/db";
import {
  DEFAULT_TAX_RATE_PCT, DEFAULT_TENDER_METHODS, TAX_INCLUSIVE_KEY, TAX_RATE_KEY, TENDER_METHODS_KEY,
  changeDueCents, taxRatePct, tenderMethods, tenderSuggestions,
} from "@shared/schema";
import { taxOnCart } from "@shared/pricing";
import { computeInventoryDeductions } from "@shared/depletion";

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
    productModifierLinks, productModifierScaleFactors, recordSale, updateSale, isLoading,
    combos, comboItems, productGroups, productGroupItems,
  } = useStore();

  // The operator's rate, not a constant wearing a state hook. Zero until one is set.
  const [taxRate, setTaxRate] = useState(DEFAULT_TAX_RATE_PCT);
  const [taxInclusive, setTaxInclusive] = useState(false);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [appliedCombos, setAppliedCombos] = useState<Map<string, string>>(new Map());
  const [dismissedCombos, setDismissedCombos] = useState<Set<string>>(new Set());
  const [isPaymentOpen, setIsPaymentOpen] = useState(false);
  // What this store accepts is a setting, so it survives a reload. It used to be
  // React state that reset to "cash only" every time the tablet restarted.
  const [acceptedMethods, setAcceptedMethods] = useState<string[]>(DEFAULT_TENDER_METHODS);
  const [paymentType, setPaymentType] = useState<string>(DEFAULT_TENDER_METHODS[0]);
  const [tenderedInput, setTenderedInput] = useState("");

  useEffect(() => {
    fetch(`/api/settings/${TENDER_METHODS_KEY}`)
      .then(r => r.json())
      .then(d => setAcceptedMethods(tenderMethods(d.value)))
      .catch(() => {});
    fetch(`/api/settings/${TAX_RATE_KEY}`)
      .then(r => r.json())
      .then(d => setTaxRate(taxRatePct(d.value)))
      .catch(() => {});
    fetch(`/api/settings/${TAX_INCLUSIVE_KEY}`)
      .then(r => r.json())
      .then(d => setTaxInclusive(d.value === true))
      .catch(() => {});
  }, []);

  const [modSelectorOpen, setModSelectorOpen] = useState(false);
  const [modSelectorProduct, setModSelectorProduct] = useState<typeof products[0] | null>(null);

  const [sizeSelectorOpen, setSizeSelectorOpen] = useState(false);
  const [sizeSelectorProduct, setSizeSelectorProduct] = useState<typeof products[0] | null>(null);

  const [customerName, setCustomerName] = useState("");

  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (searchOpen) {
      const timer = setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [searchOpen]);

  const handleSearchClose = useCallback(() => {
    setSearchOpen(false);
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
      (p.attributes?.tags || []).forEach(t => tagSet.add(t));
    });
    return Array.from(tagSet);
  }, [products]);

  const [activeTag, setActiveTag] = useState<string | null>(null);

  if (!activeTag && tags.length > 0) {
    setActiveTag(tags[0]);
  }

  const filteredProducts = useMemo(() => {
    if (!activeTag) return products;
    return products.filter(p => (p.attributes?.tags || []).includes(activeTag));
  }, [products, activeTag]);

  const displayProducts = useMemo(() => {
    if (searchQuery.trim()) {
      return searchResults;
    }
    return filteredProducts;
  }, [searchQuery, searchResults, filteredProducts]);

  const variantsByProduct = useMemo(() => {
    const map: Record<string, typeof variants> = {};
    variants.forEach(v => {
      if (!map[v.productId]) map[v.productId] = [];
      map[v.productId].push(v);
    });
    return map;
  }, [variants]);


  const comboVariantMap = useMemo(() => {
    const map = new Map<string, Set<string>>();
    combos.filter(c => c.active).forEach(c => {
      const vids = new Set<string>();
      const items = comboItems.filter(i => i.comboId === c.id);
      items.forEach(i => {
        if (i.itemType === "VARIANT") {
          vids.add(i.itemId);
        } else if (i.itemType === "PRODUCT") {
          (variantsByProduct[i.itemId] || []).forEach(v => vids.add(v.id));
        } else if (i.itemType === "PRODUCT_GROUP") {
          const groupItems = productGroupItems.filter(gi => gi.productGroupId === i.itemId);
          groupItems.forEach(gi => {
            if (gi.itemType === "VARIANT") vids.add(gi.itemId);
            else if (gi.itemType === "PRODUCT") {
              (variantsByProduct[gi.itemId] || []).forEach(v => vids.add(v.id));
            }
          });
        }
      });
      map.set(c.id, vids);
    });
    return map;
  }, [combos, comboItems, variantsByProduct, productGroupItems]);

  const suggestedCombos = useMemo(() => {
    if (cart.length === 0) return [];
    const cartVariantIds = new Set(cart.map(c => c.variantId));
    const suggestions: Combo[] = [];
    combos.filter(c => c.active).forEach(c => {
      const alreadyApplied = Array.from(appliedCombos.values()).includes(c.id);
      if (alreadyApplied) return;
      if (dismissedCombos.has(c.id)) return;
      const allowedVids = comboVariantMap.get(c.id);
      if (!allowedVids || allowedVids.size === 0) return;
      let matchCount = 0;
      for (const vid of cartVariantIds) {
        if (allowedVids.has(vid)) matchCount++;
      }
      if (matchCount >= 2) {
        suggestions.push(c);
      }
    });
    return suggestions;
  }, [cart, combos, comboVariantMap, appliedCombos, dismissedCombos]);

  function applyCombo(combo: Combo) {
    const allowedVids = comboVariantMap.get(combo.id);
    if (!allowedVids) return;
    const comboSlotCount = comboItems.filter(i => i.comboId === combo.id).length;
    const newApplied = new Map(appliedCombos);
    let assigned = 0;
    for (const item of cart) {
      if (assigned >= comboSlotCount) break;
      if (allowedVids.has(item.variantId) && !newApplied.has(item.instanceId)) {
        newApplied.set(item.instanceId, combo.id);
        assigned++;
      }
    }
    if (assigned === 0) return;
    setAppliedCombos(newApplied);
    setDismissedCombos(prev => { const n = new Set(prev); n.delete(combo.id); return n; });
    toast({ title: `Combo applied: ${combo.name}` });
  }

  function removeCombo(comboId: string) {
    setAppliedCombos(prev => {
      const n = new Map(prev);
      for (const [k, v] of n) {
        if (v === comboId) n.delete(k);
      }
      return n;
    });
  }

  function getComboDiscount(combo: Combo, itemsInCombo: CartItem[]): number {
    const originalTotal = itemsInCombo.reduce((sum, item) => sum + getCartItemPrice(item) * item.qty, 0);
    let discount = 0;
    if (combo.pricingStrategy === "FIXED" && combo.fixedPriceCents != null) {
      discount = originalTotal - combo.fixedPriceCents;
    } else if (combo.pricingStrategy === "DISCOUNT_VALUE" && combo.discountValueCents != null) {
      discount = combo.discountValueCents;
    } else if (combo.pricingStrategy === "DISCOUNT_PERCENT" && combo.discountPercent != null) {
      discount = Math.round(originalTotal * Math.min(combo.discountPercent, 100) / 100);
    }
    return Math.max(0, Math.min(discount, originalTotal));
  }

  const comboDiscounts = useMemo(() => {
    const discountsByCombo = new Map<string, { combo: Combo; discount: number; items: CartItem[] }>();
    const comboItemsMap = new Map<string, CartItem[]>();
    appliedCombos.forEach((comboId, instanceId) => {
      const item = cart.find(c => c.instanceId === instanceId);
      if (!item) return;
      if (!comboItemsMap.has(comboId)) comboItemsMap.set(comboId, []);
      comboItemsMap.get(comboId)!.push(item);
    });
    comboItemsMap.forEach((items, comboId) => {
      const combo = combos.find(c => c.id === comboId);
      if (!combo) return;
      const discount = getComboDiscount(combo, items);
      discountsByCombo.set(comboId, { combo, discount, items });
    });
    return discountsByCombo;
  }, [appliedCombos, cart, combos]);

  const totalComboDiscount = useMemo(() => {
    let total = 0;
    comboDiscounts.forEach(({ discount }) => { total += discount; });
    return total;
  }, [comboDiscounts]);

  function getLinkedGroupIds(productId: string): string[] {
    return productModifierLinks[productId] || [];
  }

  function hasModifiers(productId: string): boolean {
    const groupIds = getLinkedGroupIds(productId);
    return groupIds.length > 0;
  }

  function handleProductTap(product: typeof products[0], variantId: string) {
    const pvariants = variantsByProduct[product.id] || [];
    if (product.isComposite && hasModifiers(product.id)) {
      setModSelectorProduct(product);
      setModSelectorOpen(true);
    } else if (pvariants.length > 1) {
      setSizeSelectorProduct(product);
      setSizeSelectorOpen(true);
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
    setAppliedCombos(prev => {
      const n = new Map(prev);
      n.delete(instanceId);
      return n;
    });
  }

  function clearCart() {
    setCart([]);
    setAppliedCombos(new Map());
    setDismissedCombos(new Set());
  }

  function getModifierPrice(mod: typeof modifiers[0], variantId: string): number {
    const variant = variants.find(v => v.id === variantId);
    if (variant) {
      const productId = variant.productId;
      const sfKey = `${productId}::${mod.modifierGroupId}`;
      const sf = productModifierScaleFactors[sfKey];
      if (sf) {
        const modSf = sf[mod.id];
        if (modSf) {
          if (modSf[variant.name] !== undefined) return Math.round(modSf[variant.name]);
          if (modSf[variant.id] !== undefined) return Math.round(modSf[variant.id]);
        }
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

  const subtotalCentsBeforeCombo = cart.reduce((acc, item) => {
    return acc + getCartItemPrice(item) * item.qty;
  }, 0);

  const subtotalCents = Math.max(0, subtotalCentsBeforeCombo - totalComboDiscount);

  // Tax on the taxable lines only, computed by shared/pricing.ts — not a second tax
  // calculation living on this page. A product marked tax-exempt is out of the base, and the
  // combo discount comes off the taxable share proportionally.
  const cartTax = taxOnCart(
    cart.map(item => ({
      amountCents: getCartItemPrice(item) * item.qty,
      exempt: products.find(p => p.id === item.productId)?.attributes?.tax_exempt === true,
    })),
    { ratePct: taxRate, discountCents: totalComboDiscount, inclusive: taxInclusive },
  );
  const taxCents = cartTax.taxCents;
  // Not subtotal + tax: with inclusive pricing the price already contains it, and that
  // decision belongs in one place rather than at every call site.
  const totalCents = cartTax.totalCents;

  // A non-cash sale tenders exactly the total: the day's cash expectation is a sum over
  // this column, and a null in the middle of it reads as a hole nobody can explain.
  const isCashTender = paymentType === "Cash";
  const tenderedCents = isCashTender ? Math.round(Number(tenderedInput) * 100) || 0 : totalCents;
  const changeCents = isCashTender ? changeDueCents(totalCents, tenderedCents) : 0;
  const underTendered = isCashTender && tenderedCents < totalCents;

  function handleCloseOrder(saleId: string) {
    updateSale(saleId, { closedAt: Date.now() });
    toast({ title: "Order closed" });
  }

  function handleConfirmOrder() {
    if (cart.length === 0) {
      toast({ title: "Cart is empty", description: "Add items first." });
      return;
    }
    // A method the store has since stopped accepting must not stay selected.
    if (!acceptedMethods.includes(paymentType)) setPaymentType(acceptedMethods[0]);
    setTenderedInput("");
    setIsPaymentOpen(true);
  }

  function handleRecordSale() {
    // One walk, shared with the server's test-order path. The till used to carry its own
    // copy of this algorithm, and the two had already drifted.
    const deltas = computeInventoryDeductions(
      cart.map(line => ({ variantId: line.variantId, qty: line.qty, modifiers: line.modifiers })),
      { products, variants, modifiers, bomEntries: bom },
    );

    const itemComboMap = new Map<string, { comboId: string; comboName: string }>();
    comboDiscounts.forEach(({ combo, discount, items }) => {
      const perItemDiscount = items.length > 0 ? Math.floor(discount / items.reduce((s, i) => s + i.qty, 0)) : 0;
      items.forEach(item => {
        itemComboMap.set(item.instanceId, { comboId: combo.id, comboName: combo.name });
      });
    });

    // The sale, the stock it moves and the ledger rows explaining it: one transaction.
    recordSale({
      id: uid("sale"),
      createdAt: Date.now(),
      subtotalCents,
      taxCents,
      totalCents,
      paymentMethod: paymentType,
      tenderedCents,
      changeCents,
      status: "completed",
      customerName: customerName.trim(),
      closedAt: null,
      comboDiscountCents: totalComboDiscount,
      linesJson: cart.map(c => {
        const prod = products.find(p => p.id === c.productId);
        const vari = variants.find(v => v.id === c.variantId);
        const originalPrice = getCartItemPrice(c);
        const comboInfo = itemComboMap.get(c.instanceId);
        const comboId = comboInfo?.comboId ?? null;
        const comboName = comboInfo?.comboName ?? null;
        let finalPrice = originalPrice;
        if (comboId) {
          const cd = comboDiscounts.get(comboId);
          if (cd) {
            const totalItems = cd.items.reduce((s, i) => s + i.qty, 0);
            const totalOriginal = cd.items.reduce((s, i) => s + getCartItemPrice(i) * i.qty, 0);
            if (totalOriginal > 0) {
              const ratio = (originalPrice * c.qty) / totalOriginal;
              finalPrice = Math.round(originalPrice - (cd.discount * ratio / c.qty));
            }
          }
        }
        return {
          variantId: c.variantId,
          productId: c.productId,
          productName: prod?.name ?? "",
          variantName: vari?.name ?? "",
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
          unitPrice: originalPrice,
          comboId,
          comboName,
          originalPriceCents: originalPrice,
          finalPriceCents: finalPrice,
        };
      }),
    }, deltas);

    toast({ title: "Sale recorded", description: `${formatMoney(totalCents)} • ${paymentType}` });
    clearCart();
    setCustomerName("");
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
        <OrderReceipts sales={sales} onCloseOrder={handleCloseOrder} />
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
                        {searchQuery.trim() && (
                          <Badge variant="secondary" className="ml-1 text-xs font-normal gap-1 cursor-pointer" onClick={() => setSearchQuery("")} data-testid="badge-active-search">
                            "{searchQuery}" <X className="h-3 w-3" />
                          </Badge>
                        )}
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

              </div>
            </CardHeader>

            {!searchQuery.trim() && (
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
              {searchQuery.trim() && (
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
                          <div className="w-full pr-7">
                            <p className="font-semibold leading-tight truncate text-base">{p.name}</p>
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
                          <div className="absolute top-2 right-2 text-muted-foreground">
                            <SlidersHorizontal className="w-3.5 h-3.5" />
                          </div>
                        </Button>
                      );
                    }

                    if (pvariants.length > 1) {
                      return (
                        <Button
                          key={p.id}
                          variant="secondary"
                          className="h-auto flex-col items-start gap-1 rounded-2xl p-3 text-left hover-lift transition-all bg-secondary/50 hover:bg-secondary relative"
                          onClick={() => handleProductTap(p, pvariants[0]?.id)}
                          data-testid={`button-add-menu-${p.id}`}
                        >
                          <div className="w-full pr-7">
                            <p className="font-semibold leading-tight truncate text-base">{p.name}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {pvariants.length} sizes
                            </p>
                            <p className="text-sm font-medium text-primary mt-1">
                              {`from ${formatMoney(Math.min(...pvariants.map(v => v.basePrice)))}`}
                            </p>
                          </div>
                          <div className="absolute top-2 right-2 text-muted-foreground">
                            <Ruler className="w-3.5 h-3.5" />
                          </div>
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
                          <p className="font-semibold leading-tight truncate text-base">{p.name}</p>
                          <p className="text-sm font-medium text-primary mt-1">{formatMoney(v.basePrice)}</p>
                        </div>
                      </Button>
                    ));
                  })
                ) : (
                  <div className="col-span-full py-10 text-center text-muted-foreground">
                    <p>{searchQuery.trim() ? "No products match your search." : "No items in this category."}</p>
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
                      <AnimatePresence>
                        {suggestedCombos.map(c => (
                          <motion.div
                            key={`suggestion-${c.id}`}
                            initial={{ opacity: 0, y: -10, height: 0 }}
                            animate={{ opacity: 1, y: 0, height: "auto" }}
                            exit={{ opacity: 0, y: -10, height: 0 }}
                            className="overflow-hidden"
                          >
                            <div className="flex items-center justify-between p-2.5 rounded-xl border border-primary/30 bg-primary/5 mb-2" data-testid={`combo-suggestion-${c.id}`}>
                              <div className="flex items-center gap-2 flex-1 min-w-0">
                                <Layers className="h-4 w-4 text-primary shrink-0" />
                                <button
                                  className="text-sm font-medium text-primary hover:underline truncate text-left"
                                  onClick={() => applyCombo(c)}
                                  data-testid={`button-apply-combo-${c.id}`}
                                >
                                  {c.name}
                                </button>
                                <Badge variant="secondary" className="text-[10px] shrink-0">
                                  {c.pricingStrategy === "FIXED" && c.fixedPriceCents != null && formatMoney(c.fixedPriceCents)}
                                  {c.pricingStrategy === "DISCOUNT_VALUE" && c.discountValueCents != null && `-${formatMoney(c.discountValueCents)}`}
                                  {c.pricingStrategy === "DISCOUNT_PERCENT" && c.discountPercent != null && `-${c.discountPercent}%`}
                                </Badge>
                              </div>
                              <Button
                                variant="ghost" size="sm"
                                className="h-6 w-6 p-0 shrink-0"
                                onClick={() => setDismissedCombos(prev => new Set(prev).add(c.id))}
                                data-testid={`button-dismiss-combo-${c.id}`}
                              >
                                <X className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </motion.div>
                        ))}
                      </AnimatePresence>

                      {comboDiscounts.size > 0 && (
                        <div className="space-y-1 mb-2">
                          {Array.from(comboDiscounts.entries()).map(([comboId, { combo, discount }]) => (
                            <div key={comboId} className="flex items-center justify-between py-1.5 px-3 rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800/50" data-testid={`applied-combo-${comboId}`}>
                              <div className="flex items-center gap-2">
                                <Tag className="h-3.5 w-3.5 text-green-600" />
                                <span className="text-xs font-medium text-green-700 dark:text-green-400">{combo.name}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-medium text-green-700 dark:text-green-400">-{formatMoney(discount)}</span>
                                <Button variant="ghost" size="sm" className="h-5 w-5 p-0 text-green-600 hover:text-red-500" onClick={() => removeCombo(comboId)} data-testid={`button-remove-combo-${comboId}`}>
                                  <X className="h-3 w-3" />
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      <ul className="space-y-3">
                        {[...cart].reverse().map(item => {
                          const v = variants.find(x => x.id === item.variantId);
                          const p = products.find(x => x.id === item.productId);
                          const itemPrice = getCartItemPrice(item);
                          const hasItemModifiers = item.modifiers.length > 0;
                          const itemComboId = appliedCombos.get(item.instanceId);
                          const itemCombo = itemComboId ? combos.find(c => c.id === itemComboId) : null;
                          return (
                            <li key={item.instanceId} className={`flex flex-col gap-1 rounded-xl border p-3 ${itemCombo ? "bg-green-50/50 dark:bg-green-950/20 border-green-200/50 dark:border-green-800/30" : "bg-background"}`} data-testid={`cart-item-${item.instanceId}`}>
                              <div className="flex items-start justify-between">
                                <div>
                                  <div className="flex items-center gap-1.5">
                                    <p className="font-medium">{p?.name} {v?.name !== "Per Litre" && v?.name !== p?.name ? `(${v?.name})` : ""}</p>
                                    {itemCombo && <Badge variant="outline" className="text-[9px] h-4 border-green-300 text-green-700 dark:text-green-400">{itemCombo.name}</Badge>}
                                  </div>
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
                          <span>{formatMoney(subtotalCentsBeforeCombo)}</span>
                        </div>
                        {totalComboDiscount > 0 && (
                          <div className="flex justify-between text-green-600">
                            <span>Combo Discount</span>
                            <span>-{formatMoney(totalComboDiscount)}</span>
                          </div>
                        )}
                        <div className="flex justify-between text-muted-foreground">
                          <span>
                            {cartTax.inclusive ? "Tax included" : "Tax"} ({taxRate}%
                            {cartTax.exemptCents > 0 ? ", some items exempt" : ""})
                          </span>
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
              <div>
                <label className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5 block">Name on Order</label>
                <Input
                  value={customerName}
                  onChange={e => setCustomerName(e.target.value)}
                  placeholder="Customer name (optional)"
                  className="rounded-xl"
                  data-testid="input-customer-name"
                />
              </div>
              <div className="text-center">
                <p className="text-sm text-muted-foreground uppercase tracking-wider">Total Due</p>
                <p className="text-4xl font-serif mt-1">{formatMoney(totalCents)}</p>
              </div>
              {/* One button per method the store accepts — no disabled button pointing
                  at an Integrations page that cannot deliver what it promises. */}
              <div className="grid grid-cols-2 gap-3">
                {acceptedMethods.map(method => (
                  <Button
                    key={method}
                    variant={paymentType === method ? "default" : "outline"}
                    className="h-16 rounded-2xl flex flex-col gap-1"
                    onClick={() => setPaymentType(method)}
                    data-testid={`button-tender-${method.toLowerCase()}`}
                  >
                    <span className="font-semibold text-lg">{method}</span>
                  </Button>
                ))}
              </div>
              {isCashTender && (
                <div className="space-y-3">
                  <label className="text-xs text-muted-foreground uppercase tracking-wider block">Amount Tendered</label>
                  <div className="grid grid-cols-4 gap-2">
                    {tenderSuggestions(totalCents).map(cents => (
                      <Button
                        key={cents}
                        variant="outline"
                        className="rounded-xl"
                        onClick={() => setTenderedInput((cents / 100).toFixed(2))}
                        data-testid={`button-tender-quick-${cents}`}
                      >
                        {formatMoney(cents)}
                      </Button>
                    ))}
                  </div>
                  <Input
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    value={tenderedInput}
                    onChange={e => setTenderedInput(e.target.value)}
                    placeholder="0.00"
                    className="rounded-xl text-lg"
                    data-testid="input-tendered"
                  />
                  <div className="flex justify-between text-lg" data-testid="text-change-due">
                    <span className="text-muted-foreground">Change Due</span>
                    <span className={underTendered ? "text-destructive" : "font-medium"}>
                      {underTendered ? `${formatMoney(totalCents - tenderedCents)} short` : formatMoney(changeCents)}
                    </span>
                  </div>
                </div>
              )}
              <div className="rounded-xl bg-muted/30 p-4 border border-border/50 text-sm">
                <div className="flex justify-between mb-1">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span>{formatMoney(subtotalCentsBeforeCombo)}</span>
                </div>
                {totalComboDiscount > 0 && (
                  <div className="flex justify-between mb-1 text-green-600">
                    <span>Combo Discount</span>
                    <span>-{formatMoney(totalComboDiscount)}</span>
                  </div>
                )}
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
              <Button
                onClick={handleRecordSale}
                disabled={underTendered}
                className="rounded-2xl px-8"
                data-testid="button-record-sale"
              >
                Record Sale
              </Button>
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

        <Dialog open={sizeSelectorOpen} onOpenChange={setSizeSelectorOpen}>
          <DialogContent className="sm:max-w-sm" aria-describedby="size-picker-desc">
            <DialogHeader>
              <DialogTitle data-testid="text-size-picker-title">{sizeSelectorProduct?.name}</DialogTitle>
              <p id="size-picker-desc" className="text-sm text-muted-foreground">Choose a size</p>
            </DialogHeader>
            <div className="flex flex-col gap-2 py-2">
              {sizeSelectorProduct && (variantsByProduct[sizeSelectorProduct.id] || []).map(v => (
                <Button
                  key={v.id}
                  variant="outline"
                  className="h-14 justify-between rounded-xl px-4"
                  data-testid={`button-size-${v.id}`}
                  onClick={() => {
                    addToCart(v.id, sizeSelectorProduct.id, []);
                    setSizeSelectorOpen(false);
                  }}
                >
                  <span className="font-medium">{v.name}</span>
                  <span className="text-primary font-semibold">{formatMoney(v.basePrice)}</span>
                </Button>
              ))}
            </div>
          </DialogContent>
        </Dialog>
      </AppShell>
    </motion.div>
  );
}
