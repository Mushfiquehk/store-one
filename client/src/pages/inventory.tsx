import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Package, Plus } from "lucide-react";
import AppShell from "@/components/app-shell";
import HelpDialog from "@/components/help-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useStore } from "@/lib/store";

function uid(prefix: string) {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now()}`;
}

export default function InventoryPage({ isTab = false }: { isTab?: boolean }) {
  const { toast } = useToast();
  const { inventory, addInventoryItem, adjustInventory } = useStore();

  const [draftName, setDraftName] = useState("");
  const [draftUnit, setDraftUnit] = useState("each");
  const [draftQty, setDraftQty] = useState("0");
  const [draftLowAlert, setDraftLowAlert] = useState("10");

  const lowStockCount = useMemo(() => {
    return inventory.filter(i => {
      try {
        const config = i.trackingConfig ? JSON.parse(i.trackingConfig) : {};
        return i.currentQuantity <= (config.low_stock_alert || 0);
      } catch { return false; }
    }).length;
  }, [inventory]);

  function handleAddItem() {
    const name = draftName.trim();
    if (!name) {
      toast({ title: "Name required" });
      return;
    }

    const qty = Number(draftQty);
    const lowAlert = Number(draftLowAlert);

    addInventoryItem({
      id: uid("inv"),
      name,
      unitOfMeasure: draftUnit.trim() || "each",
      currentQuantity: Number.isFinite(qty) ? qty : 0,
      trackingConfig: JSON.stringify({ low_stock_alert: Number.isFinite(lowAlert) ? lowAlert : 10 }),
    });

    setDraftName("");
    setDraftUnit("each");
    setDraftQty("0");
    setDraftLowAlert("10");
    toast({ title: "Inventory updated", description: `Added "${name}"` });
  }

  const Content = (
    <div className="grid gap-6 lg:grid-cols-12">
      <Card className="border bg-card shadow-soft lg:col-span-5">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 font-serif" data-testid="text-inventory-create-title">
            <Package className="h-5 w-5" />
            Add inventory item
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mt-4 grid gap-3">
            <div>
              <Label className="text-xs text-muted-foreground" htmlFor="invName">Item name</Label>
              <Input id="invName" value={draftName} onChange={e => setDraftName(e.target.value)} className="mt-1 rounded-2xl" placeholder="e.g., Unleaded Petrol Base" data-testid="input-inventory-name" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground" htmlFor="invUnit">Unit of measure</Label>
              <Input id="invUnit" value={draftUnit} onChange={e => setDraftUnit(e.target.value)} className="mt-1 rounded-2xl" placeholder="L, each, kg" data-testid="input-inventory-unit" />
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <div>
                <Label className="text-xs text-muted-foreground" htmlFor="invQty">Current quantity</Label>
                <Input id="invQty" value={draftQty} onChange={e => setDraftQty(e.target.value)} className="mt-1 rounded-2xl" inputMode="numeric" data-testid="input-inventory-qty" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground" htmlFor="invLow">Low stock alert</Label>
                <Input id="invLow" value={draftLowAlert} onChange={e => setDraftLowAlert(e.target.value)} className="mt-1 rounded-2xl" inputMode="numeric" data-testid="input-inventory-low" />
              </div>
            </div>
            <Button className="rounded-2xl" onClick={handleAddItem} data-testid="button-add-inventory-item">
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
            Inventory levels
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
                {inventory.map(i => {
                  let lowAlert = 0;
                  try { lowAlert = JSON.parse(i.trackingConfig || "{}").low_stock_alert || 0; } catch {}
                  const isLow = i.currentQuantity <= lowAlert;

                  return (
                    <TableRow key={i.id} data-testid={`row-inventory-${i.id}`}>
                      <TableCell>
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate font-medium" data-testid={`text-inventory-name-${i.id}`}>{i.name}</p>
                            <p className="text-xs text-muted-foreground">Low alert: {lowAlert} {i.unitOfMeasure}</p>
                          </div>
                          <span
                            className={isLow
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
                          {i.currentQuantity} <span className="text-sm text-muted-foreground font-sans">{i.unitOfMeasure}</span>
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-center gap-2">
                          <Button variant="secondary" size="sm" className="h-8 rounded-xl" onClick={() => adjustInventory(i.id, -1)} data-testid={`button-inventory-dec-${i.id}`}>-1</Button>
                          <Button variant="secondary" size="sm" className="h-8 rounded-xl" onClick={() => adjustInventory(i.id, 1)} data-testid={`button-inventory-inc-${i.id}`}>+1</Button>
                          <Button size="sm" className="h-8 rounded-xl" onClick={() => adjustInventory(i.id, 10)} data-testid={`button-inventory-plus10-${i.id}`}>+10</Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );

  if (isTab) return Content;

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
      <AppShell title="Inventory">
        <header className="relative overflow-hidden rounded-3xl border bg-card shadow-soft grain">
          <div className="p-6 sm:p-8">
            <p className="text-sm font-medium text-muted-foreground">Back Office</p>
            <h1 className="mt-2 font-serif text-3xl tracking-[-0.02em] sm:text-4xl">Inventory</h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">Track raw materials and supplies.</p>
            <Separator className="my-6" />
            {Content}
          </div>
        </header>
      </AppShell>
    </motion.div>
  );
}
