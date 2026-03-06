import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Plus, Soup, Trash2, Search } from "lucide-react";
import AppShell from "@/components/app-shell";
import HelpDialog from "@/components/help-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { useStore } from "@/lib/store";

function uid(prefix: string) {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now()}`;
}

export default function RecipesPage({ isTab = false }: { isTab?: boolean }) {
  const { toast } = useToast();
  const { variants, inventory, bom, addBom, deleteBom } = useStore();

  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [bomInvItemId, setBomInvItemId] = useState("");
  const [bomQty, setBomQty] = useState("");

  const selectedVariant = useMemo(() => variants.find(v => v.id === selectedVariantId), [variants, selectedVariantId]);

  if (!selectedVariantId && variants.length > 0) {
    setSelectedVariantId(variants[0].id);
  }

  const variantBom = useMemo(() => {
    if (!selectedVariantId) return [];
    return bom.filter(b => b.sourceType === "VARIANT" && b.sourceId === selectedVariantId);
  }, [bom, selectedVariantId]);

  const filteredInventory = useMemo(() => {
    if (!searchTerm) return inventory;
    const lower = searchTerm.toLowerCase();
    return inventory.filter(i => i.name.toLowerCase().includes(lower));
  }, [inventory, searchTerm]);

  function handleAddBom() {
    if (!selectedVariantId || !bomInvItemId) {
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
      sourceType: "VARIANT",
      sourceId: selectedVariantId,
      inventoryItemId: bomInvItemId,
      quantityDeducted: qty,
    });

    setBomInvItemId("");
    setBomQty("");
    setIsAddOpen(false);
    toast({ title: "BOM entry added" });
  }

  const Content = (
    <div className="grid gap-6 lg:grid-cols-12">
      <Card className="border bg-card shadow-soft lg:col-span-3 h-fit max-h-[calc(100vh-300px)] flex flex-col">
        <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0 px-4 pt-4">
          <CardTitle className="font-serif text-lg">Variants</CardTitle>
        </CardHeader>
        <CardContent className="p-2 flex-1 overflow-y-auto">
          <div className="flex flex-col gap-1">
            {variants.map(v => (
              <Button
                key={v.id}
                variant={selectedVariantId === v.id ? "secondary" : "ghost"}
                className={`justify-between rounded-lg h-auto py-2.5 px-3 text-left whitespace-normal ${selectedVariantId === v.id ? 'bg-secondary font-medium shadow-sm' : ''}`}
                onClick={() => setSelectedVariantId(v.id)}
                data-testid={`select-recipe-${v.id}`}
              >
                <span className="truncate">{v.name} ({v.sku || v.id})</span>
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="border bg-card shadow-soft lg:col-span-9 h-full min-h-[500px] flex flex-col overflow-hidden">
        {selectedVariant ? (
          <div className="flex flex-col h-full">
            <div className="px-6 py-4 border-b bg-muted/20 flex justify-between items-center">
              <div>
                <h2 className="font-serif text-2xl" data-testid="text-selected-recipe-name">
                  Bill of Materials: {selectedVariant.sku || selectedVariant.name}
                </h2>
                <p className="text-xs text-muted-foreground mt-1">Define what raw materials are consumed when this variant is sold</p>
              </div>
              <Button size="sm" onClick={() => setIsAddOpen(true)}>
                <Plus className="h-4 w-4 mr-1" /> Add Material
              </Button>
            </div>

            <div className="flex-1 p-6 overflow-y-auto">
              {variantBom.length > 0 ? (
                <div className="grid grid-cols-2 gap-3">
                  {variantBom.map(entry => {
                    const item = inventory.find(i => i.id === entry.inventoryItemId);
                    return (
                      <div key={entry.id} className="p-4 rounded-xl border bg-card shadow-sm hover:shadow-md transition-all group relative">
                        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:bg-destructive/10" onClick={() => deleteBom(entry.id)}>
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
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-40 text-muted-foreground border-2 border-dashed rounded-xl border-muted-foreground/20">
                  <Soup className="h-8 w-8 mb-2 opacity-20" />
                  <p>No materials linked. Add materials to track consumption.</p>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex h-full flex-col items-center justify-center p-8 text-center text-muted-foreground">
            <Soup className="h-12 w-12 opacity-20 mb-4" />
            <p>Select a variant to manage its bill of materials.</p>
          </div>
        )}
      </Card>
    </div>
  );

  const addDialog = (
    <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Add Material to BOM</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label>Inventory Item</Label>
            <Select value={bomInvItemId} onValueChange={setBomInvItemId}>
              <SelectTrigger>
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
            <Input type="number" value={bomQty} onChange={e => setBomQty(e.target.value)} placeholder="e.g. 1" />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={handleAddBom} className="rounded-xl">Add</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  if (isTab) return <>{Content}{addDialog}</>;

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
      <AppShell title="Bill of Materials">
        <header className="relative overflow-hidden rounded-3xl border bg-card shadow-soft grain">
          <div className="p-6 sm:p-8">
            <p className="text-sm font-medium text-muted-foreground">Back Office</p>
            <h1 className="mt-2 font-serif text-3xl tracking-[-0.02em] sm:text-4xl">Bill of Materials</h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">Define material consumption per variant.</p>
            <Separator className="my-6" />
            {Content}
          </div>
        </header>
        {addDialog}
      </AppShell>
    </motion.div>
  );
}
