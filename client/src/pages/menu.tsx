import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ClipboardList, Plus, Filter, Pencil, Trash2 } from "lucide-react";
import AppShell from "@/components/app-shell";
import ProductWizard from "@/components/product-wizard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { useStore, type Product, type Variant } from "@/lib/store";

function formatMoney(cents: number) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(cents / 100);
}

export default function MenuPage({ isTab = false }: { isTab?: boolean }) {
  const { toast } = useToast();
  const { products, variants, bom, sales, updateProduct, deleteProduct, updateVariant, deleteVariant } = useStore();

  const [filterType, setFilterType] = useState<string>("all");
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);

  const [editProductOpen, setEditProductOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [editProductForm, setEditProductForm] = useState({ name: "", tags: "" });

  const [editVariantOpen, setEditVariantOpen] = useState(false);
  const [editingVariant, setEditingVariant] = useState<Variant | null>(null);
  const [editVariantForm, setEditVariantForm] = useState({ name: "", sku: "", basePrice: "" });

  const [deleteTarget, setDeleteTarget] = useState<{ type: "product" | "variant"; id: string; name: string; deps: string[] } | null>(null);

  const filteredProducts = useMemo(() => {
    if (filterType === "all") return products;
    return products.filter(p => p.type === filterType);
  }, [products, filterType]);

  useEffect(() => {
    if (!selectedProductId && products.length > 0) {
      setSelectedProductId(products[0].id);
    }
  }, [products, selectedProductId]);

  const getProductVariants = (productId: string) => variants.filter(v => v.productId === productId);

  function openEditProduct(p: Product) {
    let tags: string[] = [];
    try { tags = (JSON.parse(p.attributes || "{}")).tags || []; } catch {}
    setEditingProduct(p);
    setEditProductForm({ name: p.name, tags: tags.join(", ") });
    setEditProductOpen(true);
  }

  function handleSaveProduct() {
    if (!editingProduct) return;
    const name = editProductForm.name.trim();
    if (!name) { toast({ title: "Name required" }); return; }
    const tagList = editProductForm.tags.split(",").map(t => t.trim()).filter(Boolean);
    let attrs: any = {};
    try { attrs = JSON.parse(editingProduct.attributes || "{}"); } catch {}
    attrs.tags = tagList;
    updateProduct(editingProduct.id, { name, attributes: JSON.stringify(attrs) });
    toast({ title: "Product updated" });
    setEditProductOpen(false);
  }

  function openEditVariant(v: Variant) {
    setEditingVariant(v);
    setEditVariantForm({ name: v.name, sku: v.sku || "", basePrice: (v.basePrice / 100).toFixed(2) });
    setEditVariantOpen(true);
  }

  function handleSaveVariant() {
    if (!editingVariant) return;
    const name = editVariantForm.name.trim();
    if (!name) { toast({ title: "Name required" }); return; }
    const price = Math.round(parseFloat(editVariantForm.basePrice || "0") * 100);
    if (!Number.isFinite(price) || price <= 0) { toast({ title: "Invalid price" }); return; }
    updateVariant(editingVariant.id, { name, sku: editVariantForm.sku.trim() || null, basePrice: price });
    toast({ title: "Variant updated" });
    setEditVariantOpen(false);
  }

  function requestDeleteProduct(p: Product) {
    const deps: string[] = [];
    const hasSales = sales.some(s => {
      try {
        const lines = JSON.parse(s.linesJson || "[]");
        const pvars = variants.filter(v => v.productId === p.id).map(v => v.id);
        return lines.some((l: any) => pvars.includes(l.variantId));
      } catch { return false; }
    });
    if (hasSales) deps.push("sales history");
    const bomCount = bom.filter(b => {
      const pvars = variants.filter(v => v.productId === p.id).map(v => v.id);
      return pvars.includes(b.sourceId);
    }).length;
    if (bomCount > 0) deps.push(`${bomCount} BOM entry(ies)`);
    setDeleteTarget({ type: "product", id: p.id, name: p.name, deps });
  }

  function requestDeleteVariant(v: Variant, productName: string) {
    const deps: string[] = [];
    const bomCount = bom.filter(b => b.sourceId === v.id).length;
    if (bomCount > 0) deps.push(`${bomCount} BOM entry(ies)`);
    const pvariants = variants.filter(vr => vr.productId === v.productId);
    if (pvariants.length <= 1) deps.push("last variant — deletes the entire product");
    setDeleteTarget({ type: "variant", id: v.id, name: `${productName} — ${v.name}`, deps });
  }

  function handleConfirmDelete() {
    if (!deleteTarget) return;
    if (deleteTarget.type === "product") {
      deleteProduct(deleteTarget.id);
      if (selectedProductId === deleteTarget.id) setSelectedProductId(null);
      toast({ title: "Product deleted" });
    } else {
      const v = variants.find(vr => vr.id === deleteTarget.id);
      if (v) {
        const pvariants = variants.filter(vr => vr.productId === v.productId);
        if (pvariants.length <= 1) {
          deleteProduct(v.productId);
          if (selectedProductId === v.productId) setSelectedProductId(null);
          toast({ title: "Product deleted (last variant removed)" });
        } else {
          deleteVariant(deleteTarget.id);
          toast({ title: "Variant deleted" });
        }
      }
    }
    setDeleteTarget(null);
  }

  const Content = (
    <div className="grid gap-6 lg:grid-cols-12">
      <Card className="border bg-card shadow-soft lg:col-span-12">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center justify-between font-serif" data-testid="text-menu-admin-title">
            <div className="flex items-center gap-2">
              <ClipboardList className="h-5 w-5" />
              Products & Variants
            </div>
            <Button className="rounded-2xl px-6" onClick={() => setWizardOpen(true)} data-testid="button-add-menu-item">
              <Plus className="mr-2 h-4 w-4" />
              Add Product
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mt-2 grid gap-4">
            <div className="flex justify-between items-center px-1">
              <p className="text-sm text-muted-foreground">{products.length} product(s), {variants.length} variant(s)</p>
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
                  {filteredProducts.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">
                        <div className="flex flex-col items-center gap-2">
                          <ClipboardList className="h-8 w-8 opacity-20" />
                          <p>No products yet. Click "Add Product" to get started.</p>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredProducts.map(p => {
                      const pvariants = getProductVariants(p.id);
                      const selected = p.id === selectedProductId;
                      let tags: string[] = [];
                      try { tags = (JSON.parse(p.attributes || "{}")).tags || []; } catch {}

                      return pvariants.map((v, vi) => (
                        <TableRow
                          key={v.id}
                          className={selected ? "bg-primary/5 cursor-pointer hover:bg-primary/10 transition-colors" : "cursor-pointer hover:bg-muted/50 transition-colors"}
                          onClick={() => {
                            setSelectedProductId(p.id);
                            if (vi === 0) openEditProduct(p);
                            else openEditVariant(v);
                          }}
                          data-testid={`row-menu-${v.id}`}
                        >
                          <TableCell className="font-medium" data-testid={`text-menu-row-name-${v.id}`}>
                            <span className="text-primary hover:underline">
                              {vi === 0 ? p.name : ""} {pvariants.length > 1 ? `(${v.name})` : ""}
                            </span>
                            {vi === 0 && p.isComposite && (
                              <Badge variant="outline" className="ml-2 text-[10px]">Prepared</Badge>
                            )}
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
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </CardContent>
      </Card>

      <ProductWizard open={wizardOpen} onOpenChange={setWizardOpen} />

      <Dialog open={editProductOpen} onOpenChange={setEditProductOpen}>
        <DialogContent className="max-w-md" data-testid="dialog-edit-product">
          <DialogHeader>
            <DialogTitle>Edit Product</DialogTitle>
            <DialogDescription>Update the product name and tags.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="edit-product-name">Product Name</Label>
              <Input id="edit-product-name" value={editProductForm.name} onChange={e => setEditProductForm(f => ({ ...f, name: e.target.value }))} data-testid="input-edit-product-name" />
            </div>
            <div>
              <Label htmlFor="edit-product-tags">Tags (comma separated)</Label>
              <Input id="edit-product-tags" value={editProductForm.tags} onChange={e => setEditProductForm(f => ({ ...f, tags: e.target.value }))} placeholder="fuel, premium" data-testid="input-edit-product-tags" />
            </div>
          </div>
          <DialogFooter className="flex justify-between items-center sm:justify-between">
            <Button variant="destructive" onClick={() => { setEditProductOpen(false); requestDeleteProduct(editingProduct!); }} data-testid="button-delete-product-from-edit">
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setEditProductOpen(false)}>Cancel</Button>
              <Button onClick={handleSaveProduct} data-testid="button-save-edit-product">Save</Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editVariantOpen} onOpenChange={setEditVariantOpen}>
        <DialogContent className="max-w-md" data-testid="dialog-edit-variant">
          <DialogHeader>
            <DialogTitle>Edit Variant</DialogTitle>
            <DialogDescription>Update variant name, SKU, and price.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="edit-variant-name">Variant Name</Label>
              <Input id="edit-variant-name" value={editVariantForm.name} onChange={e => setEditVariantForm(f => ({ ...f, name: e.target.value }))} data-testid="input-edit-variant-name" />
            </div>
            <div>
              <Label htmlFor="edit-variant-sku">SKU</Label>
              <Input id="edit-variant-sku" value={editVariantForm.sku} onChange={e => setEditVariantForm(f => ({ ...f, sku: e.target.value }))} data-testid="input-edit-variant-sku" />
            </div>
            <div>
              <Label htmlFor="edit-variant-price">Price ($)</Label>
              <Input id="edit-variant-price" type="number" step="0.01" min="0" value={editVariantForm.basePrice} onChange={e => setEditVariantForm(f => ({ ...f, basePrice: e.target.value }))} data-testid="input-edit-variant-price" />
            </div>
          </div>
          <DialogFooter className="flex justify-between items-center sm:justify-between">
            <Button variant="destructive" onClick={() => { setEditVariantOpen(false); requestDeleteVariant(editingVariant!, products.find(p => p.id === editingVariant!.productId)?.name || ""); }} data-testid="button-delete-variant-from-edit">
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setEditVariantOpen(false)}>Cancel</Button>
              <Button onClick={handleSaveVariant} data-testid="button-save-edit-variant">Save</Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={open => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent data-testid="dialog-confirm-delete">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteTarget?.type === "product" ? "Product" : "Variant"}?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-medium">{deleteTarget?.name}</span> will be permanently removed.
              {deleteTarget?.deps && deleteTarget.deps.length > 0 && (
                <span className="block mt-2 text-destructive">
                  This will also affect: {deleteTarget.deps.join(", ")}.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90" data-testid="button-confirm-delete">
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
