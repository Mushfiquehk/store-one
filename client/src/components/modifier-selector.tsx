import { useState, useMemo } from "react";
import { Check, Minus, Plus, ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { type Product, type Variant, type ModifierGroup, type Modifier } from "@/lib/store";

function formatMoney(cents: number) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(cents / 100);
}

export type SelectedModifier = {
  modifierId: string;
  qty: number;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: Product;
  variants: Variant[];
  modifierGroups: ModifierGroup[];
  modifiers: Modifier[];
  linkedGroupIds: string[];
  onAddToCart: (variantId: string, modifiers: SelectedModifier[]) => void;
};

export default function ModifierSelector({
  open,
  onOpenChange,
  product,
  variants,
  modifierGroups,
  modifiers,
  linkedGroupIds,
  onAddToCart,
}: Props) {
  const [selectedVariantId, setSelectedVariantId] = useState<string>("");
  const [selections, setSelections] = useState<Record<string, number>>({});

  const productVariants = variants.filter(v => v.productId === product.id);

  const activeVariantId = selectedVariantId || (productVariants.length === 1 ? productVariants[0].id : "");
  const activeVariant = productVariants.find(v => v.id === activeVariantId);

  const groups = useMemo(() =>
    modifierGroups.filter(g => linkedGroupIds.includes(g.id)),
    [modifierGroups, linkedGroupIds]
  );

  const modifiersByGroup = useMemo(() => {
    const map: Record<string, Modifier[]> = {};
    for (const g of groups) {
      map[g.id] = modifiers.filter(m => m.modifierGroupId === g.id);
    }
    return map;
  }, [groups, modifiers]);

  function getModifierPrice(mod: Modifier): number {
    if (!activeVariant || !mod.scaleFactor) return mod.baseUpcharge;
    try {
      const sf: Record<string, number> = JSON.parse(mod.scaleFactor);
      const variantName = activeVariant.name;
      if (sf[variantName] !== undefined) {
        return Math.round(mod.baseUpcharge * sf[variantName]);
      }
      const variantId = activeVariant.id;
      if (sf[variantId] !== undefined) {
        return Math.round(mod.baseUpcharge * sf[variantId]);
      }
    } catch {}
    return mod.baseUpcharge;
  }

  function getSelectionCount(groupId: string): number {
    const groupMods = modifiersByGroup[groupId] || [];
    return groupMods.reduce((sum, m) => sum + (selections[m.id] || 0), 0);
  }

  function isGroupValid(group: ModifierGroup): boolean {
    const count = getSelectionCount(group.id);
    if (group.minSelections > 0 && count < group.minSelections) return false;
    return true;
  }

  function canAddMore(group: ModifierGroup): boolean {
    if (group.maxSelections === 0) return true;
    return getSelectionCount(group.id) < group.maxSelections;
  }

  const allGroupsValid = groups.every(isGroupValid);
  const hasVariant = !!activeVariantId;
  const canAdd = allGroupsValid && hasVariant;

  function toggleModifier(modId: string, groupId: string) {
    const group = groups.find(g => g.id === groupId);
    if (!group) return;
    const current = selections[modId] || 0;
    if (current > 0) {
      setSelections(prev => ({ ...prev, [modId]: 0 }));
    } else if (canAddMore(group)) {
      setSelections(prev => ({ ...prev, [modId]: 1 }));
    }
  }

  function incrementModifier(modId: string, groupId: string) {
    const group = groups.find(g => g.id === groupId);
    if (!group || !canAddMore(group)) return;
    setSelections(prev => ({ ...prev, [modId]: (prev[modId] || 0) + 1 }));
  }

  function decrementModifier(modId: string) {
    setSelections(prev => {
      const val = (prev[modId] || 0) - 1;
      return { ...prev, [modId]: Math.max(0, val) };
    });
  }

  const modifierTotalCents = useMemo(() => {
    let total = 0;
    for (const [modId, qty] of Object.entries(selections)) {
      if (qty <= 0) continue;
      const mod = modifiers.find(m => m.id === modId);
      if (mod) {
        total += getModifierPrice(mod) * qty;
      }
    }
    return total;
  }, [selections, activeVariantId, modifiers]);

  const itemTotal = (activeVariant?.basePrice ?? 0) + modifierTotalCents;

  function handleAdd() {
    if (!canAdd) return;
    const selectedMods: SelectedModifier[] = [];
    for (const [modId, qty] of Object.entries(selections)) {
      if (qty > 0) {
        selectedMods.push({ modifierId: modId, qty });
      }
    }
    onAddToCart(activeVariantId, selectedMods);
    setSelections({});
    setSelectedVariantId("");
    onOpenChange(false);
  }

  function handleOpenChange(val: boolean) {
    if (!val) {
      setSelections({});
      setSelectedVariantId("");
    }
    onOpenChange(val);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] flex flex-col" data-testid="dialog-modifier-selector">
        <DialogHeader>
          <DialogTitle data-testid="text-modifier-selector-title">{product.name}</DialogTitle>
          <DialogDescription>Customize your order</DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-5 py-2">
          {productVariants.length > 1 && (
            <div>
              <h3 className="text-sm font-semibold mb-2" data-testid="text-variant-section-title">
                Select Size / Variant
                <span className="text-destructive ml-1">*</span>
              </h3>
              <div className="grid grid-cols-2 gap-2">
                {productVariants.map(v => (
                  <Button
                    key={v.id}
                    variant={activeVariantId === v.id ? "default" : "outline"}
                    className="h-auto flex-col items-start gap-0.5 p-3 rounded-xl"
                    onClick={() => setSelectedVariantId(v.id)}
                    data-testid={`button-select-variant-${v.id}`}
                  >
                    <span className="font-medium">{v.name}</span>
                    <span className="text-xs opacity-80">{formatMoney(v.basePrice)}</span>
                  </Button>
                ))}
              </div>
            </div>
          )}

          {groups.map(group => {
            const groupMods = modifiersByGroup[group.id] || [];
            const count = getSelectionCount(group.id);
            const valid = isGroupValid(group);
            const maxReached = group.maxSelections > 0 && count >= group.maxSelections;

            return (
              <div key={group.id} data-testid={`section-modifier-group-${group.id}`}>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold" data-testid={`text-group-title-${group.id}`}>
                    {group.name}
                    {group.minSelections > 0 && <span className="text-destructive ml-1">*</span>}
                  </h3>
                  <div className="flex items-center gap-1.5">
                    <Badge
                      variant={!valid ? "destructive" : maxReached ? "default" : "outline"}
                      className="text-[10px]"
                      data-testid={`badge-group-status-${group.id}`}
                    >
                      {count} / {group.maxSelections === 0 ? "∞" : group.maxSelections}
                      {group.minSelections > 0 && ` (min ${group.minSelections})`}
                    </Badge>
                  </div>
                </div>

                <div className="space-y-1">
                  {groupMods.map(mod => {
                    const qty = selections[mod.id] || 0;
                    const price = getModifierPrice(mod);
                    const isSelected = qty > 0;
                    const canInc = canAddMore(group);

                    return (
                      <div
                        key={mod.id}
                        className={`flex items-center justify-between p-2.5 rounded-lg border transition-colors cursor-pointer ${
                          isSelected
                            ? "border-primary/50 bg-primary/5"
                            : "border-border hover:bg-muted/50"
                        } ${!canInc && !isSelected ? "opacity-50" : ""}`}
                        onClick={() => toggleModifier(mod.id, group.id)}
                        data-testid={`modifier-option-${mod.id}`}
                      >
                        <div className="flex items-center gap-2">
                          <div
                            className={`h-5 w-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                              isSelected
                                ? "border-primary bg-primary text-primary-foreground"
                                : "border-muted-foreground/30"
                            }`}
                          >
                            {isSelected && <Check className="h-3 w-3" />}
                          </div>
                          <span className="text-sm font-medium" data-testid={`text-modifier-option-name-${mod.id}`}>
                            {mod.name}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          {price > 0 && (
                            <span className="text-xs text-muted-foreground" data-testid={`text-modifier-option-price-${mod.id}`}>
                              +{formatMoney(price)}
                            </span>
                          )}
                          {isSelected && (
                            <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-6 w-6 p-0 rounded-full"
                                onClick={() => decrementModifier(mod.id)}
                                data-testid={`button-dec-modifier-${mod.id}`}
                              >
                                <Minus className="h-3 w-3" />
                              </Button>
                              <span className="w-5 text-center text-xs font-medium" data-testid={`text-modifier-qty-${mod.id}`}>{qty}</span>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-6 w-6 p-0 rounded-full"
                                onClick={() => incrementModifier(mod.id, group.id)}
                                disabled={!canInc}
                                data-testid={`button-inc-modifier-${mod.id}`}
                              >
                                <Plus className="h-3 w-3" />
                              </Button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        <Separator />

        <div className="rounded-xl bg-muted/30 p-3 border border-border/50 text-sm space-y-1">
          <div className="flex justify-between text-muted-foreground">
            <span>Base price</span>
            <span>{formatMoney(activeVariant?.basePrice ?? 0)}</span>
          </div>
          {modifierTotalCents > 0 && (
            <div className="flex justify-between text-muted-foreground">
              <span>Modifiers</span>
              <span>+{formatMoney(modifierTotalCents)}</span>
            </div>
          )}
          <Separator className="my-1" />
          <div className="flex justify-between font-medium text-base">
            <span>Item total</span>
            <span data-testid="text-modifier-item-total">{formatMoney(itemTotal)}</span>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} data-testid="button-cancel-modifiers">
            Cancel
          </Button>
          <Button
            onClick={handleAdd}
            disabled={!canAdd}
            className="rounded-2xl px-6"
            data-testid="button-add-with-modifiers"
          >
            <ShoppingCart className="h-4 w-4 mr-1" />
            Add to Cart {formatMoney(itemTotal)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
