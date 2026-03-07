import { useState, useMemo } from "react";
import { Check, ChevronRight, ChevronLeft, Package, ChefHat, Plus, Trash2, Search, X, Info, ArrowRightLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useStore } from "@/lib/store";

function uid(prefix: string) {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now()}`;
}

function formatMoney(cents: number) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(cents / 100);
}

type WizardVariant = {
  tempId: string;
  name: string;
  sku: string;
  basePrice: string;
};

type WizardModifierGroup = {
  tempId: string;
  groupId: string;
  isNew: boolean;
  newName: string;
  newMin: string;
  newMax: string;
  productMin: string;
  productMax: string;
  modifierPrices: Record<string, string>;
  overrideInventoryItemId: string;
};

type WizardBomEntry = {
  tempId: string;
  variantTempId: string;
  inventoryItemId: string;
  quantity: string;
  overrideModifierGroupId?: string;
};

const STEPS_RETAIL = ["Item Type", "Review & Create"];
const STEPS_PREPARED = ["Item Type", "Variants", "Recipes", "Modifiers", "Review & Create"];

export default function ProductWizard({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { toast } = useToast();
  const {
    products,
    modifierGroups,
    modifiers,
    inventory,
    addProduct,
    addVariant,
    addInventoryItem,
    addBom,
    addModifierGroup,
    addModifier,
    setProductModifierGroups,
    setProductModifierScaleFactors,
    updateProductModifierGroupSettings,
  } = useStore();

  const [step, setStep] = useState(0);
  const [itemType, setItemType] = useState<"RETAIL" | "PREPARED" | null>(null);

  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [price, setPrice] = useState("");
  const [tags, setTags] = useState("");

  const [wizardVariants, setWizardVariants] = useState<WizardVariant[]>([
    { tempId: uid("tmp"), name: "Small", sku: "", basePrice: "" },
    { tempId: uid("tmp"), name: "Medium", sku: "", basePrice: "" },
    { tempId: uid("tmp"), name: "Large", sku: "", basePrice: "" },
  ]);

  const [wizardModGroups, setWizardModGroups] = useState<WizardModifierGroup[]>([]);
  const [modifierSizeQtys, setModifierSizeQtys] = useState<Record<string, Record<string, string>>>({});
  const [wizardScaleFactors, setWizardScaleFactors] = useState<Record<string, Record<string, Record<string, string>>>>({});
  const [wizardBom, setWizardBom] = useState<WizardBomEntry[]>([]);
  const [bomSearch, setBomSearch] = useState("");
  const [selectedBomVariant, setSelectedBomVariant] = useState<string | null>(null);
  const [autoScaleBase, setAutoScaleBase] = useState<string | null>(null);
  const [autoScalePercents, setAutoScalePercents] = useState<Record<string, string>>({});

  const isRetail = itemType === "RETAIL";
  const steps = isRetail ? STEPS_RETAIL : STEPS_PREPARED;
  const totalSteps = steps.length;

  function resetWizard() {
    setStep(0);
    setItemType(null);
    setName("");
    setSku("");
    setPrice("");
    setTags("");
    setWizardVariants([
      { tempId: uid("tmp"), name: "Small", sku: "", basePrice: "" },
      { tempId: uid("tmp"), name: "Medium", sku: "", basePrice: "" },
      { tempId: uid("tmp"), name: "Large", sku: "", basePrice: "" },
    ]);
    setWizardModGroups([]);
    setModifierSizeQtys({});
    setWizardScaleFactors({});
    setWizardBom([]);
    setBomSearch("");
    setSelectedBomVariant(null);
    setAutoScaleBase(null);
    setAutoScalePercents({});
  }

  function handleClose() {
    resetWizard();
    onOpenChange(false);
  }

  function canAdvance(): boolean {
    if (step === 0) {
      if (!itemType) return false;
      if (!name.trim()) return false;
      if (isRetail) {
        const p = Number(price);
        if (!Number.isFinite(p) || p <= 0) return false;
      }
      return true;
    }
    if (!isRetail) {
      if (step === 1) {
        return wizardVariants.length > 0 && wizardVariants.every(v => v.name.trim() && Number(v.basePrice) > 0);
      }
    }
    return true;
  }

  function handleNext() {
    if (!canAdvance()) {
      toast({ title: "Please fill in all required fields" });
      return;
    }
    if (step < totalSteps - 1) {
      const nextStep = step + 1;
      setStep(nextStep);
      if (!isRetail && nextStep === 2 && wizardVariants.length > 0 && !selectedBomVariant) {
        setSelectedBomVariant(wizardVariants[0].tempId);
      }
    }
  }

  function handleBack() {
    if (step > 0) setStep(step - 1);
  }

  function handleCreate() {
    const productId = uid("prod");
    const tagList = tags.split(",").map(t => t.trim()).filter(Boolean);

    if (isRetail) {
      const variantId = uid("var");
      const invItemId = uid("inv");
      addProduct({
        id: productId,
        name: name.trim(),
        type: "RETAIL",
        isComposite: false,
        attributes: JSON.stringify({ tax_exempt: false, tags: tagList }),
      });
      addInventoryItem({
        id: invItemId,
        name: name.trim(),
        unitOfMeasure: "each",
        currentQuantity: 0,
        trackingConfig: JSON.stringify({ low_stock_alert: 10 }),
      });
      addVariant({
        id: variantId,
        productId,
        sku: sku.trim() || null,
        name: "Default",
        basePrice: Math.round(Number(price) * 100),
        directInventoryId: invItemId,
        config: null,
      });
      toast({ title: "Product created", description: `Retail item "${name.trim()}" added successfully` });
    } else {
      addProduct({
        id: productId,
        name: name.trim(),
        type: "RESTAURANT",
        isComposite: true,
        attributes: JSON.stringify({ tax_exempt: false, tags: tagList }),
      });

      const variantIdMap: Record<string, string> = {};
      wizardVariants.forEach(wv => {
        const variantId = uid("var");
        variantIdMap[wv.tempId] = variantId;
        addVariant({
          id: variantId,
          productId,
          sku: wv.sku.trim() || null,
          name: wv.name.trim(),
          basePrice: Math.round(Number(wv.basePrice) * 100),
          config: null,
        });
      });

      const linkedGroupIds: string[] = [];
      const tempIdToGroupId: Record<string, string> = {};
      wizardModGroups.forEach(wmg => {
        if (wmg.isNew && wmg.newName.trim()) {
          const groupId = uid("mg");
          addModifierGroup({
            id: groupId,
            name: wmg.newName.trim(),
            minSelections: Number(wmg.newMin) || 0,
            maxSelections: Number(wmg.newMax) || 0,
          });
          linkedGroupIds.push(groupId);
          tempIdToGroupId[wmg.tempId] = groupId;
        } else if (!wmg.isNew && wmg.groupId) {
          linkedGroupIds.push(wmg.groupId);
          tempIdToGroupId[wmg.tempId] = wmg.groupId;
        }
      });

      if (linkedGroupIds.length > 0) {
        setTimeout(() => {
          setProductModifierGroups(productId, linkedGroupIds);

          setTimeout(() => {
            wizardModGroups.forEach(wmg => {
              const groupId = tempIdToGroupId[wmg.tempId];
              if (!groupId) return;
              const groupScaleData = wizardScaleFactors[wmg.tempId];
              if (groupScaleData) {
                const scaleFactorsObj: Record<string, Record<string, number>> = {};
                Object.entries(groupScaleData).forEach(([modId, sizeMap]) => {
                  const numMap: Record<string, number> = {};
                  Object.entries(sizeMap).forEach(([sizeName, val]) => {
                    const num = Number(val);
                    if (Number.isFinite(num) && num > 0) {
                      numMap[sizeName] = num;
                    }
                  });
                  if (Object.keys(numMap).length > 0) {
                    scaleFactorsObj[modId] = numMap;
                  }
                });
                if (Object.keys(scaleFactorsObj).length > 0) {
                  setProductModifierScaleFactors(productId, groupId, JSON.stringify(scaleFactorsObj));
                }
              }

              const settingsData: any = {};
              const pMin = wmg.isNew ? Number(wmg.newMin) || 0 : Number(wmg.productMin);
              const pMax = wmg.isNew ? Number(wmg.newMax) || 0 : Number(wmg.productMax);
              if (pMin > 0 || !wmg.isNew) settingsData.minSelections = pMin || 0;
              if (pMax > 0 || !wmg.isNew) settingsData.maxSelections = pMax || 0;

              const pricesObj: Record<string, number> = {};
              Object.entries(wmg.modifierPrices || {}).forEach(([modId, val]) => {
                const cents = Math.round(Number(val) * 100);
                if (Number.isFinite(cents) && cents >= 0) pricesObj[modId] = cents;
              });
              if (Object.keys(pricesObj).length > 0) settingsData.modifierPrices = JSON.stringify(pricesObj);

              if (wmg.overrideInventoryItemId) settingsData.overrideInventoryItemId = wmg.overrideInventoryItemId;

              if (Object.keys(settingsData).length > 0) {
                updateProductModifierGroupSettings(productId, groupId, settingsData);
              }
            });
          }, 300);
        }, 200);
      }

      wizardBom.forEach(wb => {
        const realVariantId = variantIdMap[wb.variantTempId];
        if (realVariantId && wb.inventoryItemId && Number(wb.quantity) > 0) {
          const bomData: any = {
            id: uid("bom"),
            sourceType: "VARIANT",
            sourceId: realVariantId,
            inventoryItemId: wb.inventoryItemId,
            quantityDeducted: Number(wb.quantity),
          };
          if (wb.overrideModifierGroupId) {
            const resolvedGroupId = tempIdToGroupId[wb.overrideModifierGroupId] || wb.overrideModifierGroupId;
            if (resolvedGroupId) bomData.overrideModifierGroupId = resolvedGroupId;
          }
          addBom(bomData);
        }
      });

      Object.entries(modifierSizeQtys).forEach(([modId, sizeMap]) => {
        const mod = modifiers.find(m => m.id === modId);
        if (!mod?.inventoryItemId) return;
        const hasAnyQty = Object.values(sizeMap).some(v => Number(v) > 0);
        if (!hasAnyQty) return;
        const matrix: Record<string, number> = {};
        wizardVariants.forEach(wv => {
          const qty = Number(sizeMap[wv.name] || 0);
          if (qty > 0) matrix[wv.name] = qty;
        });
        addBom({
          id: uid("bom"),
          sourceType: "MODIFIER",
          sourceId: modId,
          inventoryItemId: mod.inventoryItemId,
          quantityDeducted: 1,
          scaleFactorMatrix: JSON.stringify(matrix),
        });
      });

      toast({ title: "Product created", description: `Prepared item "${name.trim()}" with ${wizardVariants.length} variant(s) added` });
    }

    handleClose();
  }

  function addVariantRow() {
    setWizardVariants(prev => [...prev, { tempId: uid("tmp"), name: "", sku: "", basePrice: "" }]);
  }

  function removeVariantRow(tempId: string) {
    setWizardVariants(prev => prev.filter(v => v.tempId !== tempId));
    setWizardBom(prev => prev.filter(b => b.variantTempId !== tempId));
  }

  function updateVariantRow(tempId: string, field: keyof WizardVariant, value: string) {
    setWizardVariants(prev => prev.map(v => v.tempId === tempId ? { ...v, [field]: value } : v));
  }

  function addModGroupRow() {
    setWizardModGroups(prev => [...prev, {
      tempId: uid("tmp"),
      groupId: "",
      isNew: true,
      newName: "",
      newMin: "0",
      newMax: "5",
      productMin: "",
      productMax: "",
      modifierPrices: {},
      overrideInventoryItemId: "",
    }]);
  }

  function removeModGroupRow(tempId: string) {
    setWizardModGroups(prev => prev.filter(m => m.tempId !== tempId));
  }

  function updateModGroupRow(tempId: string, updates: Partial<WizardModifierGroup>) {
    setWizardModGroups(prev => prev.map(m => m.tempId === tempId ? { ...m, ...updates } : m));
  }

  function updateModSizeQty(modifierId: string, variantName: string, value: string) {
    setModifierSizeQtys(prev => ({
      ...prev,
      [modifierId]: { ...(prev[modifierId] || {}), [variantName]: value },
    }));
  }

  function updateWizardScaleFactor(groupTempId: string, modifierId: string, variantName: string, value: string) {
    setWizardScaleFactors(prev => ({
      ...prev,
      [groupTempId]: {
        ...(prev[groupTempId] || {}),
        [modifierId]: {
          ...((prev[groupTempId] || {})[modifierId] || {}),
          [variantName]: value,
        },
      },
    }));
  }

  function getResolvedGroupId(wmg: WizardModifierGroup): string | null {
    return wmg.isNew ? null : wmg.groupId || null;
  }

  function getGroupModifiers(wmg: WizardModifierGroup): typeof modifiers {
    const gid = getResolvedGroupId(wmg);
    if (!gid) return [];
    return modifiers.filter(m => m.modifierGroupId === gid);
  }

  function updateBomOverride(tempId: string, overrideGroupTempId: string | undefined) {
    setWizardBom(prev => prev.map(b => b.tempId === tempId ? { ...b, overrideModifierGroupId: overrideGroupTempId } : b));
  }

  function addBomEntry(variantTempId: string, inventoryItemId: string) {
    const exists = wizardBom.find(b => b.variantTempId === variantTempId && b.inventoryItemId === inventoryItemId);
    if (exists) return;
    setWizardBom(prev => [...prev, {
      tempId: uid("tmp"),
      variantTempId,
      inventoryItemId,
      quantity: "1",
    }]);
  }

  function removeBomEntry(tempId: string) {
    setWizardBom(prev => prev.filter(b => b.tempId !== tempId));
  }

  function updateBomQty(tempId: string, qty: string) {
    setWizardBom(prev => prev.map(b => b.tempId === tempId ? { ...b, quantity: qty } : b));
  }

  function applyAutoScale() {
    if (!autoScaleBase) return;
    const baseBom = wizardBom.filter(b => b.variantTempId === autoScaleBase);
    if (baseBom.length === 0) return;

    const newBom = [...wizardBom];
    wizardVariants.forEach(wv => {
      if (wv.tempId === autoScaleBase) return;
      const pct = Number(autoScalePercents[wv.tempId] || "100") / 100;
      baseBom.forEach(bb => {
        const existingIdx = newBom.findIndex(b => b.variantTempId === wv.tempId && b.inventoryItemId === bb.inventoryItemId);
        const scaledQty = (Number(bb.quantity) * pct).toFixed(2);
        if (existingIdx >= 0) {
          newBom[existingIdx] = { ...newBom[existingIdx], quantity: scaledQty };
        } else {
          newBom.push({
            tempId: uid("tmp"),
            variantTempId: wv.tempId,
            inventoryItemId: bb.inventoryItemId,
            quantity: scaledQty,
          });
        }
      });
    });
    setWizardBom(newBom);
    toast({ title: "Recipes auto-scaled", description: "Quantities scaled proportionally across variants" });
  }

  const filteredInventory = useMemo(() => {
    if (!bomSearch) return inventory;
    const lower = bomSearch.toLowerCase();
    return inventory.filter(i => i.name.toLowerCase().includes(lower));
  }, [inventory, bomSearch]);

  const currentBomForVariant = useMemo(() => {
    if (!selectedBomVariant) return [];
    return wizardBom.filter(b => b.variantTempId === selectedBomVariant);
  }, [wizardBom, selectedBomVariant]);

  function renderStepIndicator() {
    return (
      <div className="flex items-center justify-center gap-1 mb-6" data-testid="wizard-step-indicator">
        {steps.map((label, i) => {
          const isComplete = i < step;
          const isCurrent = i === step;
          return (
            <div key={i} className="flex items-center">
              <div className="flex flex-col items-center">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold transition-all ${
                    isComplete
                      ? "bg-primary text-primary-foreground"
                      : isCurrent
                      ? "bg-primary/20 text-primary border-2 border-primary"
                      : "bg-muted text-muted-foreground"
                  }`}
                  data-testid={`wizard-step-${i}`}
                >
                  {isComplete ? <Check className="h-4 w-4" /> : i + 1}
                </div>
                <span className={`text-[10px] mt-1 max-w-[60px] text-center leading-tight ${isCurrent ? "text-primary font-medium" : "text-muted-foreground"}`}>
                  {label}
                </span>
              </div>
              {i < steps.length - 1 && (
                <div className={`w-8 h-0.5 mx-1 mt-[-12px] ${i < step ? "bg-primary" : "bg-muted"}`} />
              )}
            </div>
          );
        })}
      </div>
    );
  }

  function renderStep0() {
    return (
      <div className="space-y-6">
        <div>
          <Label className="text-sm font-medium mb-3 block">What type of item are you adding?</Label>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setItemType("RETAIL")}
              className={`flex flex-col items-center gap-3 p-6 rounded-xl border-2 transition-all cursor-pointer ${
                itemType === "RETAIL"
                  ? "border-primary bg-primary/5 shadow-md"
                  : "border-muted hover:border-muted-foreground/30"
              }`}
              data-testid="wizard-type-retail"
            >
              <Package className={`h-10 w-10 ${itemType === "RETAIL" ? "text-primary" : "text-muted-foreground"}`} />
              <div className="text-center">
                <p className="font-semibold text-sm">Retail Item</p>
                <p className="text-xs text-muted-foreground mt-1">Simple item with a fixed price. Quick setup.</p>
              </div>
            </button>
            <button
              type="button"
              onClick={() => setItemType("PREPARED")}
              className={`flex flex-col items-center gap-3 p-6 rounded-xl border-2 transition-all cursor-pointer ${
                itemType === "PREPARED"
                  ? "border-primary bg-primary/5 shadow-md"
                  : "border-muted hover:border-muted-foreground/30"
              }`}
              data-testid="wizard-type-prepared"
            >
              <ChefHat className={`h-10 w-10 ${itemType === "PREPARED" ? "text-primary" : "text-muted-foreground"}`} />
              <div className="text-center">
                <p className="font-semibold text-sm">Prepared Item</p>
                <p className="text-xs text-muted-foreground mt-1">Sizes, modifiers, recipes. Full configuration.</p>
              </div>
            </button>
          </div>
        </div>

        {itemType === "PREPARED" && (
          <div className="flex gap-3 items-start rounded-xl border border-blue-200 bg-blue-50/60 dark:border-blue-900 dark:bg-blue-950/30 p-3 animate-in fade-in slide-in-from-bottom-2 duration-300" data-testid="wizard-prepared-tip">
            <Info className="h-5 w-5 text-blue-500 shrink-0 mt-0.5" />
            <div className="text-sm text-blue-800 dark:text-blue-300">
              <p className="font-medium">Before you begin</p>
              <p className="text-xs mt-0.5 opacity-90">Make sure all the raw ingredients and inventory items you need for this product's recipe have already been added in the Bulk Inventory tab. You'll link them to this item in Step 3.</p>
            </div>
          </div>
        )}

        {itemType && (
          <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <Separator />
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label className="text-xs text-muted-foreground" htmlFor="wizard-name">Product Name</Label>
                <Input id="wizard-name" value={name} onChange={e => setName(e.target.value)} className="mt-1 rounded-xl" placeholder="e.g., Cappuccino" data-testid="wizard-input-name" />
              </div>
              {isRetail && (
                <>
                  <div>
                    <Label className="text-xs text-muted-foreground" htmlFor="wizard-sku">SKU</Label>
                    <Input id="wizard-sku" value={sku} onChange={e => setSku(e.target.value)} className="mt-1 rounded-xl" placeholder="CAP-001" data-testid="wizard-input-sku" />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground" htmlFor="wizard-price">Price ($)</Label>
                    <Input id="wizard-price" value={price} onChange={e => setPrice(e.target.value)} className="mt-1 rounded-xl" inputMode="decimal" placeholder="4.50" data-testid="wizard-input-price" />
                  </div>
                </>
              )}
              <div className={isRetail ? "" : "sm:col-span-2"}>
                <Label className="text-xs text-muted-foreground" htmlFor="wizard-tags">Tags (comma separated)</Label>
                <Input id="wizard-tags" value={tags} onChange={e => setTags(e.target.value)} className="mt-1 rounded-xl" placeholder="coffee, hot" data-testid="wizard-input-tags" />
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  function renderStep1Variants() {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-sm">Variant Configuration</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Define sizes or variations with their own SKU and price.</p>
          </div>
          <Button size="sm" variant="outline" onClick={addVariantRow} className="rounded-xl" data-testid="wizard-add-variant">
            <Plus className="h-3 w-3 mr-1" /> Add Variant
          </Button>
        </div>
        <div className="rounded-xl border overflow-hidden">
          <div className="grid grid-cols-[1fr_120px_120px_40px] gap-2 p-3 bg-muted/30 text-xs font-medium text-muted-foreground">
            <span>Name</span>
            <span>SKU</span>
            <span>Price ($)</span>
            <span></span>
          </div>
          <ScrollArea className="max-h-[240px]">
            {wizardVariants.map((wv, idx) => (
              <div key={wv.tempId} className="grid grid-cols-[1fr_120px_120px_40px] gap-2 p-2 border-t items-center" data-testid={`wizard-variant-row-${idx}`}>
                <Input
                  value={wv.name}
                  onChange={e => updateVariantRow(wv.tempId, "name", e.target.value)}
                  className="h-8 rounded-lg text-sm"
                  placeholder="e.g., Small"
                  data-testid={`wizard-variant-name-${idx}`}
                />
                <Input
                  value={wv.sku}
                  onChange={e => updateVariantRow(wv.tempId, "sku", e.target.value)}
                  className="h-8 rounded-lg text-sm"
                  placeholder="SKU"
                  data-testid={`wizard-variant-sku-${idx}`}
                />
                <Input
                  value={wv.basePrice}
                  onChange={e => updateVariantRow(wv.tempId, "basePrice", e.target.value)}
                  className="h-8 rounded-lg text-sm"
                  inputMode="decimal"
                  placeholder="0.00"
                  data-testid={`wizard-variant-price-${idx}`}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-destructive"
                  onClick={() => removeVariantRow(wv.tempId)}
                  disabled={wizardVariants.length <= 1}
                  data-testid={`wizard-variant-remove-${idx}`}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </ScrollArea>
        </div>
      </div>
    );
  }

  function renderStep3Modifiers() {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-sm">Modifier Groups</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Attach modifier groups and configure size-based pricing multipliers.</p>
          </div>
          <Button size="sm" variant="outline" onClick={addModGroupRow} className="rounded-xl" data-testid="wizard-add-mod-group">
            <Plus className="h-3 w-3 mr-1" /> Add Group
          </Button>
        </div>
        <ScrollArea className="max-h-[400px]">
          {wizardModGroups.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground border-2 border-dashed rounded-xl">
              <p className="text-sm">No modifier groups added yet.</p>
              <p className="text-xs mt-1">Modifiers are optional — skip if not needed.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {wizardModGroups.map((wmg, idx) => {
                const groupMods = getGroupModifiers(wmg);
                const groupName = wmg.isNew
                  ? wmg.newName || "New Group"
                  : modifierGroups.find(mg => mg.id === wmg.groupId)?.name || "";
                return (
                  <Card key={wmg.tempId} className="shadow-sm" data-testid={`wizard-mod-group-${idx}`}>
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <Label className="text-xs flex items-center gap-2">
                            <Switch
                              checked={wmg.isNew}
                              onCheckedChange={v => updateModGroupRow(wmg.tempId, { isNew: v })}
                              data-testid={`wizard-mod-new-toggle-${idx}`}
                            />
                            {wmg.isNew ? "Create New" : "Use Existing"}
                          </Label>
                        </div>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeModGroupRow(wmg.tempId)} data-testid={`wizard-mod-remove-${idx}`}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                      {wmg.isNew ? (
                        <div className="grid gap-3 sm:grid-cols-3">
                          <div>
                            <Label className="text-xs text-muted-foreground">Group Name</Label>
                            <Input
                              value={wmg.newName}
                              onChange={e => updateModGroupRow(wmg.tempId, { newName: e.target.value })}
                              className="mt-1 h-8 rounded-lg text-sm"
                              placeholder="e.g., Milk Type"
                              data-testid={`wizard-mod-name-${idx}`}
                            />
                          </div>
                          <div>
                            <Label className="text-xs text-muted-foreground">Min Selections</Label>
                            <Input
                              value={wmg.newMin}
                              onChange={e => updateModGroupRow(wmg.tempId, { newMin: e.target.value })}
                              className="mt-1 h-8 rounded-lg text-sm"
                              inputMode="numeric"
                              data-testid={`wizard-mod-min-${idx}`}
                            />
                          </div>
                          <div>
                            <Label className="text-xs text-muted-foreground">Max Selections</Label>
                            <Input
                              value={wmg.newMax}
                              onChange={e => updateModGroupRow(wmg.tempId, { newMax: e.target.value })}
                              className="mt-1 h-8 rounded-lg text-sm"
                              inputMode="numeric"
                              data-testid={`wizard-mod-max-${idx}`}
                            />
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <div>
                            <Label className="text-xs text-muted-foreground">Select Existing Group</Label>
                            <Select value={wmg.groupId} onValueChange={v => updateModGroupRow(wmg.tempId, { groupId: v })}>
                              <SelectTrigger className="mt-1 h-8 rounded-lg text-sm" data-testid={`wizard-mod-select-${idx}`}>
                                <SelectValue placeholder="Choose a group" />
                              </SelectTrigger>
                              <SelectContent>
                                {modifierGroups.map(mg => (
                                  <SelectItem key={mg.id} value={mg.id}>{mg.name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          {wmg.groupId && (
                            <div className="grid gap-3 sm:grid-cols-2">
                              <div>
                                <Label className="text-xs text-muted-foreground">Min Selections (this product)</Label>
                                <Input
                                  value={wmg.productMin}
                                  onChange={e => updateModGroupRow(wmg.tempId, { productMin: e.target.value })}
                                  className="mt-1 h-8 rounded-lg text-sm"
                                  inputMode="numeric"
                                  placeholder={String(modifierGroups.find(mg => mg.id === wmg.groupId)?.minSelections ?? 0)}
                                  data-testid={`wizard-mod-pmin-${idx}`}
                                />
                              </div>
                              <div>
                                <Label className="text-xs text-muted-foreground">Max Selections (this product)</Label>
                                <Input
                                  value={wmg.productMax}
                                  onChange={e => updateModGroupRow(wmg.tempId, { productMax: e.target.value })}
                                  className="mt-1 h-8 rounded-lg text-sm"
                                  inputMode="numeric"
                                  placeholder={String(modifierGroups.find(mg => mg.id === wmg.groupId)?.maxSelections ?? 0)}
                                  data-testid={`wizard-mod-pmax-${idx}`}
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {!wmg.isNew && wmg.groupId && groupMods.length > 0 && (
                        <>
                          <div className="mt-2">
                            <Separator className="mb-3" />
                            <p className="text-xs font-medium text-muted-foreground mb-2">
                              Pricing for "{groupName}"
                            </p>
                            <p className="text-[11px] text-muted-foreground mb-2">
                              Set a product-specific base price and size multipliers. Leave base price empty to use the modifier's default.
                            </p>
                            <div className="overflow-x-auto rounded-lg border">
                              <table className="w-full text-sm">
                                <thead>
                                  <tr className="bg-muted/50">
                                    <th className="text-left text-xs font-medium text-muted-foreground px-3 py-2 whitespace-nowrap">Modifier Option</th>
                                    <th className="text-center text-xs font-medium text-muted-foreground px-2 py-2 whitespace-nowrap">Base Price ($)</th>
                                    {wizardVariants.map((wv, vi) => (
                                      <th key={wv.tempId} className="text-center text-xs font-medium text-muted-foreground px-2 py-2 whitespace-nowrap" data-testid={`wizard-scale-size-header-${vi}`}>
                                        {wv.name || `Size ${vi + 1}`}
                                      </th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {groupMods.map((mod, mi) => (
                                    <tr key={mod.id} className="border-t" data-testid={`wizard-scale-row-${mi}`}>
                                      <td className="px-3 py-2 font-medium text-xs whitespace-nowrap">{mod.name}</td>
                                      <td className="px-1.5 py-1.5 text-center">
                                        <Input
                                          type="number"
                                          step="0.01"
                                          min="0"
                                          value={wmg.modifierPrices[mod.id] || ""}
                                          onChange={e => updateModGroupRow(wmg.tempId, {
                                            modifierPrices: { ...wmg.modifierPrices, [mod.id]: e.target.value }
                                          })}
                                          placeholder={((mod.baseUpcharge || 0) / 100).toFixed(2)}
                                          className="h-7 w-20 text-center text-xs mx-auto"
                                          data-testid={`wizard-mod-price-${mi}`}
                                        />
                                      </td>
                                      {wizardVariants.map((wv, vi) => (
                                        <td key={wv.tempId} className="px-1.5 py-1.5 text-center">
                                          <Input
                                            type="number"
                                            step="0.1"
                                            min="0"
                                            value={wizardScaleFactors[wmg.tempId]?.[mod.id]?.[wv.name] || ""}
                                            onChange={e => updateWizardScaleFactor(wmg.tempId, mod.id, wv.name, e.target.value)}
                                            placeholder="1"
                                            className="h-7 w-16 text-center text-xs mx-auto"
                                            data-testid={`wizard-scale-${mi}-${vi}`}
                                          />
                                        </td>
                                      ))}
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>

                          {groupMods.some(m => m.inventoryItemId) && (
                            <div className="mt-2">
                              <Separator className="mb-3" />
                              <p className="text-xs font-medium text-muted-foreground mb-2">
                                Ingredient quantity per size for "{groupName}"
                              </p>
                              <div className="overflow-x-auto rounded-lg border">
                                <table className="w-full text-sm">
                                  <thead>
                                    <tr className="bg-muted/50">
                                      <th className="text-left text-xs font-medium text-muted-foreground px-3 py-2 whitespace-nowrap">Option</th>
                                      <th className="text-left text-xs font-medium text-muted-foreground px-3 py-2 whitespace-nowrap">Ingredient</th>
                                      {wizardVariants.map((wv, vi) => (
                                        <th key={wv.tempId} className="text-center text-xs font-medium text-muted-foreground px-2 py-2 whitespace-nowrap" data-testid={`wizard-mod-size-header-${vi}`}>
                                          {wv.name || `Size ${vi + 1}`}
                                        </th>
                                      ))}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {groupMods.filter(m => m.inventoryItemId).map((mod, mi) => {
                                      const invItem = inventory.find(i => i.id === mod.inventoryItemId);
                                      return (
                                        <tr key={mod.id} className="border-t" data-testid={`wizard-mod-option-row-${mi}`}>
                                          <td className="px-3 py-2 font-medium text-xs whitespace-nowrap">{mod.name}</td>
                                          <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">
                                            {invItem ? (
                                              <span>{invItem.name} <span className="opacity-60">({invItem.unitOfMeasure})</span></span>
                                            ) : (
                                              <span className="text-amber-500">No ingredient</span>
                                            )}
                                          </td>
                                          {wizardVariants.map((wv, vi) => (
                                            <td key={wv.tempId} className="px-1.5 py-1.5 text-center">
                                              <Input
                                                type="number"
                                                step="0.1"
                                                min="0"
                                                value={modifierSizeQtys[mod.id]?.[wv.name] || ""}
                                                onChange={e => updateModSizeQty(mod.id, wv.name, e.target.value)}
                                                placeholder="0"
                                                className="h-7 w-16 text-center text-xs mx-auto"
                                                data-testid={`wizard-mod-qty-${mi}-${vi}`}
                                              />
                                            </td>
                                          ))}
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                              <p className="text-[11px] text-muted-foreground mt-1.5">
                                Enter how much of each ingredient is consumed per size when this modifier is selected.
                              </p>
                            </div>
                          )}

                          {wizardBom.length > 0 && (
                            <div className="mt-2">
                              <Separator className="mb-3" />
                              <div className="flex items-center gap-2 text-xs" data-testid={`wizard-override-group-${idx}`}>
                                <Label className="text-xs text-muted-foreground shrink-0">Override</Label>
                                <ArrowRightLeft className="h-3 w-3 text-muted-foreground shrink-0" />
                                <Select
                                  value={wmg.overrideInventoryItemId || "__none__"}
                                  onValueChange={v => updateModGroupRow(wmg.tempId, { overrideInventoryItemId: v === "__none__" ? "" : v })}
                                >
                                  <SelectTrigger className="h-7 text-[10px] rounded flex-1" data-testid={`wizard-override-select-${idx}`}>
                                    <SelectValue placeholder="No override" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="__none__">No override</SelectItem>
                                    {[...new Set(wizardBom.map(b => b.inventoryItemId))].map(invId => {
                                      const invItem = inventory.find(i => i.id === invId);
                                      return <SelectItem key={invId} value={invId}>{invItem?.name || "Unknown"}</SelectItem>;
                                    })}
                                  </SelectContent>
                                </Select>
                              </div>
                              <p className="text-[10px] text-muted-foreground mt-1">When a modifier from this group is selected, it replaces the chosen recipe ingredient.</p>
                            </div>
                          )}
                        </>
                      )}

                      {wmg.isNew && (
                        <p className="text-xs text-muted-foreground italic">
                          Size pricing and ingredient quantities can be configured after the group and its options are created in the Modifiers tab.
                        </p>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </div>
    );
  }

  function renderStep2Recipes() {
    return (
      <div className="space-y-4">
        <div>
          <h3 className="font-semibold text-sm">Recipe / BOM Mapping</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Map inventory items to each variant. Define quantities consumed per sale.</p>
        </div>

        <div className="grid grid-cols-12 gap-3" style={{ minHeight: 280 }}>
          <div className="col-span-4 border rounded-xl p-2 space-y-1">
            <p className="text-xs font-medium text-muted-foreground px-1 mb-1">Variants</p>
            {wizardVariants.map(wv => (
              <Button
                key={wv.tempId}
                variant={selectedBomVariant === wv.tempId ? "secondary" : "ghost"}
                className="w-full justify-start text-sm h-8 rounded-lg"
                onClick={() => setSelectedBomVariant(wv.tempId)}
                data-testid={`wizard-bom-variant-${wv.tempId}`}
              >
                {wv.name || "Unnamed"}
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
                    data-testid="wizard-bom-search"
                  />
                </div>

                {currentBomForVariant.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">Linked Materials</p>
                    {currentBomForVariant.map(entry => {
                      const item = inventory.find(i => i.id === entry.inventoryItemId);
                      return (
                        <div key={entry.tempId} className="flex items-center gap-2 p-1.5 rounded-lg bg-muted/30 text-xs">
                          <span className="flex-1 truncate font-medium">{item?.name || "Unknown"}</span>
                          <Input
                            value={entry.quantity}
                            onChange={e => updateBomQty(entry.tempId, e.target.value)}
                            className="w-16 h-6 rounded text-xs text-center"
                            inputMode="decimal"
                            data-testid={`wizard-bom-qty-${entry.tempId}`}
                          />
                          <span className="text-muted-foreground">{item?.unitOfMeasure}</span>
                          <Button variant="ghost" size="icon" className="h-5 w-5 text-destructive" onClick={() => removeBomEntry(entry.tempId)}>
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                )}

                <Separator />
                <ScrollArea className="flex-1 max-h-[280px]">
                  <div className="space-y-0.5">
                    {filteredInventory.map(inv => {
                      const alreadyLinked = currentBomForVariant.some(b => b.inventoryItemId === inv.id);
                      return (
                        <button
                          key={inv.id}
                          type="button"
                          disabled={alreadyLinked}
                          onClick={() => addBomEntry(selectedBomVariant, inv.id)}
                          className={`w-full text-left text-xs p-1.5 rounded-lg transition-colors flex justify-between ${
                            alreadyLinked ? "opacity-40 cursor-not-allowed" : "hover:bg-muted cursor-pointer"
                          }`}
                          data-testid={`wizard-bom-inv-${inv.id}`}
                        >
                          <span>{inv.name}</span>
                          <span className="text-muted-foreground">{inv.unitOfMeasure}</span>
                        </button>
                      );
                    })}
                    {filteredInventory.length === 0 && (
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

        {wizardVariants.length > 1 && (
          <div className="border rounded-xl p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium">Auto-Scale Recipes</p>
                <p className="text-[10px] text-muted-foreground">Define a base variant and scale quantities proportionally.</p>
              </div>
              <Button size="sm" variant="outline" className="h-7 rounded-lg text-xs" onClick={applyAutoScale} disabled={!autoScaleBase} data-testid="wizard-bom-autoscale">
                Apply Scale
              </Button>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Label className="text-xs text-muted-foreground">Base variant:</Label>
              <Select value={autoScaleBase || ""} onValueChange={setAutoScaleBase}>
                <SelectTrigger className="h-7 w-[140px] rounded-lg text-xs" data-testid="wizard-bom-scale-base">
                  <SelectValue placeholder="Select base" />
                </SelectTrigger>
                <SelectContent>
                  {wizardVariants.map(wv => (
                    <SelectItem key={wv.tempId} value={wv.tempId}>{wv.name || "Unnamed"}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {autoScaleBase && wizardVariants.filter(v => v.tempId !== autoScaleBase).map(wv => (
                <div key={wv.tempId} className="flex items-center gap-1">
                  <span className="text-xs text-muted-foreground">{wv.name}:</span>
                  <Input
                    value={autoScalePercents[wv.tempId] || "100"}
                    onChange={e => setAutoScalePercents(prev => ({ ...prev, [wv.tempId]: e.target.value }))}
                    className="w-14 h-7 rounded text-xs text-center"
                    inputMode="numeric"
                    data-testid={`wizard-bom-scale-pct-${wv.tempId}`}
                  />
                  <span className="text-xs text-muted-foreground">%</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  function renderReview() {
    const tagList = tags.split(",").map(t => t.trim()).filter(Boolean);
    return (
      <div className="space-y-4">
        <h3 className="font-semibold text-sm">Review & Publish</h3>
        <div className="rounded-xl border p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">{name || "Unnamed Product"}</span>
            <Badge variant={isRetail ? "secondary" : "default"} data-testid="wizard-review-type">
              {isRetail ? "Retail" : "Prepared"}
            </Badge>
          </div>
          {tagList.length > 0 && (
            <div className="flex gap-1 flex-wrap">
              {tagList.map(t => (
                <Badge key={t} variant="outline" className="text-xs">{t}</Badge>
              ))}
            </div>
          )}

          <Separator />

          {isRetail ? (
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <span className="text-muted-foreground text-xs">SKU</span>
                <p className="font-mono" data-testid="wizard-review-sku">{sku || "—"}</p>
              </div>
              <div>
                <span className="text-muted-foreground text-xs">Price</span>
                <p className="font-semibold" data-testid="wizard-review-price">{formatMoney(Math.round(Number(price) * 100))}</p>
              </div>
            </div>
          ) : (
            <>
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Variants ({wizardVariants.length})</p>
                <div className="space-y-1">
                  {wizardVariants.map((wv, i) => (
                    <div key={wv.tempId} className="flex justify-between text-sm p-1.5 rounded-lg bg-muted/30" data-testid={`wizard-review-variant-${i}`}>
                      <span className="font-medium">{wv.name}</span>
                      <span>{wv.sku ? <span className="font-mono text-xs text-muted-foreground mr-2">{wv.sku}</span> : null}{formatMoney(Math.round(Number(wv.basePrice) * 100))}</span>
                    </div>
                  ))}
                </div>
              </div>

              {wizardModGroups.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">Modifier Groups ({wizardModGroups.length})</p>
                  <div className="space-y-2">
                    {wizardModGroups.map((wmg, i) => {
                      const label = wmg.isNew
                        ? wmg.newName || "New Group"
                        : modifierGroups.find(mg => mg.id === wmg.groupId)?.name || "Unknown";
                      const groupMods = getGroupModifiers(wmg);
                      const modsWithQtys = groupMods.filter(mod => {
                        const sizeMap = modifierSizeQtys[mod.id];
                        return sizeMap && Object.values(sizeMap).some(v => Number(v) > 0);
                      });
                      const scaleData = wizardScaleFactors[wmg.tempId] || {};
                      const modsWithScales = groupMods.filter(mod => {
                        const sf = scaleData[mod.id];
                        return sf && Object.values(sf).some(v => Number(v) > 0 && Number(v) !== 1);
                      });
                      const reviewMin = wmg.isNew ? wmg.newMin : wmg.productMin;
                      const reviewMax = wmg.isNew ? wmg.newMax : wmg.productMax;
                      const overrideItem = wmg.overrideInventoryItemId ? inventory.find(i => i.id === wmg.overrideInventoryItemId) : null;
                      const hasPrices = Object.values(wmg.modifierPrices || {}).some(v => Number(v) > 0);
                      return (
                        <div key={wmg.tempId} data-testid={`wizard-review-mod-${i}`}>
                          <div className="text-sm p-1.5 rounded-lg bg-muted/30 flex items-center justify-between">
                            <span>{label} {wmg.isNew && <Badge variant="outline" className="text-[10px] ml-1">New</Badge>}</span>
                            <span className="text-[10px] text-muted-foreground">
                              {(Number(reviewMin) > 0 || Number(reviewMax) > 0) && `min ${reviewMin || 0} / max ${reviewMax || 0}`}
                            </span>
                          </div>
                          {modsWithScales.length > 0 && (
                            <div className="ml-3 mt-1 space-y-0.5">
                              <p className="text-[10px] font-medium text-muted-foreground">Price multipliers:</p>
                              {modsWithScales.map(mod => {
                                const sf = scaleData[mod.id] || {};
                                const scaleStr = wizardVariants
                                  .filter(wv => sf[wv.name] && Number(sf[wv.name]) > 0)
                                  .map(wv => `${wv.name}: ×${sf[wv.name]}`)
                                  .join(", ");
                                return (
                                  <p key={mod.id} className="text-[11px] text-muted-foreground">
                                    {mod.name} — {scaleStr}
                                  </p>
                                );
                              })}
                            </div>
                          )}
                          {modsWithQtys.length > 0 && (
                            <div className="ml-3 mt-1 space-y-0.5">
                              <p className="text-[10px] font-medium text-muted-foreground">Ingredient quantities:</p>
                              {modsWithQtys.map(mod => {
                                const sizeMap = modifierSizeQtys[mod.id] || {};
                                const sizeStr = wizardVariants
                                  .filter(wv => Number(sizeMap[wv.name] || 0) > 0)
                                  .map(wv => `${wv.name}: ${sizeMap[wv.name]}`)
                                  .join(", ");
                                return (
                                  <p key={mod.id} className="text-[11px] text-muted-foreground">
                                    {mod.name} — {sizeStr}
                                  </p>
                                );
                              })}
                            </div>
                          )}
                          {hasPrices && (
                            <div className="ml-3 mt-1 space-y-0.5">
                              <p className="text-[10px] font-medium text-muted-foreground">Product prices:</p>
                              {groupMods.filter(mod => Number(wmg.modifierPrices[mod.id] || 0) > 0).map(mod => (
                                <p key={mod.id} className="text-[11px] text-muted-foreground">
                                  {mod.name} — ${wmg.modifierPrices[mod.id]}
                                </p>
                              ))}
                            </div>
                          )}
                          {overrideItem && (
                            <p className="ml-3 mt-1 text-[11px] text-amber-600">
                              Override: {overrideItem.name}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {wizardBom.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">BOM Entries ({wizardBom.length})</p>
                  <div className="space-y-1">
                    {wizardVariants.map(wv => {
                      const entries = wizardBom.filter(b => b.variantTempId === wv.tempId);
                      if (entries.length === 0) return null;
                      return (
                        <div key={wv.tempId} className="text-xs">
                          <span className="font-medium">{wv.name}:</span>{" "}
                          {entries.map((e, ei) => {
                            const item = inventory.find(i => i.id === e.inventoryItemId);
                            const overrideLabel = e.overrideModifierGroupId ? (() => {
                              const wmg = wizardModGroups.find(wm => wm.tempId === e.overrideModifierGroupId || wm.groupId === e.overrideModifierGroupId);
                              if (wmg) return wmg.isNew ? wmg.newName : modifierGroups.find(mg => mg.id === wmg.groupId)?.name;
                              return null;
                            })() : null;
                            return <span key={ei}>{ei > 0 && ", "}{item?.name || "?"} ×{e.quantity}{overrideLabel && <span className="text-amber-600"> (→ {overrideLabel})</span>}</span>;
                          })}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    );
  }

  function renderCurrentStep() {
    if (step === 0) return renderStep0();
    if (isRetail) return renderReview();
    if (step === 1) return renderStep1Variants();
    if (step === 2) return renderStep2Recipes();
    if (step === 3) return renderStep3Modifiers();
    if (step === 4) return renderReview();
    return null;
  }

  const isLastStep = step === totalSteps - 1;

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) handleClose(); else onOpenChange(v); }}>
      <DialogContent className="sm:max-w-[640px] max-h-[90vh] overflow-y-auto" data-testid="wizard-dialog">
        <DialogHeader>
          <DialogTitle className="font-serif" data-testid="wizard-title">
            {step === 0 ? "New Product" : `New Product — ${steps[step]}`}
          </DialogTitle>
          <DialogDescription>
            {step === 0
              ? "Choose the type of product you want to create."
              : `Step ${step + 1} of ${totalSteps}`}
          </DialogDescription>
        </DialogHeader>

        {itemType && renderStepIndicator()}
        {renderCurrentStep()}

        <div className="flex items-center justify-between pt-2">
          <div>
            {step > 0 && (
              <Button variant="outline" onClick={handleBack} className="rounded-xl" data-testid="wizard-back">
                <ChevronLeft className="h-4 w-4 mr-1" /> Back
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={handleClose} className="rounded-xl" data-testid="wizard-cancel">
              Cancel
            </Button>
            {isLastStep ? (
              <Button onClick={handleCreate} className="rounded-xl" disabled={!canAdvance()} data-testid="wizard-create">
                <Check className="h-4 w-4 mr-1" /> Create Product
              </Button>
            ) : (
              <Button onClick={handleNext} className="rounded-xl" disabled={!canAdvance()} data-testid="wizard-next">
                Next <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
