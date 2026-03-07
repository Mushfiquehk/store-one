import { useState, useMemo, useCallback } from "react";
import { Plus, Pencil, Trash2, ChevronDown, ChevronRight, Link2, DollarSign, Sliders } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { useStore, type ModifierGroup, type Modifier } from "@/lib/store";

function formatMoney(cents: number) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(cents / 100);
}

function uid(prefix: string) {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now()}`;
}

export default function ModifiersPageContent({ isTab = false }: { isTab?: boolean }) {
  const { toast } = useToast();
  const {
    modifierGroups, modifiers, products, variants, inventory,
    addModifierGroup, updateModifierGroup, deleteModifierGroup,
    addModifier, updateModifier, deleteModifier,
    productModifierLinks, setProductModifierGroups,
    productModifierScaleFactors, setProductModifierScaleFactors,
  } = useStore();

  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(null);
  const [groupDialogOpen, setGroupDialogOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<ModifierGroup | null>(null);
  const [groupForm, setGroupForm] = useState({ name: "", minSelections: 0, maxSelections: 0 });

  const [modifierDialogOpen, setModifierDialogOpen] = useState(false);
  const [editingModifier, setEditingModifier] = useState<Modifier | null>(null);
  const [modifierForm, setModifierForm] = useState({ name: "", baseUpcharge: "", inventoryItemId: "", quantityPerUse: "" });
  const [modifierGroupId, setModifierGroupId] = useState<string>("");

  const [deleteTarget, setDeleteTarget] = useState<{ type: "group" | "modifier"; id: string; name: string } | null>(null);

  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [linkGroupId, setLinkGroupId] = useState<string>("");
  const [linkSelectedProducts, setLinkSelectedProducts] = useState<string[]>([]);

  const [scaleDialogOpen, setScaleDialogOpen] = useState(false);
  const [scaleProductId, setScaleProductId] = useState("");
  const [scaleGroupId, setScaleGroupId] = useState("");
  const [scaleFormData, setScaleFormData] = useState<Record<string, Record<string, string>>>({});

  const productLinksForGroup = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const [productId, groupIds] of Object.entries(productModifierLinks)) {
      for (const gid of groupIds) {
        if (!map[gid]) map[gid] = [];
        map[gid].push(productId);
      }
    }
    return map;
  }, [productModifierLinks]);

  const getModifiersForGroup = (groupId: string) => modifiers.filter(m => m.modifierGroupId === groupId);

  function openCreateGroup() {
    setEditingGroup(null);
    setGroupForm({ name: "", minSelections: 0, maxSelections: 0 });
    setGroupDialogOpen(true);
  }

  function openEditGroup(group: ModifierGroup) {
    setEditingGroup(group);
    setGroupForm({ name: group.name, minSelections: group.minSelections, maxSelections: group.maxSelections });
    setGroupDialogOpen(true);
  }

  function handleSaveGroup() {
    const name = groupForm.name.trim();
    if (!name) {
      toast({ title: "Name required" });
      return;
    }
    if (groupForm.maxSelections > 0 && groupForm.minSelections > groupForm.maxSelections) {
      toast({ title: "Invalid selection rules", description: "Min selections cannot exceed max selections" });
      return;
    }
    if (editingGroup) {
      updateModifierGroup(editingGroup.id, {
        name,
        minSelections: groupForm.minSelections,
        maxSelections: groupForm.maxSelections,
      });
      toast({ title: "Modifier group updated" });
    } else {
      addModifierGroup({
        id: uid("mg"),
        name,
        minSelections: groupForm.minSelections,
        maxSelections: groupForm.maxSelections,
      });
      toast({ title: "Modifier group created" });
    }
    setGroupDialogOpen(false);
  }

  function openCreateModifier(groupId: string) {
    setEditingModifier(null);
    setModifierGroupId(groupId);
    setModifierForm({ name: "", baseUpcharge: "", inventoryItemId: "", quantityPerUse: "" });
    setModifierDialogOpen(true);
  }

  function openEditModifier(mod: Modifier) {
    setEditingModifier(mod);
    setModifierGroupId(mod.modifierGroupId);
    setModifierForm({
      name: mod.name,
      baseUpcharge: (mod.baseUpcharge / 100).toFixed(2),
      inventoryItemId: mod.inventoryItemId || "",
      quantityPerUse: mod.quantityPerUse ? String(mod.quantityPerUse) : "",
    });
    setModifierDialogOpen(true);
  }

  function handleSaveModifier() {
    const name = modifierForm.name.trim();
    if (!name) {
      toast({ title: "Name required" });
      return;
    }
    const upcharge = Math.round(parseFloat(modifierForm.baseUpcharge || "0") * 100);
    if (!Number.isFinite(upcharge)) {
      toast({ title: "Invalid price" });
      return;
    }

    const invItemId = modifierForm.inventoryItemId.trim() || null;
    const qtyPerUse = modifierForm.quantityPerUse.trim() ? parseFloat(modifierForm.quantityPerUse) : null;
    if (invItemId && (qtyPerUse === null || !Number.isFinite(qtyPerUse) || qtyPerUse <= 0)) {
      toast({ title: "Invalid quantity", description: "Enter a positive number for quantity per use." });
      return;
    }

    if (editingModifier) {
      updateModifier(editingModifier.id, {
        name,
        baseUpcharge: upcharge,
        inventoryItemId: invItemId,
        quantityPerUse: qtyPerUse,
      });
      toast({ title: "Modifier updated" });
    } else {
      addModifier({
        id: uid("mod"),
        modifierGroupId: modifierGroupId,
        name,
        baseUpcharge: upcharge,
        inventoryItemId: invItemId,
        quantityPerUse: qtyPerUse,
      });
      toast({ title: "Modifier created" });
    }
    setModifierDialogOpen(false);
  }

  function handleDelete() {
    if (!deleteTarget) return;
    if (deleteTarget.type === "group") {
      deleteModifierGroup(deleteTarget.id);
      if (expandedGroupId === deleteTarget.id) setExpandedGroupId(null);
      toast({ title: "Modifier group deleted" });
    } else {
      deleteModifier(deleteTarget.id);
      toast({ title: "Modifier option deleted" });
    }
    setDeleteTarget(null);
  }

  function openLinkDialog(groupId: string) {
    setLinkGroupId(groupId);
    const linked = Object.entries(productModifierLinks)
      .filter(([, gids]) => gids.includes(groupId))
      .map(([pid]) => pid);
    setLinkSelectedProducts(linked);
    setLinkDialogOpen(true);
  }

  function handleToggleProductLink(productId: string) {
    setLinkSelectedProducts(prev =>
      prev.includes(productId) ? prev.filter(id => id !== productId) : [...prev, productId]
    );
  }

  function handleSaveLinks() {
    const allProductIds = products.map(p => p.id);
    for (const pid of allProductIds) {
      const currentLinks = productModifierLinks[pid] || [];
      const isLinked = linkSelectedProducts.includes(pid);
      const wasLinked = currentLinks.includes(linkGroupId);
      if (isLinked && !wasLinked) {
        setProductModifierGroups(pid, [...currentLinks, linkGroupId]);
      } else if (!isLinked && wasLinked) {
        setProductModifierGroups(pid, currentLinks.filter(g => g !== linkGroupId));
      }
    }
    toast({ title: "Product links updated" });
    setLinkDialogOpen(false);
  }

  function parseScaleFactor(sf: string | null): Record<string, number> | null {
    if (!sf) return null;
    try { return JSON.parse(sf); } catch { return null; }
  }

  function parseScaleFactorsJson(sf: string | null): Record<string, Record<string, number>> | null {
    if (!sf) return null;
    try { return JSON.parse(sf); } catch { return null; }
  }

  function openScaleDialog(productId: string, groupId: string) {
    setScaleProductId(productId);
    setScaleGroupId(groupId);
    const key = `${productId}::${groupId}`;
    const existing = parseScaleFactorsJson(productModifierScaleFactors[key] || null);
    const groupMods = modifiers.filter(m => m.modifierGroupId === groupId);
    const productVariants = variants.filter(v => v.productId === productId);
    const formData: Record<string, Record<string, string>> = {};
    for (const mod of groupMods) {
      formData[mod.id] = {};
      for (const v of productVariants) {
        formData[mod.id][v.name] = existing?.[mod.id]?.[v.name]?.toString() ?? "1";
      }
    }
    setScaleFormData(formData);
    setScaleDialogOpen(true);
  }

  function handleSaveScaleFactors() {
    const result: Record<string, Record<string, number>> = {};
    let hasAnyNonDefault = false;
    for (const [modId, sizeMap] of Object.entries(scaleFormData)) {
      result[modId] = {};
      for (const [sizeName, val] of Object.entries(sizeMap)) {
        const num = parseFloat(val);
        if (Number.isFinite(num) && num >= 0) {
          result[modId][sizeName] = num;
          if (num !== 1) hasAnyNonDefault = true;
        } else {
          result[modId][sizeName] = 1;
        }
      }
    }
    setProductModifierScaleFactors(
      scaleProductId,
      scaleGroupId,
      hasAnyNonDefault || Object.keys(result).length > 0 ? JSON.stringify(result) : null
    );
    toast({ title: "Scale factors saved" });
    setScaleDialogOpen(false);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold" data-testid="text-modifiers-title">Modifier Groups</h2>
          <p className="text-sm text-muted-foreground">Manage modifier groups, options, pricing, and product assignments</p>
        </div>
        <Button onClick={openCreateGroup} data-testid="button-create-modifier-group">
          <Plus className="h-4 w-4 mr-1" /> New Group
        </Button>
      </div>

      {modifierGroups.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground" data-testid="text-no-modifier-groups">No modifier groups yet. Create one to get started.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {modifierGroups.map(group => {
            const isExpanded = expandedGroupId === group.id;
            const groupModifiers = getModifiersForGroup(group.id);
            const linkedProducts = productLinksForGroup[group.id] || [];

            return (
              <Card key={group.id} data-testid={`card-modifier-group-${group.id}`}>
                <CardHeader className="py-4 px-5">
                  <div className="flex items-center justify-between">
                    <div
                      className="flex items-center gap-2 cursor-pointer flex-1"
                      onClick={() => setExpandedGroupId(isExpanded ? null : group.id)}
                      data-testid={`button-toggle-group-${group.id}`}
                    >
                      {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      <CardTitle className="text-base" data-testid={`text-group-name-${group.id}`}>{group.name}</CardTitle>
                      <Badge variant="outline" data-testid={`text-group-selections-${group.id}`}>
                        {group.minSelections === 0 && group.maxSelections === 0
                          ? "Unlimited"
                          : `${group.minSelections}–${group.maxSelections || "∞"}`}
                      </Badge>
                      <Badge variant="secondary" data-testid={`text-group-option-count-${group.id}`}>
                        {groupModifiers.length} option{groupModifiers.length !== 1 ? "s" : ""}
                      </Badge>
                      {linkedProducts.length > 0 && (
                        <Badge variant="secondary" data-testid={`text-group-linked-count-${group.id}`}>
                          <Link2 className="h-3 w-3 mr-1" />
                          {linkedProducts.length} product{linkedProducts.length !== 1 ? "s" : ""}
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openLinkDialog(group.id)} data-testid={`button-link-group-${group.id}`}>
                        <Link2 className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => openEditGroup(group)} data-testid={`button-edit-group-${group.id}`}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => setDeleteTarget({ type: "group", id: group.id, name: group.name })} data-testid={`button-delete-group-${group.id}`}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  {linkedProducts.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2 ml-6">
                      {linkedProducts.map(pid => {
                        const p = products.find(pp => pp.id === pid);
                        const pVariants = variants.filter(v => v.productId === pid);
                        const sfKey = `${pid}::${group.id}`;
                        const hasSf = !!productModifierScaleFactors[sfKey];
                        return p ? (
                          <div key={pid} className="flex items-center gap-0.5">
                            <Badge variant="outline" className="text-xs" data-testid={`badge-linked-product-${pid}`}>
                              {p.name}
                            </Badge>
                            {pVariants.length > 1 && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className={`h-5 w-5 ${hasSf ? "text-primary" : "text-muted-foreground"}`}
                                onClick={(e) => { e.stopPropagation(); openScaleDialog(pid, group.id); }}
                                title="Configure size pricing multipliers"
                                data-testid={`button-scale-factors-${pid}-${group.id}`}
                              >
                                <Sliders className="h-3 w-3" />
                              </Button>
                            )}
                          </div>
                        ) : null;
                      })}
                    </div>
                  )}
                </CardHeader>

                {isExpanded && (
                  <CardContent className="pt-0 px-5 pb-4">
                    <Separator className="mb-4" />
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-medium">Modifier Options</h3>
                      <Button size="sm" variant="outline" onClick={() => openCreateModifier(group.id)} data-testid={`button-add-modifier-${group.id}`}>
                        <Plus className="h-3 w-3 mr-1" /> Add Option
                      </Button>
                    </div>

                    {groupModifiers.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-4 text-center" data-testid={`text-no-modifiers-${group.id}`}>
                        No options yet. Add one above.
                      </p>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Name</TableHead>
                            <TableHead>Upcharge</TableHead>
                            <TableHead>Ingredient</TableHead>
                            <TableHead className="w-[100px]">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {groupModifiers.map(mod => {
                            const invItem = mod.inventoryItemId ? inventory.find(i => i.id === mod.inventoryItemId) : null;
                            return (
                              <TableRow key={mod.id} data-testid={`row-modifier-${mod.id}`}>
                                <TableCell data-testid={`text-modifier-name-${mod.id}`}>{mod.name}</TableCell>
                                <TableCell data-testid={`text-modifier-upcharge-${mod.id}`}>
                                  <span className="flex items-center gap-1">
                                    <DollarSign className="h-3 w-3 text-muted-foreground" />
                                    {formatMoney(mod.baseUpcharge)}
                                  </span>
                                </TableCell>
                                <TableCell data-testid={`text-modifier-ingredient-${mod.id}`}>
                                  {invItem ? (
                                    <div className="text-xs">
                                      <span className="font-medium">{invItem.name}</span>
                                      <span className="text-muted-foreground ml-1">({mod.quantityPerUse} {invItem.unitOfMeasure})</span>
                                    </div>
                                  ) : (
                                    <span className="text-muted-foreground text-xs">—</span>
                                  )}
                                </TableCell>
                                <TableCell>
                                  <div className="flex gap-1">
                                    <Button variant="ghost" size="icon" onClick={() => openEditModifier(mod)} data-testid={`button-edit-modifier-${mod.id}`}>
                                      <Pencil className="h-3 w-3" />
                                    </Button>
                                    <Button variant="ghost" size="icon" onClick={() => setDeleteTarget({ type: "modifier", id: mod.id, name: mod.name })} data-testid={`button-delete-modifier-${mod.id}`}>
                                      <Trash2 className="h-3 w-3" />
                                    </Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    )}
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={groupDialogOpen} onOpenChange={setGroupDialogOpen}>
        <DialogContent data-testid="dialog-modifier-group">
          <DialogHeader>
            <DialogTitle>{editingGroup ? "Edit Modifier Group" : "New Modifier Group"}</DialogTitle>
            <DialogDescription>
              {editingGroup ? "Update the modifier group details below." : "Create a new modifier group with selection rules."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="group-name">Group Name</Label>
              <Input
                id="group-name"
                value={groupForm.name}
                onChange={e => setGroupForm(f => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Toppings, Size Add-Ons"
                data-testid="input-group-name"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="min-selections">Min Selections</Label>
                <Input
                  id="min-selections"
                  type="number"
                  min={0}
                  value={groupForm.minSelections}
                  onChange={e => setGroupForm(f => ({ ...f, minSelections: parseInt(e.target.value) || 0 }))}
                  data-testid="input-min-selections"
                />
                <p className="text-xs text-muted-foreground mt-1">0 = optional</p>
              </div>
              <div>
                <Label htmlFor="max-selections">Max Selections</Label>
                <Input
                  id="max-selections"
                  type="number"
                  min={0}
                  value={groupForm.maxSelections}
                  onChange={e => setGroupForm(f => ({ ...f, maxSelections: parseInt(e.target.value) || 0 }))}
                  data-testid="input-max-selections"
                />
                <p className="text-xs text-muted-foreground mt-1">0 = unlimited</p>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGroupDialogOpen(false)} data-testid="button-cancel-group">Cancel</Button>
            <Button onClick={handleSaveGroup} data-testid="button-save-group">
              {editingGroup ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={modifierDialogOpen} onOpenChange={setModifierDialogOpen}>
        <DialogContent data-testid="dialog-modifier">
          <DialogHeader>
            <DialogTitle>{editingModifier ? "Edit Modifier Option" : "New Modifier Option"}</DialogTitle>
            <DialogDescription>
              {editingModifier ? "Update the modifier option details below." : "Add a new option with pricing to this group."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="modifier-name">Option Name</Label>
              <Input
                id="modifier-name"
                value={modifierForm.name}
                onChange={e => setModifierForm(f => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Extra Cheese, Whipped Cream"
                data-testid="input-modifier-name"
              />
            </div>
            <div>
              <Label htmlFor="modifier-upcharge">Base Upcharge ($)</Label>
              <Input
                id="modifier-upcharge"
                type="number"
                step="0.01"
                min="0"
                value={modifierForm.baseUpcharge}
                onChange={e => setModifierForm(f => ({ ...f, baseUpcharge: e.target.value }))}
                placeholder="0.00"
                data-testid="input-modifier-upcharge"
              />
              <p className="text-xs text-muted-foreground mt-1">Price adjustment in dollars (e.g., 0.50 = $0.50)</p>
            </div>
            <Separator />
            <div>
              <Label className="text-sm font-medium mb-2 block">Ingredient Consumed</Label>
              <p className="text-xs text-muted-foreground mb-3">Assign an inventory item that gets deducted each time this modifier is sold.</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="modifier-ingredient" className="text-xs text-muted-foreground">Inventory Item</Label>
                  <select
                    id="modifier-ingredient"
                    value={modifierForm.inventoryItemId}
                    onChange={e => setModifierForm(f => ({ ...f, inventoryItemId: e.target.value }))}
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring mt-1"
                    data-testid="select-modifier-ingredient"
                  >
                    <option value="">None</option>
                    {inventory.map(item => (
                      <option key={item.id} value={item.id}>{item.name} ({item.unitOfMeasure})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label htmlFor="modifier-qty" className="text-xs text-muted-foreground">Qty Per Use</Label>
                  <Input
                    id="modifier-qty"
                    type="number"
                    step="0.01"
                    min="0"
                    value={modifierForm.quantityPerUse}
                    onChange={e => setModifierForm(f => ({ ...f, quantityPerUse: e.target.value }))}
                    placeholder="1.0"
                    className="mt-1"
                    disabled={!modifierForm.inventoryItemId}
                    data-testid="input-modifier-qty"
                  />
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModifierDialogOpen(false)} data-testid="button-cancel-modifier">Cancel</Button>
            <Button onClick={handleSaveModifier} data-testid="button-save-modifier">
              {editingModifier ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={linkDialogOpen} onOpenChange={setLinkDialogOpen}>
        <DialogContent className="max-w-md" data-testid="dialog-link-products">
          <DialogHeader>
            <DialogTitle>Link Products</DialogTitle>
            <DialogDescription>
              Select which products this modifier group applies to. After linking, use the slider icon next to each product to configure size-specific pricing multipliers.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[300px] overflow-y-auto space-y-2">
            {products.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No products available</p>
            ) : (
              products.map(p => (
                <label
                  key={p.id}
                  className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted cursor-pointer"
                  data-testid={`checkbox-link-product-${p.id}`}
                >
                  <input
                    type="checkbox"
                    checked={linkSelectedProducts.includes(p.id)}
                    onChange={() => handleToggleProductLink(p.id)}
                    className="rounded"
                  />
                  <span className="text-sm">{p.name}</span>
                  <Badge variant="outline" className="text-xs ml-auto">{p.type}</Badge>
                </label>
              ))
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLinkDialogOpen(false)} data-testid="button-cancel-link">Cancel</Button>
            <Button onClick={handleSaveLinks} data-testid="button-save-links">Save Links</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={scaleDialogOpen} onOpenChange={setScaleDialogOpen}>
        <DialogContent className="sm:max-w-[600px]" data-testid="dialog-scale-factors">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sliders className="h-5 w-5" />
              Size Pricing Multipliers
            </DialogTitle>
            <DialogDescription>
              Set how modifier upcharges scale for each size of{" "}
              <span className="font-medium">{products.find(p => p.id === scaleProductId)?.name}</span>.
              A multiplier of 1 means the base upcharge, 2 means double, etc.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[400px] overflow-auto">
            {(() => {
              const productVars = variants.filter(v => v.productId === scaleProductId);
              const groupMods = modifiers.filter(m => m.modifierGroupId === scaleGroupId);
              if (groupMods.length === 0) {
                return <p className="text-sm text-muted-foreground text-center py-4">No modifier options in this group yet.</p>;
              }
              return (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs sticky left-0 bg-background">Modifier</TableHead>
                      {productVars.map(v => (
                        <TableHead key={v.id} className="text-xs text-center">{v.name}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {groupMods.map(mod => (
                      <TableRow key={mod.id} data-testid={`row-scale-mod-${mod.id}`}>
                        <TableCell className="text-sm font-medium sticky left-0 bg-background">
                          <div>
                            {mod.name}
                            <span className="text-xs text-muted-foreground ml-1">({formatMoney(mod.baseUpcharge)})</span>
                          </div>
                        </TableCell>
                        {productVars.map(v => (
                          <TableCell key={v.id} className="py-1.5 px-2">
                            <Input
                              value={scaleFormData[mod.id]?.[v.name] ?? "1"}
                              onChange={e => {
                                setScaleFormData(prev => ({
                                  ...prev,
                                  [mod.id]: { ...(prev[mod.id] || {}), [v.name]: e.target.value },
                                }));
                              }}
                              type="number"
                              step="0.1"
                              min="0"
                              className="h-8 text-sm text-center w-20"
                              data-testid={`input-scale-${mod.id}-${v.id}`}
                            />
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              );
            })()}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setScaleDialogOpen(false)} data-testid="button-cancel-scale">Cancel</Button>
            <Button onClick={handleSaveScaleFactors} data-testid="button-save-scale">Save Multipliers</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent data-testid="dialog-confirm-delete">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteTarget?.type === "group" ? "Modifier Group" : "Modifier Option"}?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deleteTarget?.name}"?
              {deleteTarget?.type === "group" && " This will also delete all options within this group."}
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} data-testid="button-confirm-delete">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
