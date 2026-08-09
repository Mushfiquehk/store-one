import { Fragment, useState } from "react";
import { Plus, Trash2, FileText, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { useStore } from "@/lib/store";
import { costPerStockUnit, formatCostPerStockUnit } from "@shared/units";

function uid(prefix: string) {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now()}`;
}

function formatMoney(cents: number) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(cents / 100);
}

type DraftLineItem = {
  tempId: string;
  inventoryItemId: string;
  description: string;
  quantity: string;
  unitPriceCents: string;
  // The pack size, asked here because the operator is holding the case while they type.
  // Blank means "leave the item as it is" — an invoice at 11pm must not be blocked on it.
  purchaseUnit: string;
  unitsPerPurchase: string;
};

export default function AdminInvoiceIntake() {
  const { toast } = useToast();
  const { inventory, invoices, invoiceLineItems, createInvoiceWithLineItems, updateInventoryItemAsync } = useStore();

  const [supplierName, setSupplierName] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split("T")[0]);
  const [notes, setNotes] = useState("");
  const [lineItems, setLineItems] = useState<DraftLineItem[]>([]);
  const [saving, setSaving] = useState(false);

  const addLineItem = () => {
    setLineItems(prev => [...prev, {
      tempId: uid("li"),
      inventoryItemId: "",
      description: "",
      quantity: "1",
      unitPriceCents: "0",
      purchaseUnit: "",
      unitsPerPurchase: "",
    }]);
  };

  const updateLineItem = (tempId: string, field: keyof DraftLineItem, value: string) => {
    setLineItems(prev => prev.map(li => li.tempId === tempId ? { ...li, [field]: value } : li));
  };

  // Picking the item pre-fills whatever pack size it already carries, so an operator
  // correcting one line does not have to retype the others.
  const selectInventoryItem = (tempId: string, inventoryItemId: string) => {
    const item = inventory.find(i => i.id === inventoryItemId);
    setLineItems(prev => prev.map(li => li.tempId === tempId ? {
      ...li,
      inventoryItemId,
      purchaseUnit: item?.purchaseUnit ?? "",
      unitsPerPurchase: item?.unitsPerPurchase && item.unitsPerPurchase !== 1 ? String(item.unitsPerPurchase) : "",
    } : li));
  };

  const removeLineItem = (tempId: string) => {
    setLineItems(prev => prev.filter(li => li.tempId !== tempId));
  };

  const handleSave = async () => {
    if (!supplierName.trim() || !invoiceNumber.trim()) {
      toast({ title: "Missing Info", description: "Supplier name and invoice number are required.", variant: "destructive" });
      return;
    }
    if (lineItems.length === 0) {
      toast({ title: "No Line Items", description: "Add at least one line item.", variant: "destructive" });
      return;
    }
    for (const li of lineItems) {
      if (!li.inventoryItemId) {
        toast({ title: "Missing Inventory Item", description: "Each line item must link to an inventory item.", variant: "destructive" });
        return;
      }
    }

    setSaving(true);
    try {
      const invoiceData = {
        id: uid("inv"),
        supplierName: supplierName.trim(),
        invoiceNumber: invoiceNumber.trim(),
        date: invoiceDate,
        status: "recorded",
        notes: notes.trim(),
      };
      // Pack sizes must land on the item BEFORE the invoice is recorded: the receive path
      // reads unitsPerPurchase off the item to convert the price it is about to store.
      for (const li of lineItems) {
        const factor = parseFloat(li.unitsPerPurchase);
        const item = inventory.find(i => i.id === li.inventoryItemId);
        if (!item) continue;
        const patch: { purchaseUnit?: string | null; unitsPerPurchase?: number } = {};
        if (Number.isFinite(factor) && factor > 0 && factor !== (item.unitsPerPurchase ?? 1)) patch.unitsPerPurchase = factor;
        if (li.purchaseUnit.trim() && li.purchaseUnit.trim() !== item.purchaseUnit) patch.purchaseUnit = li.purchaseUnit.trim();
        if (Object.keys(patch).length > 0) await updateInventoryItemAsync(item.id, patch);
      }

      const items = lineItems.map(li => ({
        id: uid("ili"),
        inventoryItemId: li.inventoryItemId,
        description: li.description || inventory.find(i => i.id === li.inventoryItemId)?.name || "",
        quantity: parseFloat(li.quantity) || 0,
        unitPriceCents: Math.round(parseFloat(li.unitPriceCents) * 100) || 0,
      }));
      await createInvoiceWithLineItems(invoiceData, items);
      toast({ title: "Invoice Saved", description: `Invoice ${invoiceNumber} recorded successfully.` });
      setSupplierName("");
      setInvoiceNumber("");
      setInvoiceDate(new Date().toISOString().split("T")[0]);
      setNotes("");
      setLineItems([]);
    } catch (err) {
      toast({ title: "Error", description: "Failed to save invoice.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const totalCents = lineItems.reduce((sum, li) => {
    const qty = parseFloat(li.quantity) || 0;
    const price = Math.round(parseFloat(li.unitPriceCents) * 100) || 0;
    return sum + qty * price;
  }, 0);

  return (
    <div className="space-y-6">
      <Card className="border shadow-soft rounded-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 font-serif">
            <FileText className="h-5 w-5" /> New Invoice
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <Label>Supplier Name</Label>
              <Input
                value={supplierName}
                onChange={e => setSupplierName(e.target.value)}
                placeholder="Acme Foods"
                data-testid="input-supplier-name"
              />
            </div>
            <div>
              <Label>Invoice Number</Label>
              <Input
                value={invoiceNumber}
                onChange={e => setInvoiceNumber(e.target.value)}
                placeholder="INV-001"
                data-testid="input-invoice-number"
              />
            </div>
            <div>
              <Label>Date</Label>
              <Input
                type="date"
                value={invoiceDate}
                onChange={e => setInvoiceDate(e.target.value)}
                data-testid="input-invoice-date"
              />
            </div>
          </div>
          <div>
            <Label>Notes</Label>
            <Input
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Optional notes..."
              data-testid="input-invoice-notes"
            />
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <h3 className="font-medium">Line Items</h3>
            <Button variant="outline" size="sm" onClick={addLineItem} data-testid="button-add-line-item">
              <Plus className="h-4 w-4 mr-1" /> Add Item
            </Button>
          </div>

          {lineItems.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Inventory Item</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="w-24">Qty</TableHead>
                  <TableHead className="w-32">Unit Price ($)</TableHead>
                  <TableHead className="w-32">Subtotal</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lineItems.map(li => {
                  const qty = parseFloat(li.quantity) || 0;
                  const price = Math.round(parseFloat(li.unitPriceCents) * 100) || 0;
                  const item = inventory.find(i => i.id === li.inventoryItemId);
                  const typedFactor = parseFloat(li.unitsPerPurchase);
                  const factor = Number.isFinite(typedFactor) && typedFactor > 0 ? typedFactor : (item?.unitsPerPurchase ?? 1);
                  return (
                    <Fragment key={li.tempId}>
                    <TableRow>
                      <TableCell>
                        <Select value={li.inventoryItemId} onValueChange={v => selectInventoryItem(li.tempId, v)}>
                          <SelectTrigger data-testid={`select-inventory-${li.tempId}`}>
                            <SelectValue placeholder="Select item..." />
                          </SelectTrigger>
                          <SelectContent>
                            {inventory.map(item => (
                              <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Input
                          value={li.description}
                          onChange={e => updateLineItem(li.tempId, "description", e.target.value)}
                          placeholder="Description"
                          data-testid={`input-description-${li.tempId}`}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          value={li.quantity}
                          onChange={e => updateLineItem(li.tempId, "quantity", e.target.value)}
                          min="0"
                          step="0.01"
                          data-testid={`input-qty-${li.tempId}`}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          value={li.unitPriceCents}
                          onChange={e => updateLineItem(li.tempId, "unitPriceCents", e.target.value)}
                          min="0"
                          step="0.01"
                          data-testid={`input-price-${li.tempId}`}
                        />
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {formatMoney(qty * price)}
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" onClick={() => removeLineItem(li.tempId)} data-testid={`button-remove-${li.tempId}`}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                    {item && (
                      <TableRow className="border-b-0 hover:bg-transparent">
                        <TableCell colSpan={6} className="pt-0 pb-3">
                          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                            <span>You bought 1</span>
                            <Input
                              value={li.purchaseUnit}
                              onChange={e => updateLineItem(li.tempId, "purchaseUnit", e.target.value)}
                              placeholder="gallon"
                              className="h-7 w-28 text-xs"
                              data-testid={`input-purchase-unit-${li.tempId}`}
                            />
                            <span>. How many {item.unitOfMeasure} is that?</span>
                            <Input
                              type="number"
                              min="0"
                              step="any"
                              value={li.unitsPerPurchase}
                              onChange={e => updateLineItem(li.tempId, "unitsPerPurchase", e.target.value)}
                              placeholder={String(item.unitsPerPurchase ?? 1)}
                              className="h-7 w-24 text-xs"
                              data-testid={`input-units-per-purchase-${li.tempId}`}
                            />
                            <span className="font-mono" data-testid={`text-cost-per-unit-${li.tempId}`}>
                              → {formatCostPerStockUnit(costPerStockUnit(price, factor))} per {item.unitOfMeasure}
                            </span>
                            {factor === 1 && (
                              // Not an error: an unset factor is a cost we have not converted, and
                              // saying so beats a plausible number nobody questions.
                              <span className="text-amber-600 dark:text-amber-500" data-testid={`text-unconverted-${li.tempId}`}>
                                not converted — bought and stocked in the same unit
                              </span>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          )}

          {lineItems.length > 0 && (
            <div className="flex items-center justify-between pt-2">
              <span className="font-medium">Total: {formatMoney(totalCents)}</span>
              <Button onClick={handleSave} disabled={saving} data-testid="button-save-invoice">
                <Save className="h-4 w-4 mr-2" /> {saving ? "Saving..." : "Save Invoice"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {invoices.length > 0 && (
        <Card className="border shadow-soft rounded-2xl">
          <CardHeader>
            <CardTitle className="font-serif">Recorded Invoices</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice #</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Items</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map(inv => {
                  const items = invoiceLineItems.filter(li => li.invoiceId === inv.id);
                  return (
                    <TableRow key={inv.id} data-testid={`row-invoice-${inv.id}`}>
                      <TableCell className="font-mono">{inv.invoiceNumber}</TableCell>
                      <TableCell>{inv.supplierName}</TableCell>
                      <TableCell>{inv.date}</TableCell>
                      <TableCell>{items.length}</TableCell>
                      <TableCell>
                        <Badge variant="default">{inv.status}</Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
