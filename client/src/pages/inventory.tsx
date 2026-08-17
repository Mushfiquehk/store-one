import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Package, Plus, Pencil, Trash2, Trash, ClipboardCheck } from "lucide-react";
import AppShell from "@/components/app-shell";
import HelpDialog from "@/components/help-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { useStore, type InventoryItem } from "@/lib/store";
import { formatCostPerStockUnit } from "@shared/units";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { WASTE_REASONS, reconcile, type InventoryLedgerEntry, type WasteReason } from "@shared/ledger";

function uid(prefix: string) {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now()}`;
}

export default function InventoryPage({ isTab = false }: { isTab?: boolean }) {
  const { toast } = useToast();
  const { inventory, bom, modifiers, variants, addInventoryItem, updateInventoryItem, adjustInventory, deleteInventoryItem, recordWaste, recordCount, getLedger } = useStore();

  const [draftName, setDraftName] = useState("");
  const [draftUnit, setDraftUnit] = useState("each");
  const [draftQty, setDraftQty] = useState("0");
  const [draftLowAlert, setDraftLowAlert] = useState("10");

  const [editOpen, setEditOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [editForm, setEditForm] = useState({ name: "", unitOfMeasure: "", lowStockAlert: "", purchaseUnit: "", unitsPerPurchase: "" });

  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string; deps: string[] } | null>(null);

  const [wasteTarget, setWasteTarget] = useState<InventoryItem | null>(null);
  const [wasteQty, setWasteQty] = useState("");
  const [wasteReason, setWasteReason] = useState<WasteReason | "">("");
  const [wasteNote, setWasteNote] = useState("");

  const [countTarget, setCountTarget] = useState<InventoryItem | null>(null);
  const [countQty, setCountQty] = useState("");

  // The movement history, for the variance table. Reloaded whenever stock changes.
  const [ledger, setLedger] = useState<InventoryLedgerEntry[]>([]);
  useEffect(() => { getLedger().then(setLedger).catch(() => {}); }, [getLedger, inventory]);

  const reconciliations = useMemo(() => {
    const byId = new Map(reconcile(ledger).map(r => [r.inventoryItemId, r]));
    return inventory
      .map(item => ({ item, summary: byId.get(item.id) }))
      .filter((r): r is { item: InventoryItem; summary: NonNullable<typeof r.summary> } => !!r.summary);
  }, [ledger, inventory]);

  async function submitWaste() {
    if (!wasteTarget) return;
    const qty = Number(wasteQty);
    // Required, both here and in the storage layer: an optional reason field is an empty one.
    if (!wasteReason) { toast({ title: "Reason required", description: "Say what happened to it." }); return; }
    if (!Number.isFinite(qty) || qty <= 0) { toast({ title: "Quantity required" }); return; }
    await recordWaste(wasteTarget.id, qty, wasteReason, wasteNote.trim());
    toast({ title: "Waste recorded", description: `${qty} ${wasteTarget.unitOfMeasure} — ${wasteReason}` });
    setWasteTarget(null); setWasteQty(""); setWasteReason(""); setWasteNote("");
  }

  async function submitCount() {
    if (!countTarget) return;
    const counted = Number(countQty);
    if (!Number.isFinite(counted)) { toast({ title: "Enter what is on the shelf" }); return; }
    const variance = counted - countTarget.currentQuantity;
    await recordCount(countTarget.id, counted);
    toast({
      title: "Count recorded",
      description: variance === 0
        ? "The shelf matches the books."
        : `${variance > 0 ? "+" : ""}${variance} ${countTarget.unitOfMeasure} unexplained.`,
    });
    setCountTarget(null); setCountQty("");
  }

  // Over-drawn is a distinct, louder state than low, and must not be folded into it: low
  // means "order more", negative means the count or the recipe is wrong.
  const overDrawnCount = useMemo(() => inventory.filter(i => i.currentQuantity < 0).length, [inventory]);

  const lowStockCount = useMemo(() => {
    return inventory.filter(i => i.currentQuantity >= 0 && i.lowStockThreshold != null && i.currentQuantity <= i.lowStockThreshold).length;
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
      lowStockThreshold: Number.isFinite(lowAlert) ? lowAlert : 10,
    });

    setDraftName("");
    setDraftUnit("each");
    setDraftQty("0");
    setDraftLowAlert("10");
    toast({ title: "Inventory updated", description: `Added "${name}"` });
  }

  function openEditItem(item: InventoryItem) {
    setEditingItem(item);
    setEditForm({
      name: item.name,
      unitOfMeasure: item.unitOfMeasure,
      lowStockAlert: String(item.lowStockThreshold ?? 10),
      purchaseUnit: item.purchaseUnit ?? "",
      unitsPerPurchase: String(item.unitsPerPurchase ?? 1),
    });
    setEditOpen(true);
  }

  function handleSaveEdit() {
    if (!editingItem) return;
    const name = editForm.name.trim();
    if (!name) { toast({ title: "Name required" }); return; }
    const lowAlert = Number(editForm.lowStockAlert);
    // A blank or nonsense pack size falls back to 1 — bought and stocked the same way,
    // which is what every row means today. Never 0: it would divide costing to Infinity.
    const factor = Number(editForm.unitsPerPurchase);
    updateInventoryItem(editingItem.id, {
      name,
      unitOfMeasure: editForm.unitOfMeasure.trim() || "each",
      lowStockThreshold: Number.isFinite(lowAlert) ? lowAlert : 10,
      purchaseUnit: editForm.purchaseUnit.trim() || null,
      unitsPerPurchase: Number.isFinite(factor) && factor > 0 ? factor : 1,
    });
    toast({ title: "Item updated" });
    setEditOpen(false);
  }

  function requestDelete(item: InventoryItem) {
    const deps: string[] = [];
    const bomCount = bom.filter(b => b.inventoryItemId === item.id).length;
    if (bomCount > 0) deps.push(`${bomCount} recipe/BOM entry(ies)`);
    const modCount = modifiers.filter(m => m.inventoryItemId === item.id).length;
    if (modCount > 0) deps.push(`${modCount} modifier(s)`);
    const varCount = variants.filter(v => v.directInventoryId === item.id).length;
    if (varCount > 0) deps.push(`${varCount} variant(s) with direct link`);
    setDeleteTarget({ id: item.id, name: item.name, deps });
  }

  function handleConfirmDelete() {
    if (!deleteTarget) return;
    deleteInventoryItem(deleteTarget.id);
    toast({ title: "Item deleted" });
    setDeleteTarget(null);
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
            {overDrawnCount > 0 && (
              <p className="text-xs font-medium text-destructive" data-testid="text-inventory-overdrawn">
                Over-drawn items: {overDrawnCount} — sold more than was on hand, so the count or the recipe is wrong.
              </p>
            )}
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
                  <TableHead className="w-[120px] text-center">On hand</TableHead>
                  <TableHead className="w-[180px] text-center">Adjust</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {inventory.map(i => {
                  const lowAlert = i.lowStockThreshold ?? 0;
                  const isOverDrawn = i.currentQuantity < 0;
                  const isLow = !isOverDrawn && lowAlert > 0 && i.currentQuantity <= lowAlert;

                  return (
                    <TableRow key={i.id} data-testid={`row-inventory-${i.id}`} className="cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => openEditItem(i)}>
                      <TableCell>
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate font-medium text-primary hover:underline" data-testid={`text-inventory-name-${i.id}`}>{i.name}</p>
                            <p className="text-xs text-muted-foreground">Low alert: {lowAlert} {i.unitOfMeasure}</p>
                          </div>
                          <span
                            className={isOverDrawn
                              ? "rounded-full bg-destructive px-2 py-1 text-xs font-semibold text-destructive-foreground"
                              : isLow
                                ? "rounded-full bg-destructive/10 px-2 py-1 text-xs font-medium text-destructive"
                                : "rounded-full bg-accent/10 px-2 py-1 text-xs font-medium text-accent"
                            }
                            data-testid={`status-inventory-level-${i.id}`}
                          >
                            {isOverDrawn ? "Over-drawn" : isLow ? "Low" : "OK"}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-center" onClick={e => e.stopPropagation()}>
                        <span className={`font-serif text-lg ${isOverDrawn ? "text-destructive" : ""}`} data-testid={`text-inventory-onhand-${i.id}`}>
                          {i.currentQuantity} <span className="text-sm text-muted-foreground font-sans">{i.unitOfMeasure}</span>
                        </span>
                      </TableCell>
                      <TableCell onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-center gap-2">
                          <Button variant="secondary" size="sm" className="h-8 rounded-xl" onClick={() => adjustInventory(i.id, -1)} data-testid={`button-inventory-dec-${i.id}`}>-1</Button>
                          <Button variant="secondary" size="sm" className="h-8 rounded-xl" onClick={() => adjustInventory(i.id, 1)} data-testid={`button-inventory-inc-${i.id}`}>+1</Button>
                          <Button size="sm" className="h-8 rounded-xl" onClick={() => adjustInventory(i.id, 10)} data-testid={`button-inventory-plus10-${i.id}`}>+10</Button>
                          <Button variant="ghost" size="sm" className="h-8 rounded-xl" title="Record waste" onClick={() => setWasteTarget(i)} data-testid={`button-inventory-waste-${i.id}`}>
                            <Trash className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="sm" className="h-8 rounded-xl" title="Count the shelf" onClick={() => { setCountTarget(i); setCountQty(String(i.currentQuantity)); }} data-testid={`button-inventory-count-${i.id}`}>
                            <ClipboardCheck className="h-4 w-4" />
                          </Button>
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

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-md" data-testid="dialog-edit-inventory">
          <DialogHeader>
            <DialogTitle>Edit Inventory Item</DialogTitle>
            <DialogDescription>Update the item details below.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="edit-inv-name">Item Name</Label>
              <Input id="edit-inv-name" value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} data-testid="input-edit-inventory-name" />
            </div>
            <div>
              <Label htmlFor="edit-inv-unit">Unit of Measure</Label>
              <Input id="edit-inv-unit" value={editForm.unitOfMeasure} onChange={e => setEditForm(f => ({ ...f, unitOfMeasure: e.target.value }))} data-testid="input-edit-inventory-unit" />
            </div>
            <div>
              <Label htmlFor="edit-inv-low">Low Stock Alert</Label>
              <Input id="edit-inv-low" type="number" min="0" value={editForm.lowStockAlert} onChange={e => setEditForm(f => ({ ...f, lowStockAlert: e.target.value }))} data-testid="input-edit-inventory-low" />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="edit-inv-purchase-unit">You buy it by the</Label>
                <Input id="edit-inv-purchase-unit" value={editForm.purchaseUnit} onChange={e => setEditForm(f => ({ ...f, purchaseUnit: e.target.value }))} placeholder="gallon, case of 24" data-testid="input-edit-inventory-purchase-unit" />
              </div>
              <div>
                <Label htmlFor="edit-inv-units-per-purchase">How many {editForm.unitOfMeasure || "units"} is that?</Label>
                <Input id="edit-inv-units-per-purchase" type="number" min="0" step="any" value={editForm.unitsPerPurchase} onChange={e => setEditForm(f => ({ ...f, unitsPerPurchase: e.target.value }))} data-testid="input-edit-inventory-units-per-purchase" />
              </div>
            </div>
            {editingItem && (
              <p className="text-xs text-muted-foreground" data-testid="text-edit-inventory-cost">
                {editingItem.lastPurchasePrice == null
                  ? "No purchase price recorded yet — record an invoice to cost this item."
                  : `Last cost: ${formatCostPerStockUnit(editingItem.lastPurchasePrice)} per ${editingItem.unitOfMeasure}. Changing the pack size applies to the next invoice, not to this figure.`}
              </p>
            )}
          </div>
          <DialogFooter className="flex justify-between items-center sm:justify-between">
            <Button variant="destructive" onClick={() => { setEditOpen(false); requestDelete(editingItem!); }} data-testid="button-delete-inventory-from-edit">
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
              <Button onClick={handleSaveEdit} data-testid="button-save-edit-inventory">Save</Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card className="border bg-card shadow-soft lg:col-span-12">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 font-serif" data-testid="text-inventory-variance-title">
            <ClipboardCheck className="h-5 w-5" />
            Where it went
          </CardTitle>
        </CardHeader>
        <CardContent>
          {reconciliations.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nothing has moved yet. Sales, deliveries, waste and counts all appear here.
            </p>
          ) : (
            <div className="max-h-[420px] overflow-auto rounded-2xl border bg-background/40">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead className="text-right">Opening</TableHead>
                    <TableHead className="text-right">Received</TableHead>
                    <TableHead className="text-right">Sold</TableHead>
                    <TableHead className="text-right">Wasted</TableHead>
                    <TableHead className="text-right">Counted</TableHead>
                    <TableHead className="text-right">Unexplained</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reconciliations.map(({ item, summary }) => (
                    <TableRow key={item.id} data-testid={`row-variance-${item.id}`}>
                      <TableCell className="font-medium">{item.name}</TableCell>
                      <TableCell className="text-right font-mono">{summary.opening}</TableCell>
                      <TableCell className="text-right font-mono">{summary.received}</TableCell>
                      <TableCell className="text-right font-mono">{summary.sold}</TableCell>
                      <TableCell className="text-right font-mono">{summary.wasted}</TableCell>
                      {/* No count is not a zero variance: it is an unanswered question. */}
                      <TableCell className="text-right font-mono">{summary.counted ?? "—"}</TableCell>
                      <TableCell
                        className={`text-right font-mono ${summary.unexplained !== 0 ? "font-semibold text-destructive" : ""}`}
                        data-testid={`text-variance-unexplained-${item.id}`}
                      >
                        {summary.counted === null ? "not counted" : summary.unexplained}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!wasteTarget} onOpenChange={open => { if (!open) setWasteTarget(null); }}>
        <DialogContent data-testid="dialog-waste">
          <DialogHeader>
            <DialogTitle>Record waste — {wasteTarget?.name}</DialogTitle>
            <DialogDescription>
              A dropped tray, a spoiled case or a comped drink. Without this, every one of them
              becomes "the recipes must be wrong", because that was the only bucket there was.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div>
              <Label className="text-xs text-muted-foreground">Quantity ({wasteTarget?.unitOfMeasure})</Label>
              <Input value={wasteQty} onChange={e => setWasteQty(e.target.value)} inputMode="decimal" className="mt-1 rounded-2xl" data-testid="input-waste-qty" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Reason (required)</Label>
              <Select value={wasteReason} onValueChange={v => setWasteReason(v as WasteReason)}>
                <SelectTrigger className="mt-1 rounded-2xl" data-testid="select-waste-reason">
                  <SelectValue placeholder="What happened to it?" />
                </SelectTrigger>
                <SelectContent>
                  {WASTE_REASONS.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Note (optional)</Label>
              <Input value={wasteNote} onChange={e => setWasteNote(e.target.value)} className="mt-1 rounded-2xl" data-testid="input-waste-note" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setWasteTarget(null)}>Cancel</Button>
            <Button onClick={submitWaste} data-testid="button-submit-waste">Record waste</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!countTarget} onOpenChange={open => { if (!open) setCountTarget(null); }}>
        <DialogContent data-testid="dialog-count">
          <DialogHeader>
            <DialogTitle>Count the shelf — {countTarget?.name}</DialogTitle>
            <DialogDescription>
              What is actually there is the truth. The gap between it and the {countTarget?.currentQuantity}{" "}
              {countTarget?.unitOfMeasure} the books say is the finding, and it is recorded rather than
              quietly written over.
            </DialogDescription>
          </DialogHeader>
          <div>
            <Label className="text-xs text-muted-foreground">Counted ({countTarget?.unitOfMeasure})</Label>
            <Input value={countQty} onChange={e => setCountQty(e.target.value)} inputMode="decimal" className="mt-1 rounded-2xl" data-testid="input-count-qty" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCountTarget(null)}>Cancel</Button>
            <Button onClick={submitCount} data-testid="button-submit-count">Record count</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={open => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent data-testid="dialog-confirm-delete-inventory">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Inventory Item?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-medium">{deleteTarget?.name}</span> will be permanently removed.
              {deleteTarget?.deps && deleteTarget.deps.length > 0 ? (
                <span className="block mt-2 text-destructive">
                  Warning: This item is referenced by {deleteTarget.deps.join(", ")}. Deleting it may break those references.
                </span>
              ) : (
                <span className="block mt-2 text-muted-foreground">
                  This item is not referenced by any recipes or modifiers.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90" data-testid="button-confirm-delete-inventory">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
