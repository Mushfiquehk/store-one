import { useState, useMemo } from "react";
import { Trash2, Plus, Search, X, Package, ChefHat, Sliders, ArrowRightLeft } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useStore, type Product, type Variant, type BomEntry } from "@/lib/store";

function uid(prefix: string) {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now()}`;
}

function formatMoney(cents: number) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(cents / 100);
}

export default function ProductEditor({
  product,
  open,
  onOpenChange,
}: {
  product: Product | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  if (!product) return null;
  return <ProductEditorInner product={product} open={open} onOpenChange={onOpenChange} />;
}

function ProductEditorInner({
  product,
  open,
  onOpenChange,
}: {
  product: Product;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { toast } = useToast();
  const {
    products,
    variants,
    modifierGroups,
    modifiers,
    inventory,
    bom,
    sales,
    productModifierLinks,
    updateProduct,
    deleteProduct,
    addVariant,
    updateVariant,
    deleteVariant,
    addBom,
    updateBom,
    deleteBom,
    setProductModifierGroups,
    productModifierScaleFactors,
    setProductModifierScaleFactors,
  } = useStore();

  const productVariants = useMemo(() => variants.filter(v => v.productId === product.id), [variants, product.id]);
  const isRetail = !product.isComposite;
  const linkedGroupIds = productModifierLinks[product.id] || [];

  const productBom = useMemo(() => {
    const variantIds = productVariants.map(v => v.id);
    return bom.filter(b => b.sourceType === "VARIANT" && variantIds.includes(b.sourceId));
  }, [bom, productVariants]);

  const [editName, setEditName] = useState(product.name);
  const [editAvailableAsIngredient, setEditAvailableAsIngredient] = useState(product.availableAsIngredient ?? false);
  const [editTags, setEditTags] = useState(() => {
    try { return (JSON.parse(product.attributes || "{}")).tags?.join(", ") || ""; } catch { return ""; }
  });

  const [editVariants, setEditVariants] = useState<Record<string, { name: string; sku: string; basePrice: string }>>(() => {
    const map: Record<string, { name: string; sku: string; basePrice: string }> = {};
    productVariants.forEach(v => {
      map[v.id] = { name: v.name, sku: v.sku || "", basePrice: (v.basePrice / 100).toFixed(2) };
    });
    return map;
  });

  const [newVariantName, setNewVariantName] = useState("");
  const [newVariantSku, setNewVariantSku] = useState("");
  const [newVariantPrice, setNewVariantPrice] = useState("");

  const [selectedBomVariant, setSelectedBomVariant] = useState<string | null>(productVariants[0]?.id || null);
  const [bomSearch, setBomSearch] = useState("");

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const [modConfigGroupId, setModConfigGroupId] = useState<string | null>(null);
  const [modConfigScaleData, setModConfigScaleData] = useState<Record<string, Record<string, string>>>({});
  const [modConfigIngredientData, setModConfigIngredientData] = useState<Record<string, Record<string, string>>>({});

  const modifierBom = useMemo(() => {
    return bom.filter(b => b.sourceType === "MODIFIER");
  }, [bom]);

  const ingredientProducts = useMemo(() => {
    return products.filter(p => p.availableAsIngredient && p.id !== product.id);
  }, [products, product.id]);

  const filteredInventory = useMemo(() => {
    if (!bomSearch) return inventory;
    const lower = bomSearch.toLowerCase();
    return inventory.filter(i => i.name.toLowerCase().includes(lower));
  }, [inventory, bomSearch]);

  const filteredIngredientProducts = useMemo(() => {
    if (!bomSearch) return ingredientProducts;
    const lower = bomSearch.toLowerCase();
    return ingredientProducts.filter(p => p.name.toLowerCase().includes(lower));
  }, [ingredientProducts, bomSearch]);

  const currentBomForVariant = useMemo(() => {
    if (!selectedBomVariant) return [];
    return productBom.filter(b => b.sourceId === selectedBomVariant);
  }, [productBom, selectedBomVariant]);

  function handleSaveAll() {
    const name = editName.trim();
    if (!name) { toast({ title: "Name required" }); return; }
    const tagList = editTags.split(",").map((t: string) => t.trim()).filter(Boolean);
    let attrs: any = {};
    try { attrs = JSON.parse(product.attributes || "{}"); } catch {}
    attrs.tags = tagList;
    updateProduct(product.id, { name, availableAsIngredient: editAvailableAsIngredient, attributes: JSON.stringify(attrs) });

    for (const v of productVariants) {
      const ev = editVariants[v.id];
      if (ev) {
        const vName = ev.name.trim() || v.name;
        const price = Math.round(parseFloat(ev.basePrice || "0") * 100);
        if (Number.isFinite(price) && price > 0) {
          updateVariant(v.id, { name: vName, sku: ev.sku.trim() || null, basePrice: price });
        }
      }
    }

    toast({ title: "Product saved" });
  }

  function handleSaveVariant(variantId: string) {
    const ev = editVariants[variantId];
    if (!ev) return;
    const name = ev.name.trim();
    if (!name) { toast({ title: "Variant name required" }); return; }
    const price = Math.round(parseFloat(ev.basePrice || "0") * 100);
    if (!Number.isFinite(price) || price <= 0) { toast({ title: "Invalid price" }); return; }
    updateVariant(variantId, { name, sku: ev.sku.trim() || null, basePrice: price });
    toast({ title: `Variant "${name}" saved` });
  }

  function handleAddVariant() {
    const name = newVariantName.trim();
    if (!name) { toast({ title: "Variant name required" }); return; }
    const price = Math.round(parseFloat(newVariantPrice || "0") * 100);
    if (!Number.isFinite(price) || price <= 0) { toast({ title: "Invalid price" }); return; }
    const id = uid("var");
    addVariant({ id, productId: product.id, name, sku: newVariantSku.trim() || null, basePrice: price, config: null });
    setEditVariants(prev => ({ ...prev, [id]: { name, sku: newVariantSku.trim(), basePrice: (price / 100).toFixed(2) } }));
    setNewVariantName("");
    setNewVariantSku("");
    setNewVariantPrice("");
    toast({ title: `Variant "${name}" added` });
  }

  function handleDeleteVariant(v: Variant) {
    if (productVariants.length <= 1) {
      toast({ title: "Cannot delete", description: "A product must have at least one variant." });
      return;
    }
    deleteVariant(v.id);
    setEditVariants(prev => { const next = { ...prev }; delete next[v.id]; return next; });
    if (selectedBomVariant === v.id) setSelectedBomVariant(productVariants.find(pv => pv.id !== v.id)?.id || null);
    toast({ title: `Variant "${v.name}" deleted` });
  }

  function handleLinkGroup(groupId: string) {
    if (linkedGroupIds.includes(groupId)) return;
    setProductModifierGroups(product.id, [...linkedGroupIds, groupId]);
    toast({ title: "Modifier group linked" });
  }

  function handleUnlinkGroup(groupId: string) {
    setProductModifierGroups(product.id, linkedGroupIds.filter(id => id !== groupId));
    toast({ title: "Modifier group unlinked" });
  }

  function openModConfigDialog(groupId: string) {
    const groupMods = modifiers.filter(m => m.modifierGroupId === groupId);
    const sfKey = `${product.id}::${groupId}`;
    let existingPrices: Record<string, Record<string, number>> | null = null;
    try { existingPrices = JSON.parse(productModifierScaleFactors[sfKey] || "null"); } catch {}

    const scaleData: Record<string, Record<string, string>> = {};
    const ingredientData: Record<string, Record<string, string>> = {};

    for (const mod of groupMods) {
      scaleData[mod.id] = {};
      ingredientData[mod.id] = {};
      for (const v of productVariants) {
        const centsVal = existingPrices?.[mod.id]?.[v.name];
        scaleData[mod.id][v.name] = centsVal !== undefined ? (centsVal / 100).toFixed(2) : "0";
      }

      if (mod.inventoryItemId) {
        const bomEntry = modifierBom.find(b => b.sourceId === mod.id && b.inventoryItemId === mod.inventoryItemId);
        let matrix: Record<string, number> = {};
        if (bomEntry?.scaleFactorMatrix) {
          try { matrix = JSON.parse(bomEntry.scaleFactorMatrix); } catch {}
        }
        for (const v of productVariants) {
          ingredientData[mod.id][v.name] = String(matrix[v.name] ?? "");
        }
      }
    }

    setModConfigScaleData(scaleData);
    setModConfigIngredientData(ingredientData);
    setModConfigGroupId(groupId);
  }

  function handleSaveModConfig() {
    if (!modConfigGroupId) return;
    const groupMods = modifiers.filter(m => m.modifierGroupId === modConfigGroupId);

    const priceResult: Record<string, Record<string, number>> = {};
    let hasAnyPrice = false;
    for (const [modId, sizeMap] of Object.entries(modConfigScaleData)) {
      priceResult[modId] = {};
      for (const [sizeName, val] of Object.entries(sizeMap)) {
        const dollars = parseFloat(val);
        if (Number.isFinite(dollars) && dollars >= 0) {
          priceResult[modId][sizeName] = Math.round(dollars * 100);
          if (dollars > 0) hasAnyPrice = true;
        } else {
          priceResult[modId][sizeName] = 0;
        }
      }
    }
    setProductModifierScaleFactors(
      product.id,
      modConfigGroupId,
      hasAnyPrice || Object.keys(priceResult).length > 0 ? JSON.stringify(priceResult) : null
    );

    for (const mod of groupMods) {
      if (!mod.inventoryItemId) continue;
      const sizeMap = modConfigIngredientData[mod.id];
      if (!sizeMap) continue;
      const matrix: Record<string, number> = {};
      let hasAny = false;
      for (const [sizeName, val] of Object.entries(sizeMap)) {
        const num = parseFloat(val);
        if (Number.isFinite(num) && num > 0) {
          matrix[sizeName] = num;
          hasAny = true;
        }
      }
      const existingBom = modifierBom.find(b => b.sourceId === mod.id && b.inventoryItemId === mod.inventoryItemId);
      if (hasAny) {
        if (existingBom) {
          updateBom(existingBom.id, { scaleFactorMatrix: JSON.stringify(matrix) });
        } else {
          addBom({
            id: uid("bom"),
            sourceType: "MODIFIER",
            sourceId: mod.id,
            inventoryItemId: mod.inventoryItemId,
            quantityDeducted: 1,
            scaleFactorMatrix: JSON.stringify(matrix),
          });
        }
      } else if (existingBom) {
        updateBom(existingBom.id, { scaleFactorMatrix: null });
      }
    }

    toast({ title: "Modifier configuration saved" });
    setModConfigGroupId(null);
  }

  function handleAddBomEntry(inventoryItemId: string, sourceProductId?: string) {
    if (!selectedBomVariant) return;
    if (sourceProductId) {
      const exists = currentBomForVariant.some(b => b.sourceProductId === sourceProductId);
      if (exists) return;
      addBom({ id: uid("bom"), sourceType: "VARIANT", sourceId: selectedBomVariant, inventoryItemId: "", sourceProductId, quantityDeducted: 1 });
    } else {
      const exists = currentBomForVariant.some(b => b.inventoryItemId === inventoryItemId && !b.sourceProductId);
      if (exists) return;
      addBom({ id: uid("bom"), sourceType: "VARIANT", sourceId: selectedBomVariant, inventoryItemId, quantityDeducted: 1 });
    }
    toast({ title: "Ingredient added" });
  }

  function handleUpdateBomQty(entry: BomEntry, qty: string) {
    const num = Number(qty);
    if (Number.isFinite(num) && num > 0) {
      updateBom(entry.id, { quantityDeducted: num });
    }
  }

  function handleRemoveBomEntry(entry: BomEntry) {
    deleteBom(entry.id);
    toast({ title: "Ingredient removed" });
  }

  function handleDeleteProduct() {
    deleteProduct(product.id);
    toast({ title: "Product deleted" });
    setDeleteConfirmOpen(false);
    onOpenChange(false);
  }

  const deleteDeps: string[] = [];
  const hasSales = sales.some(s => {
    try {
      const lines = JSON.parse(s.linesJson || "[]");
      return lines.some((l: any) => productVariants.map(v => v.id).includes(l.variantId));
    } catch { return false; }
  });
  if (hasSales) deleteDeps.push("sales history");
  if (productBom.length > 0) deleteDeps.push(`${productBom.length} recipe entry(ies)`);

  function renderDetailsTab() {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 mb-2">
          {isRetail ? <Package className="h-4 w-4 text-muted-foreground" /> : <ChefHat className="h-4 w-4 text-muted-foreground" />}
          <Badge variant="secondary">{isRetail ? "Retail" : "Prepared"}</Badge>
        </div>

        <div>
          <Label htmlFor="editor-name">Product Name</Label>
          <Input id="editor-name" value={editName} onChange={e => setEditName(e.target.value)} className="mt-1" data-testid="input-editor-name" />
        </div>
        <div>
          <Label htmlFor="editor-tags">Tags (comma separated)</Label>
          <Input id="editor-tags" value={editTags} onChange={e => setEditTags(e.target.value)} className="mt-1" placeholder="fuel, premium" data-testid="input-editor-tags" />
        </div>

        {!isRetail && (
          <div className="flex items-center justify-between rounded-xl border p-3" data-testid="editor-available-as-ingredient">
            <div className="space-y-0.5">
              <Label className="text-sm font-medium">Available as ingredient</Label>
              <p className="text-xs text-muted-foreground">Allow this prepared product to appear in recipe ingredient lists for other products.</p>
            </div>
            <Switch
              checked={editAvailableAsIngredient}
              onCheckedChange={setEditAvailableAsIngredient}
              data-testid="editor-toggle-available-as-ingredient"
            />
          </div>
        )}

        {isRetail && productVariants.length === 1 && (() => {
          const v = productVariants[0];
          const ev = editVariants[v.id] || { name: v.name, sku: v.sku || "", basePrice: (v.basePrice / 100).toFixed(2) };
          return (
            <>
              <Separator />
              <p className="text-xs font-medium text-muted-foreground">Variant Details</p>
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <Label className="text-xs text-muted-foreground">SKU</Label>
                  <Input value={ev.sku} onChange={e => setEditVariants(prev => ({ ...prev, [v.id]: { ...ev, sku: e.target.value } }))} className="mt-1" data-testid="input-editor-sku" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Price ($)</Label>
                  <Input type="number" step="0.01" min="0" value={ev.basePrice} onChange={e => setEditVariants(prev => ({ ...prev, [v.id]: { ...ev, basePrice: e.target.value } }))} className="mt-1" data-testid="input-editor-price" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Direct Inventory</Label>
                  <p className="text-sm mt-2 text-muted-foreground">{inventory.find(i => i.id === v.directInventoryId)?.name || "None"}</p>
                </div>
              </div>
            </>
          );
        })()}

      </div>
    );
  }

  function renderVariantsTab() {
    return (
      <div className="space-y-4">
        <div>
          <h3 className="font-semibold text-sm">Variants</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Edit sizes/variations with their own SKU and price.</p>
        </div>

        <div className="rounded-xl border overflow-hidden">
          <div className="grid grid-cols-[1fr_100px_100px_70px] gap-2 p-3 bg-muted/30 text-xs font-medium text-muted-foreground">
            <span>Name</span>
            <span>SKU</span>
            <span>Price ($)</span>
            <span></span>
          </div>
          <ScrollArea className="max-h-[240px]">
            {productVariants.map(v => {
              const ev = editVariants[v.id] || { name: v.name, sku: v.sku || "", basePrice: (v.basePrice / 100).toFixed(2) };
              return (
                <div key={v.id} className="grid grid-cols-[1fr_100px_100px_70px] gap-2 p-2 border-t items-center" data-testid={`editor-variant-row-${v.id}`}>
                  <Input value={ev.name} onChange={e => setEditVariants(prev => ({ ...prev, [v.id]: { ...ev, name: e.target.value } }))} className="h-8 rounded-lg text-sm" data-testid={`editor-variant-name-${v.id}`} />
                  <Input value={ev.sku} onChange={e => setEditVariants(prev => ({ ...prev, [v.id]: { ...ev, sku: e.target.value } }))} className="h-8 rounded-lg text-sm" data-testid={`editor-variant-sku-${v.id}`} />
                  <Input type="number" step="0.01" min="0" value={ev.basePrice} onChange={e => setEditVariants(prev => ({ ...prev, [v.id]: { ...ev, basePrice: e.target.value } }))} className="h-8 rounded-lg text-sm" data-testid={`editor-variant-price-${v.id}`} />
                  <div className="flex gap-1">
                    <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => handleSaveVariant(v.id)} data-testid={`editor-variant-save-${v.id}`}>Save</Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDeleteVariant(v)} disabled={productVariants.length <= 1} data-testid={`editor-variant-delete-${v.id}`}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </ScrollArea>
        </div>

        <Separator />
        <p className="text-xs font-medium text-muted-foreground">Add Variant</p>
        <div className="grid grid-cols-[1fr_100px_100px_70px] gap-2 items-end">
          <div>
            <Label className="text-xs text-muted-foreground">Name</Label>
            <Input value={newVariantName} onChange={e => setNewVariantName(e.target.value)} className="h-8 rounded-lg text-sm mt-1" placeholder="e.g., Extra Large" data-testid="editor-new-variant-name" />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">SKU</Label>
            <Input value={newVariantSku} onChange={e => setNewVariantSku(e.target.value)} className="h-8 rounded-lg text-sm mt-1" data-testid="editor-new-variant-sku" />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Price ($)</Label>
            <Input type="number" step="0.01" min="0" value={newVariantPrice} onChange={e => setNewVariantPrice(e.target.value)} className="h-8 rounded-lg text-sm mt-1" data-testid="editor-new-variant-price" />
          </div>
          <Button size="sm" className="h-8" onClick={handleAddVariant} data-testid="editor-add-variant">
            <Plus className="h-3 w-3 mr-1" /> Add
          </Button>
        </div>
      </div>
    );
  }

  function renderModifiersTab() {
    const unlinkedGroups = modifierGroups.filter(mg => !linkedGroupIds.includes(mg.id));

    return (
      <div className="space-y-4">
        <div>
          <h3 className="font-semibold text-sm">Linked Modifier Groups</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Manage which modifier groups are available for this product.</p>
        </div>

        {linkedGroupIds.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-6 text-muted-foreground border-2 border-dashed rounded-xl">
            <p className="text-sm">No modifier groups linked.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {linkedGroupIds.map(gid => {
              const group = modifierGroups.find(mg => mg.id === gid);
              if (!group) return null;
              const groupMods = modifiers.filter(m => m.modifierGroupId === gid);
              return (
                <div key={gid} className="rounded-xl border p-3" data-testid={`editor-mod-group-${gid}`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">{group.name}</p>
                      <p className="text-xs text-muted-foreground">Min: {group.minSelections}, Max: {group.maxSelections}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      {productVariants.length > 0 && groupMods.length > 0 && (
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openModConfigDialog(gid)} title="Size pricing & ingredient config" data-testid={`editor-mod-config-${gid}`}>
                          <Sliders className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" className="text-destructive text-xs" onClick={() => handleUnlinkGroup(gid)} data-testid={`editor-mod-unlink-${gid}`}>
                        <X className="h-3 w-3 mr-1" /> Unlink
                      </Button>
                    </div>
                  </div>
                  {groupMods.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {groupMods.map(m => (
                        <Badge key={m.id} variant="outline" className="text-xs">
                          {m.name} {m.baseUpcharge > 0 && `+${formatMoney(m.baseUpcharge)}`}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {unlinkedGroups.length > 0 && (
          <>
            <Separator />
            <p className="text-xs font-medium text-muted-foreground">Available Groups</p>
            <div className="space-y-1">
              {unlinkedGroups.map(mg => (
                <div key={mg.id} className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50 transition-colors" data-testid={`editor-mod-available-${mg.id}`}>
                  <div>
                    <p className="text-sm font-medium">{mg.name}</p>
                    <p className="text-xs text-muted-foreground">{modifiers.filter(m => m.modifierGroupId === mg.id).length} option(s)</p>
                  </div>
                  <Button size="sm" variant="outline" className="text-xs" onClick={() => handleLinkGroup(mg.id)} data-testid={`editor-mod-link-${mg.id}`}>
                    <Plus className="h-3 w-3 mr-1" /> Link
                  </Button>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    );
  }

  function renderRecipesTab() {
    return (
      <div className="space-y-4">
        <div>
          <h3 className="font-semibold text-sm">Recipe / BOM Mapping</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Map inventory items to each variant. Define quantities consumed per sale.</p>
        </div>

        <div className="grid grid-cols-12 gap-3" style={{ minHeight: 250 }}>
          <div className="col-span-4 border rounded-xl p-2 space-y-1">
            <p className="text-xs font-medium text-muted-foreground px-1 mb-1">Variants</p>
            {productVariants.map(v => (
              <Button
                key={v.id}
                variant={selectedBomVariant === v.id ? "secondary" : "ghost"}
                className="w-full justify-start text-sm h-8 rounded-lg"
                onClick={() => setSelectedBomVariant(v.id)}
                data-testid={`editor-bom-variant-${v.id}`}
              >
                {v.name}
              </Button>
            ))}
          </div>

          <div className="col-span-8 border rounded-xl p-3 flex flex-col gap-2">
            {selectedBomVariant ? (
              <>
                <div className="flex items-center gap-2">
                  <Search className="h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    value={bomSearch}
                    onChange={e => setBomSearch(e.target.value)}
                    className="h-7 rounded-lg text-xs flex-1"
                    placeholder="Search inventory..."
                    data-testid="editor-bom-search"
                  />
                </div>

                {currentBomForVariant.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium text-muted-foreground">Linked Materials</p>
                    {currentBomForVariant.map(entry => {
                      const isPreparedIngredient = !!entry.sourceProductId;
                      const item = isPreparedIngredient
                        ? products.find(p => p.id === entry.sourceProductId)
                        : inventory.find(i => i.id === entry.inventoryItemId);
                      const overrideGroup = entry.overrideModifierGroupId ? modifierGroups.find(mg => mg.id === entry.overrideModifierGroupId) : null;
                      return (
                        <div key={entry.id} className="rounded-lg bg-muted/30 text-xs" data-testid={`editor-bom-entry-${entry.id}`}>
                          <div className="flex items-center gap-2 p-1.5">
                            <span className="flex-1 truncate font-medium flex items-center gap-1">
                              {isPreparedIngredient && <ChefHat className="h-3 w-3 text-primary" />}
                              {item?.name || "Unknown"}
                              {isPreparedIngredient && <Badge variant="secondary" className="text-[9px] h-4 px-1 ml-1">Prepared</Badge>}
                            </span>
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              defaultValue={entry.quantityDeducted}
                              onBlur={e => handleUpdateBomQty(entry, e.target.value)}
                              className="w-16 h-6 rounded text-xs text-center"
                              data-testid={`editor-bom-qty-${entry.id}`}
                            />
                            <span className="text-muted-foreground">{item && 'unitOfMeasure' in item ? item.unitOfMeasure : ''}</span>
                            <Button variant="ghost" size="icon" className="h-5 w-5 text-destructive" onClick={() => handleRemoveBomEntry(entry)} data-testid={`editor-bom-remove-${entry.id}`}>
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                          {linkedGroupIds.length > 0 && (
                            <div className="px-1.5 pb-1.5">
                              <div className="flex items-center gap-1.5">
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <ArrowRightLeft className="h-3 w-3 text-muted-foreground shrink-0" />
                                    </TooltipTrigger>
                                    <TooltipContent side="bottom" className="max-w-[200px]">
                                      <p className="text-xs">When a modifier from the selected group is chosen at POS, it replaces this ingredient.</p>
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                                <Select
                                  value={entry.overrideModifierGroupId || "__none__"}
                                  onValueChange={v => updateBom(entry.id, { overrideModifierGroupId: v === "__none__" ? null : v })}
                                >
                                  <SelectTrigger className="h-5 text-[10px] rounded border-dashed flex-1" data-testid={`editor-bom-override-${entry.id}`}>
                                    <SelectValue placeholder="No override" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="__none__">No override</SelectItem>
                                    {linkedGroupIds.map(gid => {
                                      const g = modifierGroups.find(mg => mg.id === gid);
                                      return g ? <SelectItem key={gid} value={gid}>{g.name} overrides</SelectItem> : null;
                                    })}
                                  </SelectContent>
                                </Select>
                              </div>
                              {overrideGroup && (
                                <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-0.5 ml-4.5">
                                  Replaced by "{overrideGroup.name}" selection at POS
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                <Separator />
                <ScrollArea className="flex-1 max-h-[120px]">
                  <div className="space-y-0.5">
                    {filteredIngredientProducts.map(prod => {
                      const alreadyLinked = currentBomForVariant.some(b => b.sourceProductId === prod.id);
                      return (
                        <button
                          key={`prod-${prod.id}`}
                          type="button"
                          disabled={alreadyLinked}
                          onClick={() => handleAddBomEntry("", prod.id)}
                          className={`w-full text-left text-xs p-1.5 rounded-lg transition-colors flex justify-between ${
                            alreadyLinked ? "opacity-40 cursor-not-allowed" : "hover:bg-muted cursor-pointer"
                          }`}
                          data-testid={`editor-bom-prod-${prod.id}`}
                        >
                          <span className="flex items-center gap-1">
                            <ChefHat className="h-3 w-3 text-primary" />
                            {prod.name}
                          </span>
                          <Badge variant="secondary" className="text-[9px] h-4 px-1">Prepared</Badge>
                        </button>
                      );
                    })}
                    {filteredInventory.map(inv => {
                      const alreadyLinked = currentBomForVariant.some(b => b.inventoryItemId === inv.id && !b.sourceProductId);
                      return (
                        <button
                          key={inv.id}
                          type="button"
                          disabled={alreadyLinked}
                          onClick={() => handleAddBomEntry(inv.id)}
                          className={`w-full text-left text-xs p-1.5 rounded-lg transition-colors flex justify-between ${
                            alreadyLinked ? "opacity-40 cursor-not-allowed" : "hover:bg-muted cursor-pointer"
                          }`}
                          data-testid={`editor-bom-inv-${inv.id}`}
                        >
                          <span>{inv.name}</span>
                          <span className="text-muted-foreground">{inv.unitOfMeasure}</span>
                        </button>
                      );
                    })}
                    {filteredInventory.length === 0 && filteredIngredientProducts.length === 0 && (
                      <p className="text-xs text-muted-foreground text-center py-4">No inventory items found</p>
                    )}
                  </div>
                </ScrollArea>
              </>
            ) : (
              <div className="flex items-center justify-center h-full text-xs text-muted-foreground">
                Select a variant to map materials
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto" data-testid="dialog-product-editor">
          <DialogHeader>
            <DialogTitle className="font-serif flex items-center gap-2" data-testid="editor-title">
              {isRetail ? <Package className="h-5 w-5" /> : <ChefHat className="h-5 w-5" />}
              Edit: {product.name}
            </DialogTitle>
            <DialogDescription>
              {isRetail ? "Retail item" : "Prepared item"} — edit all aspects of this product below.
            </DialogDescription>
          </DialogHeader>

          <Tabs defaultValue="details" className="w-full">
            <TabsList className={`grid w-full ${isRetail ? "grid-cols-2" : "grid-cols-4"}`} data-testid="editor-tabs">
              <TabsTrigger value="details" data-testid="editor-tab-details">Details</TabsTrigger>
              {!isRetail && <TabsTrigger value="variants" data-testid="editor-tab-variants">Variants ({productVariants.length})</TabsTrigger>}
              {!isRetail && <TabsTrigger value="modifiers" data-testid="editor-tab-modifiers">Modifiers ({linkedGroupIds.length})</TabsTrigger>}
              <TabsTrigger value="recipes" data-testid="editor-tab-recipes">Recipes ({productBom.length})</TabsTrigger>
            </TabsList>

            <TabsContent value="details" className="mt-4">
              {renderDetailsTab()}
            </TabsContent>

            {!isRetail && (
              <TabsContent value="variants" className="mt-4">
                {renderVariantsTab()}
              </TabsContent>
            )}

            {!isRetail && (
              <TabsContent value="modifiers" className="mt-4">
                {renderModifiersTab()}
              </TabsContent>
            )}

            <TabsContent value="recipes" className="mt-4">
              {renderRecipesTab()}
            </TabsContent>
          </Tabs>

          <Separator />

          <div className="flex justify-between items-center">
            <Button variant="destructive" onClick={() => setDeleteConfirmOpen(true)} data-testid="editor-delete-product">
              <Trash2 className="mr-2 h-4 w-4" />
              Delete Product
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="editor-close">Close</Button>
              <Button onClick={handleSaveAll} data-testid="button-editor-save-changes">Save Changes</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!modConfigGroupId} onOpenChange={(v) => { if (!v) setModConfigGroupId(null); }}>
        <DialogContent className="sm:max-w-[700px] max-h-[85vh] overflow-y-auto" data-testid="dialog-mod-config">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sliders className="h-5 w-5" />
              Modifier Size Configuration
            </DialogTitle>
            <DialogDescription>
              Configure modifier prices and ingredient quantities for{" "}
              <span className="font-medium">{modConfigGroupId ? modifierGroups.find(mg => mg.id === modConfigGroupId)?.name : ""}</span>{" "}
              on <span className="font-medium">{product.name}</span>.
            </DialogDescription>
          </DialogHeader>

          {modConfigGroupId && (() => {
            const groupMods = modifiers.filter(m => m.modifierGroupId === modConfigGroupId);
            const modsWithIngredients = groupMods.filter(m => m.inventoryItemId);
            if (groupMods.length === 0) {
              return <p className="text-sm text-muted-foreground text-center py-4">No modifier options in this group yet.</p>;
            }
            return (
              <div className="space-y-5">
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">Modifier Pricing ($)</p>
                  <p className="text-[11px] text-muted-foreground mb-3">
                    Set the upcharge price for each modifier option per product size.
                  </p>
                  <div className="overflow-x-auto rounded-lg border">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-muted/50">
                          <th className="text-left text-xs font-medium text-muted-foreground px-3 py-2 whitespace-nowrap sticky left-0 bg-muted/50">Modifier</th>
                          {productVariants.map(v => (
                            <th key={v.id} className="text-center text-xs font-medium text-muted-foreground px-2 py-2 whitespace-nowrap">{v.name}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {groupMods.map(mod => (
                          <tr key={mod.id} className="border-t" data-testid={`editor-price-row-${mod.id}`}>
                            <td className="px-3 py-2 font-medium text-xs whitespace-nowrap sticky left-0 bg-background">{mod.name}</td>
                            {productVariants.map(v => (
                              <td key={v.id} className="px-1.5 py-1.5 text-center">
                                <div className="relative mx-auto w-20">
                                  <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">$</span>
                                  <Input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    value={modConfigScaleData[mod.id]?.[v.name] ?? "0"}
                                    onChange={e => setModConfigScaleData(prev => ({
                                      ...prev,
                                      [mod.id]: { ...(prev[mod.id] || {}), [v.name]: e.target.value },
                                    }))}
                                    className="h-7 w-20 text-center text-xs pl-4 mx-auto"
                                    data-testid={`editor-price-${mod.id}-${v.id}`}
                                  />
                                </div>
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {modsWithIngredients.length > 0 && (
                  <div>
                    <Separator className="mb-4" />
                    <p className="text-xs font-medium text-muted-foreground mb-2">Ingredient Quantity Per Size</p>
                    <p className="text-[11px] text-muted-foreground mb-3">
                      Enter how much of each ingredient is consumed per size when this modifier is selected.
                    </p>
                    <div className="overflow-x-auto rounded-lg border">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-muted/50">
                            <th className="text-left text-xs font-medium text-muted-foreground px-3 py-2 whitespace-nowrap sticky left-0 bg-muted/50">Modifier</th>
                            <th className="text-left text-xs font-medium text-muted-foreground px-3 py-2 whitespace-nowrap">Ingredient</th>
                            {productVariants.map(v => (
                              <th key={v.id} className="text-center text-xs font-medium text-muted-foreground px-2 py-2 whitespace-nowrap">{v.name}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {modsWithIngredients.map(mod => {
                            const invItem = inventory.find(i => i.id === mod.inventoryItemId);
                            return (
                              <tr key={mod.id} className="border-t" data-testid={`editor-ingredient-row-${mod.id}`}>
                                <td className="px-3 py-2 font-medium text-xs whitespace-nowrap sticky left-0 bg-background">{mod.name}</td>
                                <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">
                                  {invItem ? <span>{invItem.name} <span className="opacity-60">({invItem.unitOfMeasure})</span></span> : "—"}
                                </td>
                                {productVariants.map(v => (
                                  <td key={v.id} className="px-1.5 py-1.5 text-center">
                                    <Input
                                      type="number"
                                      step="0.1"
                                      min="0"
                                      value={modConfigIngredientData[mod.id]?.[v.name] ?? ""}
                                      onChange={e => setModConfigIngredientData(prev => ({
                                        ...prev,
                                        [mod.id]: { ...(prev[mod.id] || {}), [v.name]: e.target.value },
                                      }))}
                                      placeholder="0"
                                      className="h-7 w-16 text-center text-xs mx-auto"
                                      data-testid={`editor-ingredient-${mod.id}-${v.id}`}
                                    />
                                  </td>
                                ))}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setModConfigGroupId(null)} data-testid="editor-mod-config-cancel">Cancel</Button>
            <Button onClick={handleSaveModConfig} data-testid="editor-mod-config-save">Save Configuration</Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent data-testid="dialog-confirm-delete-product">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Product?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-medium">{product.name}</span> and all its variants will be permanently removed.
              {deleteDeps.length > 0 && (
                <span className="block mt-2 text-destructive">
                  This will also affect: {deleteDeps.join(", ")}.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteProduct} className="bg-destructive text-destructive-foreground hover:bg-destructive/90" data-testid="button-confirm-delete-product">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
