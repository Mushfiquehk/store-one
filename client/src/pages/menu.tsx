import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ClipboardList, Plus, Filter } from "lucide-react";
import AppShell from "@/components/app-shell";
import HelpDialog from "@/components/help-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useStore } from "@/lib/store";

function formatMoney(cents: number) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(cents / 100);
}

function uid(prefix: string) {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now()}`;
}

export default function MenuPage({ isTab = false }: { isTab?: boolean }) {
  const { toast } = useToast();
  const { products, variants, bom, inventory, addProduct, addVariant, updateVariant } = useStore();

  const [draftName, setDraftName] = useState("");
  const [draftType, setDraftType] = useState("RETAIL");
  const [draftPrice, setDraftPrice] = useState("");
  const [draftSku, setDraftSku] = useState("");
  const [draftTags, setDraftTags] = useState("fuel");
  const [filterType, setFilterType] = useState<string>("all");
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);

  const filteredProducts = useMemo(() => {
    if (filterType === "all") return products;
    return products.filter(p => p.type === filterType);
  }, [products, filterType]);

  if (!selectedProductId && products.length > 0) {
    setSelectedProductId(products[0].id);
  }

  const getProductVariants = (productId: string) => variants.filter(v => v.productId === productId);

  const getVariantCost = (variantId: string) => {
    const entries = bom.filter(b => b.sourceType === "VARIANT" && b.sourceId === variantId);
    return entries.reduce((sum, entry) => {
      const item = inventory.find(i => i.id === entry.inventoryItemId);
      if (!item || !item.trackingConfig) return sum;
      return sum;
    }, 0);
  };

  function handleAddProduct() {
    const name = draftName.trim();
    if (!name) {
      toast({ title: "Name required" });
      return;
    }
    const price = Number(draftPrice);
    if (!Number.isFinite(price) || price <= 0) {
      toast({ title: "Price required", description: "Enter a valid price" });
      return;
    }

    const productId = uid("prod");
    const variantId = uid("var");
    const tags = draftTags.split(",").map(t => t.trim()).filter(Boolean);

    addProduct({
      id: productId,
      name,
      type: draftType,
      attributes: JSON.stringify({ tax_exempt: false, tags }),
    });

    addVariant({
      id: variantId,
      productId,
      sku: draftSku.trim() || null,
      name: "Default",
      basePrice: Math.round(price * 100),
      config: null,
    });

    setDraftName("");
    setDraftPrice("");
    setDraftSku("");
    setSelectedProductId(productId);
    toast({ title: "Product added", description: `Added "${name}"` });
  }

  const Content = (
    <div className="grid gap-6 lg:grid-cols-12">
      <Card className="border bg-card shadow-soft lg:col-span-12">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 font-serif" data-testid="text-menu-admin-title">
            <ClipboardList className="h-5 w-5" />
            Add a product
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mt-4 grid gap-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              <div>
                <Label className="text-xs text-muted-foreground" htmlFor="menuName">Name</Label>
                <Input id="menuName" value={draftName} onChange={e => setDraftName(e.target.value)} className="mt-1 rounded-2xl" placeholder="e.g., Regular 91" data-testid="input-menu-name" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground" htmlFor="menuType">Type</Label>
                <Select value={draftType} onValueChange={setDraftType}>
                  <SelectTrigger className="mt-1 rounded-2xl" id="menuType" data-testid="select-menu-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="RETAIL">Retail</SelectItem>
                    <SelectItem value="RESTAURANT">Restaurant</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground" htmlFor="menuSku">SKU</Label>
                <Input id="menuSku" value={draftSku} onChange={e => setDraftSku(e.target.value)} className="mt-1 rounded-2xl" placeholder="FUEL-91" data-testid="input-menu-sku" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground" htmlFor="menuTags">Tags (comma separated)</Label>
                <Input id="menuTags" value={draftTags} onChange={e => setDraftTags(e.target.value)} className="mt-1 rounded-2xl" placeholder="fuel, petrol" data-testid="input-menu-tags" />
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <Label className="text-xs text-muted-foreground" htmlFor="menuPrice">Price</Label>
                  <Input id="menuPrice" value={draftPrice} onChange={e => setDraftPrice(e.target.value)} className="mt-1 rounded-2xl" inputMode="decimal" placeholder="1.85" data-testid="input-menu-price" />
                </div>
              </div>
            </div>

            <div className="flex justify-end">
              <Button className="rounded-2xl px-6" onClick={handleAddProduct} data-testid="button-add-menu-item">
                <Plus className="mr-2 h-4 w-4" />
                Add Product
              </Button>
            </div>

            <Separator />

            <div className="flex justify-between items-center px-1">
              <h3 className="text-sm font-medium text-muted-foreground">Products & Variants</h3>
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-muted-foreground" />
                <Select value={filterType} onValueChange={setFilterType}>
                  <SelectTrigger className="w-[180px] h-9 rounded-xl">
                    <SelectValue placeholder="All Types" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem value="RETAIL">Retail</SelectItem>
                    <SelectItem value="RESTAURANT">Restaurant</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="rounded-2xl border bg-background/40">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[30%]">Product</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead>Tags</TableHead>
                    <TableHead className="text-right">Price</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredProducts.map(p => {
                    const pvariants = getProductVariants(p.id);
                    const selected = p.id === selectedProductId;
                    let tags: string[] = [];
                    try { tags = (JSON.parse(p.attributes || "{}")).tags || []; } catch {}

                    return pvariants.map((v, vi) => (
                      <TableRow
                        key={v.id}
                        className={selected ? "bg-primary/5" : undefined}
                        onClick={() => setSelectedProductId(p.id)}
                        data-testid={`row-menu-${v.id}`}
                      >
                        <TableCell className="font-medium" data-testid={`text-menu-row-name-${v.id}`}>
                          {vi === 0 ? p.name : ""} {pvariants.length > 1 ? `(${v.name})` : ""}
                        </TableCell>
                        <TableCell className="text-muted-foreground">{vi === 0 ? p.type : ""}</TableCell>
                        <TableCell className="text-muted-foreground font-mono text-xs">{v.sku || "-"}</TableCell>
                        <TableCell>
                          {vi === 0 && tags.map(t => (
                            <span key={t} className="inline-block mr-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs">{t}</span>
                          ))}
                        </TableCell>
                        <TableCell className="text-right" data-testid={`text-menu-row-price-${v.id}`}>
                          {formatMoney(v.basePrice)}
                        </TableCell>
                      </TableRow>
                    ));
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );

  if (isTab) return Content;

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
      <AppShell title="Menu">
        <header className="relative overflow-hidden rounded-3xl border bg-card shadow-soft grain">
          <div className="p-6 sm:p-8">
            <p className="text-sm font-medium text-muted-foreground">Back Office</p>
            <h1 className="mt-2 font-serif text-3xl tracking-[-0.02em] sm:text-4xl">Products</h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">Create products and variants.</p>
            <Separator className="my-6" />
            {Content}
          </div>
        </header>
      </AppShell>
    </motion.div>
  );
}
