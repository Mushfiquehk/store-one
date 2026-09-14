import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus, Trash2, X, ChevronDown, ChevronRight, Check,
  Package, Layers, DollarSign, Percent, Tag, Edit2, Power, PowerOff,
} from "lucide-react";
import AppShell from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useStore } from "@/lib/store";
import type { Combo, ComboItem, ProductGroup, ProductGroupItem } from "@/lib/store";
import type { PricingStrategy, ComboItemType } from "@/lib/db";

function uid(prefix: string) {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now()}`;
}

function formatMoney(cents: number) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(cents / 100);
}

function ProductGroupManager() {
  const { toast } = useToast();
  const {
    products, variants, productGroups, productGroupItems,
    addProductGroup, updateProductGroup, deleteProductGroup,
    addProductGroupItem, deleteProductGroupItem,
  } = useStore();

  const [createOpen, setCreateOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<ProductGroup | null>(null);
  const [groupName, setGroupName] = useState("");
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const [expandedProducts, setExpandedProducts] = useState<Set<string>>(new Set());
  const [pickerGroupId, setPickerGroupId] = useState<string | null>(null);

  const variantsByProduct = useMemo(() => {
    const map: Record<string, typeof variants> = {};
    variants.forEach(v => {
      if (!map[v.productId]) map[v.productId] = [];
      map[v.productId].push(v);
    });
    return map;
  }, [variants]);

  function itemsForGroup(gid: string) {
    return productGroupItems.filter(i => i.productGroupId === gid);
  }

  function resolveGroupVariantIds(gid: string): Set<string> {
    const items = itemsForGroup(gid);
    const vids = new Set<string>();
    items.forEach(i => {
      if (i.itemType === "VARIANT") {
        vids.add(i.itemId);
      } else if (i.itemType === "PRODUCT") {
        (variantsByProduct[i.itemId] || []).forEach(v => vids.add(v.id));
      }
    });
    return vids;
  }

  function isProductFullySelected(gid: string, productId: string): boolean {
    const items = itemsForGroup(gid);
    if (items.some(i => i.itemType === "PRODUCT" && i.itemId === productId)) return true;
    const pvariants = variantsByProduct[productId] || [];
    return pvariants.length > 0 && pvariants.every(v => items.some(i => i.itemType === "VARIANT" && i.itemId === v.id));
  }

  function isVariantSelected(gid: string, variantId: string, productId: string): boolean {
    const items = itemsForGroup(gid);
    return items.some(i =>
      (i.itemType === "VARIANT" && i.itemId === variantId) ||
      (i.itemType === "PRODUCT" && i.itemId === productId)
    );
  }

  async function toggleProduct(gid: string, productId: string) {
    const items = itemsForGroup(gid);
    const existing = items.find(i => i.itemType === "PRODUCT" && i.itemId === productId);
    if (existing) {
      deleteProductGroupItem(existing.id);
    } else {
      const variantItems = items.filter(i => i.itemType === "VARIANT" && (variantsByProduct[productId] || []).some(v => v.id === i.itemId));
      for (const vi of variantItems) {
        deleteProductGroupItem(vi.id);
      }
      await addProductGroupItem({ id: uid("pgi"), productGroupId: gid, itemType: "PRODUCT", itemId: productId });
    }
  }

  async function toggleVariant(gid: string, variantId: string, productId: string) {
    const items = itemsForGroup(gid);
    const productItem = items.find(i => i.itemType === "PRODUCT" && i.itemId === productId);
    if (productItem) {
      deleteProductGroupItem(productItem.id);
      const pvariants = variantsByProduct[productId] || [];
      for (const v of pvariants) {
        if (v.id !== variantId) {
          await addProductGroupItem({ id: uid("pgi"), productGroupId: gid, itemType: "VARIANT", itemId: v.id });
        }
      }
      return;
    }
    const existing = items.find(i => i.itemType === "VARIANT" && i.itemId === variantId);
    if (existing) {
      deleteProductGroupItem(existing.id);
    } else {
      await addProductGroupItem({ id: uid("pgi"), productGroupId: gid, itemType: "VARIANT", itemId: variantId });
    }
  }

  async function handleSaveGroup() {
    if (!groupName.trim()) return;
    if (editingGroup) {
      updateProductGroup(editingGroup.id, { name: groupName.trim() });
      toast({ title: "Group updated" });
    } else {
      await addProductGroup({ id: uid("pg"), name: groupName.trim() });
      toast({ title: "Group created" });
    }
    setGroupName("");
    setEditingGroup(null);
    setCreateOpen(false);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Layers className="h-5 w-5" />
          Product Groups
        </h3>
        <Button size="sm" className="rounded-xl" onClick={() => { setGroupName(""); setEditingGroup(null); setCreateOpen(true); }} data-testid="button-add-product-group">
          <Plus className="h-4 w-4 mr-1" /> New Group
        </Button>
      </div>

      {productGroups.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6" data-testid="text-no-product-groups">No product groups yet.</p>
      ) : (
        <div className="space-y-2">
          {productGroups.map(g => {
            const items = itemsForGroup(g.id);
            const expanded = expandedGroup === g.id;
            const variantIds = resolveGroupVariantIds(g.id);
            return (
              <div key={g.id} className="rounded-xl border bg-background/40" data-testid={`product-group-${g.id}`}>
                <div
                  className="flex items-center justify-between p-3 cursor-pointer hover:bg-muted/30 transition-colors"
                  onClick={() => setExpandedGroup(expanded ? null : g.id)}
                >
                  <div className="flex items-center gap-2">
                    {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    <span className="font-medium">{g.name}</span>
                    <Badge variant="secondary" className="text-xs">{variantIds.size} variant{variantIds.size !== 1 ? "s" : ""}</Badge>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={e => { e.stopPropagation(); setPickerGroupId(pickerGroupId === g.id ? null : g.id); }} data-testid={`button-edit-group-items-${g.id}`}>
                      <Edit2 className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={e => { e.stopPropagation(); setEditingGroup(g); setGroupName(g.name); setCreateOpen(true); }}>
                      <Tag className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive" onClick={e => { e.stopPropagation(); deleteProductGroup(g.id); toast({ title: "Group deleted" }); }} data-testid={`button-delete-group-${g.id}`}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                {expanded && (
                  <div className="px-3 pb-3 border-t">
                    <div className="mt-2 space-y-1">
                      {items.length === 0 ? (
                        <p className="text-xs text-muted-foreground py-2">No items. Click the edit icon to add products.</p>
                      ) : items.map(i => {
                        const label = i.itemType === "PRODUCT"
                          ? products.find(p => p.id === i.itemId)?.name ?? i.itemId
                          : (() => {
                              const v = variants.find(v => v.id === i.itemId);
                              const p = v ? products.find(p => p.id === v.productId) : null;
                              return p && v ? `${p.name} — ${v.name}` : i.itemId;
                            })();
                        return (
                          <div key={i.id} className="flex items-center justify-between text-sm py-1 px-2 rounded-lg hover:bg-muted/20">
                            <span>{label}</span>
                            <Badge variant="outline" className="text-[10px]">{i.itemType}</Badge>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                <AnimatePresence>
                  {pickerGroupId === g.id && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden border-t">
                      <div className="p-3 max-h-60 overflow-y-auto">
                        <p className="text-xs text-muted-foreground mb-2">Click + next to a product to add all variants, or expand to add individual variants.</p>
                        {products.map(p => {
                          const pvariants = variantsByProduct[p.id] || [];
                          const allSelected = isProductFullySelected(g.id, p.id);
                          const prodExpanded = expandedProducts.has(p.id);
                          return (
                            <div key={p.id} className="mb-1">
                              <div className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-muted/20">
                                <div className="flex items-center gap-2 flex-1 cursor-pointer" onClick={() => setExpandedProducts(prev => { const n = new Set(prev); if (n.has(p.id)) n.delete(p.id); else n.add(p.id); return n; })}>
                                  {pvariants.length > 1 ? (prodExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />) : <span className="w-3.5" />}
                                  <span className="text-sm font-medium">{p.name}</span>
                                  {pvariants.length > 1 && <span className="text-xs text-muted-foreground">({pvariants.length})</span>}
                                </div>
                                <Button variant="ghost" size="sm" className={`h-6 w-6 p-0 ${allSelected ? "text-green-600" : ""}`} onClick={() => toggleProduct(g.id, p.id)} data-testid={`button-toggle-product-${g.id}-${p.id}`}>
                                  {allSelected ? <Check className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                                </Button>
                              </div>
                              {prodExpanded && pvariants.length > 1 && (
                                <div className="ml-6 space-y-0.5">
                                  {pvariants.map(v => {
                                    const selected = isVariantSelected(g.id, v.id, p.id);
                                    return (
                                      <div key={v.id} className="flex items-center justify-between py-1 px-2 rounded-lg hover:bg-muted/20">
                                        <span className="text-sm text-muted-foreground">{v.name} — {formatMoney(v.basePrice)}</span>
                                        <Button variant="ghost" size="sm" className={`h-6 w-6 p-0 ${selected ? "text-green-600" : ""}`} onClick={() => toggleVariant(g.id, v.id, p.id)} data-testid={`button-toggle-variant-${g.id}-${v.id}`}>
                                          {selected ? <Check className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                                        </Button>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{editingGroup ? "Rename Group" : "New Product Group"}</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Label>Group Name</Label>
            <Input value={groupName} onChange={e => setGroupName(e.target.value)} placeholder="e.g. Hot Beverages" className="mt-1 rounded-xl" data-testid="input-group-name" />
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveGroup} disabled={!groupName.trim()} className="rounded-xl" data-testid="button-save-group">Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ComboEditor({ combo, onClose }: { combo: Combo; onClose: () => void }) {
  const { toast } = useToast();
  const {
    products, variants, productGroups, productGroupItems, comboItems,
    updateCombo, addComboItem, deleteComboItem,
  } = useStore();

  const [name, setName] = useState(combo.name);
  const [pricingStrategy, setPricingStrategy] = useState<PricingStrategy>(combo.pricingStrategy);
  const [fixedPrice, setFixedPrice] = useState(combo.fixedPriceCents ? (combo.fixedPriceCents / 100).toString() : "");
  const [discountValue, setDiscountValue] = useState(combo.discountValueCents ? (combo.discountValueCents / 100).toString() : "");
  const [discountPercent, setDiscountPercent] = useState(combo.discountPercent ? combo.discountPercent.toString() : "");

  const [pickerOpen, setPickerOpen] = useState(false);
  const [expandedProducts, setExpandedProducts] = useState<Set<string>>(new Set());
  const [pickerTab, setPickerTab] = useState("products");

  const myItems = useMemo(() => comboItems.filter(i => i.comboId === combo.id), [comboItems, combo.id]);

  const variantsByProduct = useMemo(() => {
    const map: Record<string, typeof variants> = {};
    variants.forEach(v => {
      if (!map[v.productId]) map[v.productId] = [];
      map[v.productId].push(v);
    });
    return map;
  }, [variants]);

  const selectedVariantIds = useMemo(() => {
    const vids = new Set<string>();
    myItems.forEach(i => {
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
    return vids;
  }, [myItems, variantsByProduct, productGroupItems]);

  function isProductInCombo(productId: string): boolean {
    return myItems.some(i => i.itemType === "PRODUCT" && i.itemId === productId);
  }

  function isVariantInCombo(variantId: string): boolean {
    return myItems.some(i => i.itemType === "VARIANT" && i.itemId === variantId);
  }

  function isGroupInCombo(groupId: string): boolean {
    return myItems.some(i => i.itemType === "PRODUCT_GROUP" && i.itemId === groupId);
  }

  function isProductFullySelected(productId: string): boolean {
    if (isProductInCombo(productId)) return true;
    const pvariants = variantsByProduct[productId] || [];
    return pvariants.length > 0 && pvariants.every(v => selectedVariantIds.has(v.id));
  }

  function isVariantSelected(variantId: string, productId: string): boolean {
    if (isProductInCombo(productId)) return true;
    return selectedVariantIds.has(variantId);
  }

  async function toggleProduct(productId: string) {
    const existing = myItems.find(i => i.itemType === "PRODUCT" && i.itemId === productId);
    if (existing) {
      deleteComboItem(existing.id);
    } else {
      const variantItems = myItems.filter(i => i.itemType === "VARIANT" && (variantsByProduct[productId] || []).some(v => v.id === i.itemId));
      for (const vi of variantItems) deleteComboItem(vi.id);
      await addComboItem({ id: uid("ci"), comboId: combo.id, itemType: "PRODUCT", itemId: productId });
    }
  }

  async function toggleVariant(variantId: string, productId: string) {
    const productItem = myItems.find(i => i.itemType === "PRODUCT" && i.itemId === productId);
    if (productItem) {
      deleteComboItem(productItem.id);
      const pvariants = variantsByProduct[productId] || [];
      for (const v of pvariants) {
        if (v.id !== variantId) {
          await addComboItem({ id: uid("ci"), comboId: combo.id, itemType: "VARIANT", itemId: v.id });
        }
      }
      return;
    }
    const existing = myItems.find(i => i.itemType === "VARIANT" && i.itemId === variantId);
    if (existing) {
      deleteComboItem(existing.id);
    } else {
      await addComboItem({ id: uid("ci"), comboId: combo.id, itemType: "VARIANT", itemId: variantId });
    }
  }

  async function toggleGroup(groupId: string) {
    const existing = myItems.find(i => i.itemType === "PRODUCT_GROUP" && i.itemId === groupId);
    if (existing) {
      deleteComboItem(existing.id);
    } else {
      await addComboItem({ id: uid("ci"), comboId: combo.id, itemType: "PRODUCT_GROUP", itemId: groupId });
    }
  }

  function handleSave() {
    const data: Partial<Combo> = { name: name.trim() || combo.name, pricingStrategy };
    if (pricingStrategy === "FIXED") {
      data.fixedPriceCents = Math.round(parseFloat(fixedPrice || "0") * 100);
      data.discountValueCents = null;
      data.discountPercent = null;
    } else if (pricingStrategy === "DISCOUNT_VALUE") {
      data.discountValueCents = Math.round(parseFloat(discountValue || "0") * 100);
      data.fixedPriceCents = null;
      data.discountPercent = null;
    } else {
      data.discountPercent = parseFloat(discountPercent || "0");
      data.fixedPriceCents = null;
      data.discountValueCents = null;
    }
    updateCombo(combo.id, data);
    toast({ title: "Combo updated" });
    onClose();
  }

  function getItemLabel(item: ComboItem): string {
    if (item.itemType === "PRODUCT") {
      return products.find(p => p.id === item.itemId)?.name ?? item.itemId;
    } else if (item.itemType === "VARIANT") {
      const v = variants.find(v => v.id === item.itemId);
      const p = v ? products.find(p => p.id === v.productId) : null;
      return p && v ? `${p.name} — ${v.name}` : item.itemId;
    } else {
      return productGroups.find(g => g.id === item.itemId)?.name ?? item.itemId;
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Edit: {combo.name}</h3>
        <Button variant="ghost" size="sm" onClick={onClose} data-testid="button-close-combo-editor">
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label>Combo Name</Label>
          <Input value={name} onChange={e => setName(e.target.value)} className="mt-1 rounded-xl" data-testid="input-combo-name" />
        </div>
        <div>
          <Label>Pricing Strategy</Label>
          <Select value={pricingStrategy} onValueChange={(v: PricingStrategy) => setPricingStrategy(v)}>
            <SelectTrigger className="mt-1 rounded-xl" data-testid="select-pricing-strategy">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="FIXED">Fixed Price</SelectItem>
              <SelectItem value="DISCOUNT_VALUE">Discount (Fixed Amount)</SelectItem>
              <SelectItem value="DISCOUNT_PERCENT">Discount (Percentage)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {pricingStrategy === "FIXED" && (
        <div>
          <Label>Fixed Price ($)</Label>
          <Input type="number" step="0.01" min="0" value={fixedPrice} onChange={e => setFixedPrice(e.target.value)} className="mt-1 rounded-xl w-40" data-testid="input-fixed-price" />
        </div>
      )}
      {pricingStrategy === "DISCOUNT_VALUE" && (
        <div>
          <Label>Discount Amount ($)</Label>
          <Input type="number" step="0.01" min="0" value={discountValue} onChange={e => setDiscountValue(e.target.value)} className="mt-1 rounded-xl w-40" data-testid="input-discount-value" />
        </div>
      )}
      {pricingStrategy === "DISCOUNT_PERCENT" && (
        <div>
          <Label>Discount Percentage (%)</Label>
          <Input type="number" step="0.1" min="0" max="100" value={discountPercent} onChange={e => setDiscountPercent(e.target.value)} className="mt-1 rounded-xl w-40" data-testid="input-discount-percent" />
        </div>
      )}

      <Separator />

      <div>
        <div className="flex items-center justify-between mb-3">
          <Label className="text-base">Allowed Items ({selectedVariantIds.size} variants)</Label>
          <Button size="sm" variant="outline" className="rounded-xl" onClick={() => setPickerOpen(!pickerOpen)} data-testid="button-toggle-item-picker">
            <Plus className="h-4 w-4 mr-1" /> {pickerOpen ? "Close" : "Add Items"}
          </Button>
        </div>

        {myItems.length > 0 && (
          <div className="space-y-1 mb-4">
            {myItems.map(item => (
              <div key={item.id} className="flex items-center justify-between py-1.5 px-3 rounded-lg border bg-background/40" data-testid={`combo-item-${item.id}`}>
                <div className="flex items-center gap-2">
                  <span className="text-sm">{getItemLabel(item)}</span>
                  <Badge variant="outline" className="text-[10px]">{item.itemType.replace("_", " ")}</Badge>
                </div>
                <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-destructive" onClick={() => deleteComboItem(item.id)} data-testid={`button-remove-combo-item-${item.id}`}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}

        <AnimatePresence>
          {pickerOpen && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
              <div className="rounded-xl border bg-background/40 p-3">
                <Tabs value={pickerTab} onValueChange={setPickerTab}>
                  <TabsList className="rounded-lg h-8 mb-3">
                    <TabsTrigger value="products" className="text-xs rounded-md">Products</TabsTrigger>
                    <TabsTrigger value="groups" className="text-xs rounded-md">Product Groups</TabsTrigger>
                  </TabsList>

                  <TabsContent value="products" className="mt-0 max-h-60 overflow-y-auto">
                    <p className="text-xs text-muted-foreground mb-2">Click + next to a product name to add all its variants. Expand to add individual variants.</p>
                    {products.map(p => {
                      const pvariants = variantsByProduct[p.id] || [];
                      const allSelected = isProductFullySelected(p.id);
                      const prodExpanded = expandedProducts.has(p.id);
                      return (
                        <div key={p.id} className="mb-0.5">
                          <div className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-muted/20">
                            <div className="flex items-center gap-2 flex-1 cursor-pointer" onClick={() => setExpandedProducts(prev => { const n = new Set(prev); if (n.has(p.id)) n.delete(p.id); else n.add(p.id); return n; })}>
                              {pvariants.length > 1 ? (prodExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />) : <span className="w-3.5" />}
                              <span className="text-sm font-medium">{p.name}</span>
                              {pvariants.length > 1 && <span className="text-xs text-muted-foreground">({pvariants.length} variants)</span>}
                            </div>
                            <Button variant="ghost" size="sm" className={`h-6 w-6 p-0 ${allSelected ? "text-green-600" : ""}`} onClick={() => toggleProduct(p.id)} data-testid={`button-combo-toggle-product-${p.id}`}>
                              {allSelected ? <Check className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                            </Button>
                          </div>
                          {prodExpanded && pvariants.length > 1 && (
                            <div className="ml-6 space-y-0.5">
                              {pvariants.map(v => {
                                const selected = isVariantSelected(v.id, p.id);
                                return (
                                  <div key={v.id} className="flex items-center justify-between py-1 px-2 rounded-lg hover:bg-muted/20">
                                    <span className="text-sm text-muted-foreground">{v.name} — {formatMoney(v.basePrice)}</span>
                                    <Button variant="ghost" size="sm" className={`h-6 w-6 p-0 ${selected ? "text-green-600" : ""}`} onClick={() => toggleVariant(v.id, p.id)} data-testid={`button-combo-toggle-variant-${v.id}`}>
                                      {selected ? <Check className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                                    </Button>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </TabsContent>

                  <TabsContent value="groups" className="mt-0 max-h-60 overflow-y-auto">
                    {productGroups.length === 0 ? (
                      <p className="text-xs text-muted-foreground py-4 text-center">No product groups created yet.</p>
                    ) : productGroups.map(g => {
                      const selected = isGroupInCombo(g.id);
                      const gItems = productGroupItems.filter(gi => gi.productGroupId === g.id);
                      return (
                        <div key={g.id} className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-muted/20">
                          <div>
                            <span className="text-sm font-medium">{g.name}</span>
                            <span className="text-xs text-muted-foreground ml-2">({gItems.length} items)</span>
                          </div>
                          <Button variant="ghost" size="sm" className={`h-6 w-6 p-0 ${selected ? "text-green-600" : ""}`} onClick={() => toggleGroup(g.id)} data-testid={`button-combo-toggle-group-${g.id}`}>
                            {selected ? <Check className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                          </Button>
                        </div>
                      );
                    })}
                  </TabsContent>
                </Tabs>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button onClick={handleSave} className="rounded-xl" data-testid="button-save-combo">Save Combo</Button>
      </div>
    </div>
  );
}

export default function CombosPage({ isTab = false }: { isTab?: boolean }) {
  const { toast } = useToast();
  const { combos, comboItems, variants, products, productGroups, productGroupItems, addCombo, updateCombo, deleteCombo } = useStore();

  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newStrategy, setNewStrategy] = useState<PricingStrategy>("FIXED");
  const [editingComboId, setEditingComboId] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<"combos" | "groups">("combos");

  const variantsByProduct = useMemo(() => {
    const map: Record<string, typeof variants> = {};
    variants.forEach(v => {
      if (!map[v.productId]) map[v.productId] = [];
      map[v.productId].push(v);
    });
    return map;
  }, [variants]);

  function resolveComboVariantIds(comboId: string): Set<string> {
    const items = comboItems.filter(i => i.comboId === comboId);
    const vids = new Set<string>();
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
    return vids;
  }

  async function handleCreateCombo() {
    if (!newName.trim()) return;
    const id = uid("combo");
    await addCombo({
      id,
      name: newName.trim(),
      pricingStrategy: newStrategy,
      fixedPriceCents: null,
      discountValueCents: null,
      discountPercent: null,
      active: true,
    });
    toast({ title: "Combo created" });
    setCreateOpen(false);
    setNewName("");
    setEditingComboId(id);
  }

  function getPricingLabel(c: Combo): string {
    if (c.pricingStrategy === "FIXED" && c.fixedPriceCents != null) return formatMoney(c.fixedPriceCents);
    if (c.pricingStrategy === "DISCOUNT_VALUE" && c.discountValueCents != null) return `-${formatMoney(c.discountValueCents)}`;
    if (c.pricingStrategy === "DISCOUNT_PERCENT" && c.discountPercent != null) return `-${c.discountPercent}%`;
    return "Not configured";
  }

  const editingCombo = combos.find(c => c.id === editingComboId) ?? null;

  const Content = (
    <div className="space-y-6">
      <div className="flex gap-2 mb-4">
        <Button
          variant={activeSection === "combos" ? "default" : "secondary"}
          onClick={() => setActiveSection("combos")}
          className="rounded-xl"
          size="sm"
          data-testid="tab-combos"
        >
          <Package className="h-4 w-4 mr-1" /> Combos
        </Button>
        <Button
          variant={activeSection === "groups" ? "default" : "secondary"}
          onClick={() => setActiveSection("groups")}
          className="rounded-xl"
          size="sm"
          data-testid="tab-product-groups"
        >
          <Layers className="h-4 w-4 mr-1" /> Product Groups
        </Button>
      </div>

      {activeSection === "groups" && (
        <Card className="border bg-card shadow-soft">
          <CardContent className="pt-6">
            <ProductGroupManager />
          </CardContent>
        </Card>
      )}

      {activeSection === "combos" && (
        <>
          <Card className="border bg-card shadow-soft">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center justify-between font-serif" data-testid="text-combos-title">
                <div className="flex items-center gap-2">
                  <Package className="h-5 w-5" />
                  Combo Deals
                </div>
                <Button className="rounded-2xl px-6" onClick={() => { setNewName(""); setNewStrategy("FIXED"); setCreateOpen(true); }} data-testid="button-create-combo">
                  <Plus className="mr-2 h-4 w-4" /> New Combo
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {combos.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Package className="h-8 w-8 opacity-20 mx-auto" />
                  <p className="mt-2 text-sm">No combos yet. Create one to get started.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {combos.map(c => {
                    const variantIds = resolveComboVariantIds(c.id);
                    const itemCount = comboItems.filter(i => i.comboId === c.id).length;
                    return (
                      <div
                        key={c.id}
                        className={`flex items-center justify-between p-3 rounded-xl border transition-colors cursor-pointer ${editingComboId === c.id ? "bg-primary/5 border-primary/20" : "bg-background/40 hover:bg-muted/30"}`}
                        onClick={() => setEditingComboId(editingComboId === c.id ? null : c.id)}
                        data-testid={`combo-row-${c.id}`}
                      >
                        <div className="flex items-center gap-3">
                          <div>
                            <p className="font-medium">{c.name}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <Badge variant="secondary" className="text-xs">
                                {c.pricingStrategy === "FIXED" && <DollarSign className="h-3 w-3 mr-0.5" />}
                                {c.pricingStrategy === "DISCOUNT_VALUE" && <DollarSign className="h-3 w-3 mr-0.5" />}
                                {c.pricingStrategy === "DISCOUNT_PERCENT" && <Percent className="h-3 w-3 mr-0.5" />}
                                {getPricingLabel(c)}
                              </Badge>
                              <span className="text-xs text-muted-foreground">{itemCount} rule{itemCount !== 1 ? "s" : ""}, {variantIds.size} variant{variantIds.size !== 1 ? "s" : ""}</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost" size="sm" className="h-7 w-7 p-0"
                            onClick={e => { e.stopPropagation(); updateCombo(c.id, { active: !c.active }); toast({ title: c.active ? "Combo deactivated" : "Combo activated" }); }}
                            data-testid={`button-toggle-active-${c.id}`}
                          >
                            {c.active ? <Power className="h-3.5 w-3.5 text-green-600" /> : <PowerOff className="h-3.5 w-3.5 text-muted-foreground" />}
                          </Button>
                          <Button
                            variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive"
                            onClick={e => { e.stopPropagation(); deleteCombo(c.id); toast({ title: "Combo deleted" }); if (editingComboId === c.id) setEditingComboId(null); }}
                            data-testid={`button-delete-combo-${c.id}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {editingCombo && (
            <Card className="border bg-card shadow-soft">
              <CardContent className="pt-6">
                <ComboEditor combo={editingCombo} onClose={() => setEditingComboId(null)} />
              </CardContent>
            </Card>
          )}
        </>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Create Combo</DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div>
              <Label>Combo Name</Label>
              <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g. Breakfast Bundle" className="mt-1 rounded-xl" data-testid="input-new-combo-name" />
            </div>
            <div>
              <Label>Pricing Strategy</Label>
              <Select value={newStrategy} onValueChange={(v: PricingStrategy) => setNewStrategy(v)}>
                <SelectTrigger className="mt-1 rounded-xl" data-testid="select-new-combo-strategy">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="FIXED">Fixed Price</SelectItem>
                  <SelectItem value="DISCOUNT_VALUE">Discount (Fixed Amount)</SelectItem>
                  <SelectItem value="DISCOUNT_PERCENT">Discount (Percentage)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateCombo} disabled={!newName.trim()} className="rounded-xl" data-testid="button-confirm-create-combo">Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );

  if (isTab) return Content;

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
      <AppShell title="Combos">
        {Content}
      </AppShell>
    </motion.div>
  );
}
