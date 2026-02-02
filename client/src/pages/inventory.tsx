import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Package, Plus } from "lucide-react";
import AppShell from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";

type InventoryItem = {
  id: string;
  name: string;
  sku: string;
  onHand: number;
  reorderAt: number;
  unitCostCents: number;
  unit: string;
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

export default function InventoryPage() {
  const { toast } = useToast();

  const [inventory, setInventory] = useState<InventoryItem[]>([
    { id: "beans_g", name: "Coffee Beans", sku: "BEANS", onHand: 2500, reorderAt: 1200, unitCostCents: 2, unit: "g" },
    { id: "milk_ml", name: "Whole Milk", sku: "MILK", onHand: 6000, reorderAt: 2500, unitCostCents: 1, unit: "ml" },
    { id: "cup_12oz", name: "Cup 12oz", sku: "CUP-12", onHand: 250, reorderAt: 120, unitCostCents: 9, unit: "each" },
    { id: "muffin_each", name: "Muffin", sku: "MUFF", onHand: 24, reorderAt: 12, unitCostCents: 150, unit: "each" },
  ]);

  const [draftName, setDraftName] = useState("");
  const [draftSku, setDraftSku] = useState("");
  const [draftUnit, setDraftUnit] = useState("each");
  const [draftOnHand, setDraftOnHand] = useState("0");
  const [draftReorderAt, setDraftReorderAt] = useState("0");
  const [draftUnitCost, setDraftUnitCost] = useState("");

  const lowStockCount = useMemo(() => inventory.filter((i) => i.onHand <= i.reorderAt).length, [inventory]);

  function addInventoryItem() {
    const name = draftName.trim();
    const sku = draftSku.trim();
    const unit = draftUnit.trim() || "each";

    if (!name || !sku) {
      toast({ title: "Name + SKU required", description: "Enter a name and a SKU." });
      return;
    }

    const onHand = Number(draftOnHand);
    const reorderAt = Number(draftReorderAt);
    const unitCost = Number(draftUnitCost);

    if (!Number.isFinite(onHand) || !Number.isFinite(reorderAt) || onHand < 0 || reorderAt < 0) {
      toast({ title: "Counts must be valid", description: "Use whole numbers for on-hand and reorder level." });
      return;
    }

    if (!Number.isFinite(unitCost) || unitCost < 0) {
      toast({ title: "Unit cost must be valid", description: "Enter a valid cost (e.g., 0.09 or 4.15)." });
      return;
    }

    const item: InventoryItem = {
      id: sku.replaceAll(/\s+/g, "_").toLowerCase(),
      name,
      sku,
      unit,
      onHand: Math.trunc(onHand),
      reorderAt: Math.trunc(reorderAt),
      unitCostCents: Math.round(unitCost * 100),
    };

    setInventory((prev) => [item, ...prev]);

    setDraftName("");
    setDraftSku("");
    setDraftUnit("each");
    setDraftOnHand("0");
    setDraftReorderAt("0");
    setDraftUnitCost("");

    toast({ title: "Inventory updated", description: `Added “${name}”. Next: use this item in a recipe.` });
  }

  function adjustOnHand(id: string, delta: number) {
    setInventory((prev) => prev.map((i) => (i.id === id ? { ...i, onHand: Math.max(0, i.onHand + delta) } : i)));
  }

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
      <AppShell title="Inventory">
        <header className="relative overflow-hidden rounded-3xl border bg-card shadow-soft grain">
            <div className="p-6 sm:p-8">
              <p className="text-sm font-medium text-muted-foreground" data-testid="text-tagline">
                Back Office
              </p>
              <h1 className="mt-2 font-serif text-3xl tracking-[-0.02em] sm:text-4xl" data-testid="text-title">
                Inventory
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground" data-testid="text-subtitle">
                Step 1: add an inventory item. Step 2: count on-hand. Step 3: use it in recipes so sales deduct automatically.
              </p>

              <Separator className="my-6" />

              <div className="grid gap-6 lg:grid-cols-12">
                <Card className="border bg-card shadow-soft lg:col-span-5">
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 font-serif" data-testid="text-inventory-create-title">
                      <Package className="h-5 w-5" />
                      Create an inventory item
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ol className="grid gap-3 rounded-2xl border bg-background/40 p-4 text-sm" data-testid="list-steps-inventory">
                      <li className="flex gap-3" data-testid="step-inventory-1">
                        <span className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
                          1
                        </span>
                        <span>
                          Enter <span className="font-medium">Name</span> and a <span className="font-medium">SKU</span> (SKU becomes the internal ID).
                        </span>
                      </li>
                      <li className="flex gap-3" data-testid="step-inventory-2">
                        <span className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
                          2
                        </span>
                        <span>
                          Set <span className="font-medium">Unit</span> (each, g, ml, etc.), plus <span className="font-medium">On hand</span> and <span className="font-medium">Reorder at</span>.
                        </span>
                      </li>
                      <li className="flex gap-3" data-testid="step-inventory-3">
                        <span className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
                          3
                        </span>
                        <span>
                          Click <span className="font-medium">Add inventory item</span>. Next: build recipes using these items.
                        </span>
                      </li>
                    </ol>

                    <div className="mt-4 grid gap-3">
                      <div>
                        <Label className="text-xs text-muted-foreground" htmlFor="invName">
                          Item name
                        </Label>
                        <Input
                          id="invName"
                          value={draftName}
                          onChange={(e) => setDraftName(e.target.value)}
                          className="mt-1 rounded-2xl"
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
                          value={draftSku}
                          onChange={(e) => setDraftSku(e.target.value)}
                          className="mt-1 rounded-2xl"
                          placeholder="e.g., TOWEL-ROLL"
                          data-testid="input-inventory-sku"
                        />
                      </div>

                      <div>
                        <Label className="text-xs text-muted-foreground" htmlFor="invUnit">
                          Unit
                        </Label>
                        <Input
                          id="invUnit"
                          value={draftUnit}
                          onChange={(e) => setDraftUnit(e.target.value)}
                          className="mt-1 rounded-2xl"
                          placeholder="each"
                          data-testid="input-inventory-unit"
                        />
                      </div>

                      <div className="grid gap-2 sm:grid-cols-2">
                        <div>
                          <Label className="text-xs text-muted-foreground" htmlFor="invOnHand">
                            On hand
                          </Label>
                          <Input
                            id="invOnHand"
                            value={draftOnHand}
                            onChange={(e) => setDraftOnHand(e.target.value)}
                            className="mt-1 rounded-2xl"
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
                            value={draftReorderAt}
                            onChange={(e) => setDraftReorderAt(e.target.value)}
                            className="mt-1 rounded-2xl"
                            inputMode="numeric"
                            data-testid="input-inventory-reorderat"
                          />
                        </div>
                      </div>

                      <div>
                        <Label className="text-xs text-muted-foreground" htmlFor="invCost">
                          Unit cost (USD)
                        </Label>
                        <Input
                          id="invCost"
                          value={draftUnitCost}
                          onChange={(e) => setDraftUnitCost(e.target.value)}
                          className="mt-1 rounded-2xl"
                          inputMode="decimal"
                          placeholder="e.g., 0.09"
                          data-testid="input-inventory-unitcost"
                        />
                      </div>

                      <Button className="rounded-2xl" onClick={addInventoryItem} data-testid="button-add-inventory-item">
                        <Plus className="mr-2 h-4 w-4" />
                        Add inventory item
                      </Button>

                      <p className="text-xs text-muted-foreground" data-testid="text-inventory-kpi">
                        Low stock items: {lowStockCount}
                      </p>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border bg-card shadow-soft lg:col-span-7">
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 font-serif" data-testid="text-inventory-list-title">
                      <Package className="h-5 w-5" />
                      Count & adjust inventory
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="max-h-[520px] overflow-auto rounded-2xl border bg-background/40">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Item</TableHead>
                            <TableHead className="w-[140px] text-center">On hand</TableHead>
                            <TableHead className="w-[220px] text-center">Adjust</TableHead>
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
                                        {i.sku} • Unit {i.unit} • Reorder at {i.reorderAt} • Cost {formatMoney(i.unitCostCents)}
                                      </p>
                                    </div>
                                    <span
                                      className={
                                        isLow
                                          ? "rounded-full bg-destructive/10 px-2 py-1 text-xs font-medium text-destructive"
                                          : "rounded-full bg-accent/10 px-2 py-1 text-xs font-medium text-accent"
                                      }
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

                    <p className="mt-3 text-xs text-muted-foreground" data-testid="text-prototype-note">
                      Prototype: inventory here is local to this page.
                    </p>
                  </CardContent>
                </Card>
              </div>
            </div>
        </header>
      </AppShell>
    </motion.div>
  );
}
