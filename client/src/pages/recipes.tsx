import { useMemo, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { Plus, Soup, Trash2, Search, Scale, ChevronRight, Package, Layers, Sliders } from "lucide-react";
import AppShell from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useStore } from "@/lib/store";

function uid(prefix: string) {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now()}`;
}

type SourceSelection = {
  type: "VARIANT" | "MODIFIER";
  id: string;
  label: string;
};

export default function RecipesPage({ isTab = false }: { isTab?: boolean }) {
  const { toast } = useToast();
  const { products, variants, modifierGroups, modifiers, inventory, bom, addBom, updateBom, deleteBom, productModifierLinks } = useStore();

  const [selectedSource, setSelectedSource] = useState<SourceSelection | null>(null);
  const [inventorySearch, setInventorySearch] = useState("");
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [bomInvItemId, setBomInvItemId] = useState("");
  const [bomQty, setBomQty] = useState("");
  const [isAutoScaleOpen, setIsAutoScaleOpen] = useState(false);
  const [baseVariantId, setBaseVariantId] = useState<string>("");
  const [scalePercentages, setScalePercentages] = useState<Record<string, string>>({});
  const [productFilter, setProductFilter] = useState<string>("all");

  const compositeProducts = useMemo(() => products.filter(p => p.isComposite), [products]);

  const filteredProducts = useMemo(() => {
    if (productFilter === "all") return products;
    return products.filter(p => p.id === productFilter);
  }, [products, productFilter]);

  const productVariantsMap = useMemo(() => {
    const map: Record<string, typeof variants> = {};
    for (const v of variants) {
      if (!map[v.productId]) map[v.productId] = [];
      map[v.productId].push(v);
    }
    return map;
  }, [variants]);

  const productModifierGroupsMap = useMemo(() => {
    const map: Record<string, typeof modifierGroups> = {};
    for (const p of products) {
      const groupIds = productModifierLinks[p.id] || [];
      map[p.id] = modifierGroups.filter(mg => groupIds.includes(mg.id));
    }
    return map;
  }, [products, modifierGroups, productModifierLinks]);

  const modifiersByGroup = useMemo(() => {
    const map: Record<string, typeof modifiers> = {};
    for (const m of modifiers) {
      if (!map[m.modifierGroupId]) map[m.modifierGroupId] = [];
      map[m.modifierGroupId].push(m);
    }
    return map;
  }, [modifiers]);

  if (!selectedSource && variants.length > 0) {
    const firstVariant = variants[0];
    setSelectedSource({ type: "VARIANT", id: firstVariant.id, label: firstVariant.name });
  }

  const sourceBom = useMemo(() => {
    if (!selectedSource) return [];
    return bom.filter(b => b.sourceType === selectedSource.type && b.sourceId === selectedSource.id);
  }, [bom, selectedSource]);

  const filteredInventory = useMemo(() => {
    if (!inventorySearch) return inventory;
    const lower = inventorySearch.toLowerCase();
    return inventory.filter(i => i.name.toLowerCase().includes(lower));
  }, [inventory, inventorySearch]);

  const parseScaleMatrix = useCallback((matrixJson: string | null): Record<string, number> => {
    if (!matrixJson) return {};
    try {
      return JSON.parse(matrixJson);
    } catch {
      return {};
    }
  }, []);

  function handleAddBom() {
    if (!selectedSource || !bomInvItemId) {
      toast({ title: "Select an inventory item" });
      return;
    }
    const qty = Number(bomQty);
    if (!Number.isFinite(qty) || qty <= 0) {
      toast({ title: "Quantity must be > 0" });
      return;
    }

    addBom({
      id: uid("bom"),
      sourceType: selectedSource.type,
      sourceId: selectedSource.id,
      inventoryItemId: bomInvItemId,
      quantityDeducted: qty,
    });

    setBomInvItemId("");
    setBomQty("");
    setIsAddOpen(false);
    toast({ title: "BOM entry added" });
  }

  function handleAddFromCatalog(invItemId: string) {
    if (!selectedSource) {
      toast({ title: "Select a variant or modifier first" });
      return;
    }
    const existing = bom.find(
      b => b.sourceType === selectedSource.type && b.sourceId === selectedSource.id && b.inventoryItemId === invItemId
    );
    if (existing) {
      toast({ title: "Already linked", description: "This inventory item is already in the BOM for this source." });
      return;
    }
    setBomInvItemId(invItemId);
    setBomQty("1");
    setIsAddOpen(true);
  }

  function openAutoScale(productId: string) {
    const pVariants = productVariantsMap[productId] || [];
    if (pVariants.length < 2) {
      toast({ title: "Need at least 2 variants", description: "Auto-scale requires multiple variant sizes." });
      return;
    }
    setBaseVariantId(pVariants[0].id);
    const initPercentages: Record<string, string> = {};
    pVariants.forEach(v => {
      initPercentages[v.id] = "100";
    });
    setScalePercentages(initPercentages);
    setIsAutoScaleOpen(true);
  }

  function applyAutoScale() {
    if (!baseVariantId) return;
    const baseBom = bom.filter(b => b.sourceType === "VARIANT" && b.sourceId === baseVariantId);
    if (baseBom.length === 0) {
      toast({ title: "No base recipe", description: "Add BOM entries to the base variant first." });
      return;
    }

    const basePercent = Number(scalePercentages[baseVariantId]) || 100;
    let scaledCount = 0;

    for (const [variantId, percentStr] of Object.entries(scalePercentages)) {
      if (variantId === baseVariantId) continue;
      const percent = Number(percentStr) || 100;
      const scaleFactor = percent / basePercent;

      for (const baseEntry of baseBom) {
        const existingEntry = bom.find(
          b => b.sourceType === "VARIANT" && b.sourceId === variantId && b.inventoryItemId === baseEntry.inventoryItemId
        );
        const scaledQty = Math.round(baseEntry.quantityDeducted * scaleFactor * 1000) / 1000;

        if (existingEntry) {
          updateBom(existingEntry.id, { quantityDeducted: scaledQty });
        } else {
          addBom({
            id: uid("bom"),
            sourceType: "VARIANT",
            sourceId: variantId,
            inventoryItemId: baseEntry.inventoryItemId,
            quantityDeducted: scaledQty,
          });
        }
        scaledCount++;
      }

      const scaleMatrix: Record<string, number> = {};
      for (const [vid, pctStr] of Object.entries(scalePercentages)) {
        scaleMatrix[vid] = (Number(pctStr) || 100) / basePercent;
      }

      for (const baseEntry of baseBom) {
        const existingForBase = bom.find(
          b => b.sourceType === "VARIANT" && b.sourceId === baseVariantId && b.inventoryItemId === baseEntry.inventoryItemId
        );
        if (existingForBase) {
          updateBom(existingForBase.id, { scaleFactorMatrix: JSON.stringify(scaleMatrix) });
        }
      }
    }

    setIsAutoScaleOpen(false);
    toast({ title: "Auto-scale applied", description: `Scaled ${scaledCount} BOM entries across variants.` });
  }

  const leftPanel = (
    <Card className="border bg-card shadow-soft h-fit max-h-[calc(100vh-260px)] flex flex-col" data-testid="panel-item-structure">
      <CardHeader className="pb-2 px-4 pt-4">
        <div className="flex items-center justify-between">
          <CardTitle className="font-serif text-lg">Item Structure</CardTitle>
        </div>
        <Select value={productFilter} onValueChange={setProductFilter}>
          <SelectTrigger className="mt-2 h-8 text-xs" data-testid="select-product-filter">
            <SelectValue placeholder="Filter by product" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Products</SelectItem>
            {products.map(p => (
              <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent className="p-2 flex-1 overflow-y-auto">
        <div className="flex flex-col gap-1">
          {filteredProducts.map(product => {
            const pVariants = productVariantsMap[product.id] || [];
            const pModGroups = productModifierGroupsMap[product.id] || [];
            return (
              <div key={product.id} className="mb-2" data-testid={`tree-product-${product.id}`}>
                <div className="flex items-center justify-between px-3 py-1.5">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{product.name}</span>
                  {product.isComposite && pVariants.length >= 2 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-xs"
                      onClick={() => openAutoScale(product.id)}
                      data-testid={`button-autoscale-${product.id}`}
                    >
                      <Scale className="h-3 w-3 mr-1" /> Auto-Scale
                    </Button>
                  )}
                </div>

                {pVariants.map(v => (
                  <Button
                    key={v.id}
                    variant={selectedSource?.type === "VARIANT" && selectedSource.id === v.id ? "secondary" : "ghost"}
                    className={`w-full justify-start rounded-lg h-auto py-2 px-3 text-left whitespace-normal text-sm ${
                      selectedSource?.type === "VARIANT" && selectedSource.id === v.id ? "bg-secondary font-medium shadow-sm" : ""
                    }`}
                    onClick={() => setSelectedSource({ type: "VARIANT", id: v.id, label: v.name })}
                    data-testid={`select-recipe-${v.id}`}
                  >
                    <Layers className="h-3.5 w-3.5 mr-2 flex-shrink-0 text-muted-foreground" />
                    <span className="truncate">{v.name}</span>
                    <Badge variant="outline" className="ml-auto text-[10px] h-5">
                      {bom.filter(b => b.sourceType === "VARIANT" && b.sourceId === v.id).length}
                    </Badge>
                  </Button>
                ))}

                {pModGroups.map(mg => {
                  const groupMods = modifiersByGroup[mg.id] || [];
                  return (
                    <div key={mg.id} className="ml-2">
                      <div className="flex items-center px-3 py-1 mt-1">
                        <ChevronRight className="h-3 w-3 mr-1 text-muted-foreground" />
                        <span className="text-[11px] font-medium text-muted-foreground">{mg.name}</span>
                      </div>
                      {groupMods.map(mod => (
                        <Button
                          key={mod.id}
                          variant={selectedSource?.type === "MODIFIER" && selectedSource.id === mod.id ? "secondary" : "ghost"}
                          className={`w-full justify-start rounded-lg h-auto py-1.5 px-3 pl-7 text-left whitespace-normal text-xs ${
                            selectedSource?.type === "MODIFIER" && selectedSource.id === mod.id ? "bg-secondary font-medium shadow-sm" : ""
                          }`}
                          onClick={() => setSelectedSource({ type: "MODIFIER", id: mod.id, label: mod.name })}
                          data-testid={`select-modifier-bom-${mod.id}`}
                        >
                          <Package className="h-3 w-3 mr-2 flex-shrink-0 text-muted-foreground" />
                          <span className="truncate">{mod.name}</span>
                          <Badge variant="outline" className="ml-auto text-[10px] h-4">
                            {bom.filter(b => b.sourceType === "MODIFIER" && b.sourceId === mod.id).length}
                          </Badge>
                        </Button>
                      ))}
                    </div>
                  );
                })}
              </div>
            );
          })}

          {filteredProducts.length === 0 && (
            <div className="text-center text-xs text-muted-foreground py-8">No products found</div>
          )}
        </div>
      </CardContent>
    </Card>
  );

  const centerPanel = (
    <Card className="border bg-card shadow-soft h-full min-h-[500px] flex flex-col overflow-hidden" data-testid="panel-bom-detail">
      {selectedSource ? (
        <div className="flex flex-col h-full">
          <div className="px-6 py-4 border-b bg-muted/20 flex justify-between items-center">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-serif text-xl" data-testid="text-selected-recipe-name">
                  {selectedSource.label}
                </h2>
                <Badge variant={selectedSource.type === "VARIANT" ? "default" : "secondary"} className="text-[10px]">
                  {selectedSource.type}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {selectedSource.type === "VARIANT"
                  ? "Define raw materials consumed when this variant is sold"
                  : "Define additional materials consumed when this modifier is selected"}
              </p>
            </div>
            <Button size="sm" onClick={() => setIsAddOpen(true)} data-testid="button-add-material">
              <Plus className="h-4 w-4 mr-1" /> Add Material
            </Button>
          </div>

          <div className="flex-1 p-6 overflow-y-auto">
            {sourceBom.length > 0 ? (
              <div className="space-y-3">
                {sourceBom.map(entry => {
                  const item = inventory.find(i => i.id === entry.inventoryItemId);
                  const matrix = parseScaleMatrix(entry.scaleFactorMatrix);
                  const hasMatrix = Object.keys(matrix).length > 0;
                  return (
                    <div key={entry.id} className="p-4 rounded-xl border bg-card shadow-sm hover:shadow-md transition-all group relative" data-testid={`bom-entry-${entry.id}`}>
                      <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-destructive hover:bg-destructive/10"
                          onClick={() => deleteBom(entry.id)}
                          data-testid={`button-delete-bom-${entry.id}`}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                      <p className="font-semibold text-sm mb-1">{item?.name || "Unknown"}</p>
                      <div className="text-xs space-y-1 text-muted-foreground">
                        <div className="flex justify-between">
                          <span>Qty deducted:</span>
                          <span className="font-medium text-primary">{entry.quantityDeducted} {item?.unitOfMeasure}</span>
                        </div>
                      </div>

                      {hasMatrix && (
                        <div className="mt-3 pt-3 border-t" data-testid={`scale-matrix-${entry.id}`}>
                          <p className="text-[11px] font-medium text-muted-foreground mb-2 flex items-center gap-1">
                            <Sliders className="h-3 w-3" /> Scale Factor Matrix
                          </p>
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                            {Object.entries(matrix).map(([varId, factor]) => {
                              const variant = variants.find(v => v.id === varId);
                              return (
                                <div key={varId} className="flex items-center justify-between bg-muted/50 rounded-md px-2 py-1 text-[11px]">
                                  <span className="truncate mr-1">{variant?.name || varId}</span>
                                  <span className="font-mono font-medium">{(factor as number).toFixed(2)}x</span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-40 text-muted-foreground border-2 border-dashed rounded-xl border-muted-foreground/20">
                <Soup className="h-8 w-8 mb-2 opacity-20" />
                <p className="text-sm">No materials linked.</p>
                <p className="text-xs mt-1">Click inventory items on the right or use "Add Material".</p>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="flex h-full flex-col items-center justify-center p-8 text-center text-muted-foreground">
          <Soup className="h-12 w-12 opacity-20 mb-4" />
          <p>Select a variant or modifier to manage its bill of materials.</p>
        </div>
      )}
    </Card>
  );

  const rightPanel = (
    <Card className="border bg-card shadow-soft h-fit max-h-[calc(100vh-260px)] flex flex-col" data-testid="panel-inventory-catalog">
      <CardHeader className="pb-2 px-4 pt-4">
        <CardTitle className="font-serif text-lg">Inventory Catalog</CardTitle>
        <div className="relative mt-2">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search inventory..."
            value={inventorySearch}
            onChange={e => setInventorySearch(e.target.value)}
            className="pl-8 h-8 text-xs"
            data-testid="input-inventory-search"
          />
        </div>
      </CardHeader>
      <CardContent className="p-2 flex-1 overflow-y-auto">
        <div className="flex flex-col gap-1">
          {filteredInventory.map(item => {
            const isLinked = selectedSource
              ? bom.some(b => b.sourceType === selectedSource.type && b.sourceId === selectedSource.id && b.inventoryItemId === item.id)
              : false;
            return (
              <button
                key={item.id}
                className={`w-full text-left rounded-lg px-3 py-2 text-sm transition-all border ${
                  isLinked
                    ? "border-primary/30 bg-primary/5 cursor-default"
                    : "border-transparent hover:bg-muted/50 cursor-pointer"
                }`}
                onClick={() => !isLinked && handleAddFromCatalog(item.id)}
                disabled={isLinked || !selectedSource}
                data-testid={`inventory-catalog-item-${item.id}`}
              >
                <div className="flex items-center justify-between">
                  <span className={`truncate ${isLinked ? "text-primary font-medium" : ""}`}>{item.name}</span>
                  <span className="text-[10px] text-muted-foreground ml-2 flex-shrink-0">{item.unitOfMeasure}</span>
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">
                  Stock: {item.currentQuantity} {item.unitOfMeasure}
                </div>
              </button>
            );
          })}
          {filteredInventory.length === 0 && (
            <div className="text-center text-xs text-muted-foreground py-8">No inventory items found</div>
          )}
        </div>
      </CardContent>
    </Card>
  );

  const addDialog = (
    <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Add Material to BOM</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label>Source</Label>
            <div className="flex items-center gap-2">
              <Badge variant={selectedSource?.type === "VARIANT" ? "default" : "secondary"}>
                {selectedSource?.type}
              </Badge>
              <span className="text-sm">{selectedSource?.label}</span>
            </div>
          </div>
          <div className="grid gap-2">
            <Label>Inventory Item</Label>
            <Select value={bomInvItemId} onValueChange={setBomInvItemId}>
              <SelectTrigger data-testid="select-bom-inventory">
                <SelectValue placeholder="Select inventory item" />
              </SelectTrigger>
              <SelectContent>
                {inventory.map(i => (
                  <SelectItem key={i.id} value={i.id}>{i.name} ({i.unitOfMeasure})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label>Quantity Deducted Per Sale</Label>
            <Input
              type="number"
              value={bomQty}
              onChange={e => setBomQty(e.target.value)}
              placeholder="e.g. 1"
              data-testid="input-bom-qty"
            />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={handleAddBom} className="rounded-xl" data-testid="button-confirm-add-bom">Add</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  const autoScaleDialog = (
    <Dialog open={isAutoScaleOpen} onOpenChange={setIsAutoScaleOpen}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Scale className="h-5 w-5" /> Auto-Scale Recipes
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label>Base Variant (reference recipe)</Label>
            <Select value={baseVariantId} onValueChange={setBaseVariantId}>
              <SelectTrigger data-testid="select-base-variant">
                <SelectValue placeholder="Select base variant" />
              </SelectTrigger>
              <SelectContent>
                {variants.map(v => (
                  <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Other variants will be scaled proportionally based on percentages below.
            </p>
          </div>

          <Separator />

          <div className="grid gap-3">
            <Label>Scale Percentages</Label>
            {Object.entries(scalePercentages).map(([varId, pct]) => {
              const v = variants.find(vr => vr.id === varId);
              const isBase = varId === baseVariantId;
              return (
                <div key={varId} className="flex items-center gap-3">
                  <span className={`text-sm w-32 truncate ${isBase ? "font-semibold" : ""}`}>
                    {v?.name || varId}
                    {isBase && <Badge variant="outline" className="ml-1 text-[9px] h-4">BASE</Badge>}
                  </span>
                  <Input
                    type="number"
                    value={pct}
                    onChange={e => setScalePercentages(prev => ({ ...prev, [varId]: e.target.value }))}
                    className="w-24 h-8 text-sm"
                    data-testid={`input-scale-${varId}`}
                  />
                  <span className="text-xs text-muted-foreground">%</span>
                  {!isBase && baseVariantId && (
                    <span className="text-xs text-muted-foreground">
                      = {((Number(pct) || 0) / (Number(scalePercentages[baseVariantId]) || 100)).toFixed(2)}x
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {baseVariantId && (
            <div className="mt-2 p-3 rounded-lg bg-muted/50 border">
              <p className="text-xs font-medium text-muted-foreground mb-2">Preview: Scale Factor Matrix</p>
              <div className="grid grid-cols-3 gap-1.5">
                {Object.entries(scalePercentages).map(([varId, pct]) => {
                  const v = variants.find(vr => vr.id === varId);
                  const baseP = Number(scalePercentages[baseVariantId]) || 100;
                  const factor = (Number(pct) || 100) / baseP;
                  return (
                    <div key={varId} className="flex items-center justify-between bg-background rounded px-2 py-1 text-[11px]" data-testid={`preview-scale-${varId}`}>
                      <span className="truncate mr-1">{v?.name || varId}</span>
                      <span className="font-mono font-medium">{factor.toFixed(2)}x</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setIsAutoScaleOpen(false)}>Cancel</Button>
          <Button onClick={applyAutoScale} className="rounded-xl" data-testid="button-apply-autoscale">
            Apply Scale
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  const Content = (
    <div className="grid gap-4 lg:grid-cols-12">
      <div className="lg:col-span-3">
        {leftPanel}
      </div>
      <div className="lg:col-span-6">
        {centerPanel}
      </div>
      <div className="lg:col-span-3">
        {rightPanel}
      </div>
    </div>
  );

  if (isTab) return <>{Content}{addDialog}{autoScaleDialog}</>;

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
      <AppShell title="Bill of Materials">
        <header className="relative overflow-hidden rounded-3xl border bg-card shadow-soft grain">
          <div className="p-6 sm:p-8">
            <p className="text-sm font-medium text-muted-foreground">Back Office</p>
            <h1 className="mt-2 font-serif text-3xl tracking-[-0.02em] sm:text-4xl">Bill of Materials</h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">Map variants and modifiers to inventory items. Auto-scale recipes across sizes.</p>
            <Separator className="my-6" />
            {Content}
          </div>
        </header>
        {addDialog}
        {autoScaleDialog}
      </AppShell>
    </motion.div>
  );
}
