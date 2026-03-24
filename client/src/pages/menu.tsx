import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ClipboardList, Plus, Filter, Tag, Trash2, X } from "lucide-react";
import AppShell from "@/components/app-shell";
import ProductWizard from "@/components/product-wizard";
import ProductEditor from "@/components/product-editor";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useStore, type Product } from "@/lib/store";

function formatMoney(cents: number) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(cents / 100);
}

export default function MenuPage({ isTab = false }: { isTab?: boolean }) {
  const { products, variants, updateProduct } = useStore();
  const { toast } = useToast();

  const [filterType, setFilterType] = useState<string>("all");
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [showTagManager, setShowTagManager] = useState(false);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  const filteredProducts = useMemo(() => {
    if (filterType === "all") return products;
    return products.filter(p => p.type === filterType);
  }, [products, filterType]);

  const tagStats = useMemo(() => {
    const map: Record<string, string[]> = {};
    products.forEach(p => {
      (p.attributes?.tags || []).forEach(t => {
        if (!map[t]) map[t] = [];
        map[t].push(p.id);
      });
    });
    return Object.entries(map)
      .map(([tag, productIds]) => ({ tag, productIds, count: productIds.length }))
      .sort((a, b) => a.tag.localeCompare(b.tag));
  }, [products]);

  function removeTag(tag: string) {
    const affected = products.filter(p => (p.attributes?.tags || []).includes(tag));

    affected.forEach(p => {
      const attrs = p.attributes || {};
      const newTags = (attrs.tags || []).filter(t => t !== tag);
      updateProduct(p.id, { attributes: { ...attrs, tags: newTags } });
    });

    toast({
      title: "Tag removed",
      description: `"${tag}" removed from ${affected.length} product(s)`,
    });
  }

  useEffect(() => {
    if (!selectedProductId && products.length > 0) {
      setSelectedProductId(products[0].id);
    }
  }, [products, selectedProductId]);

  const getProductVariants = (productId: string) => variants.filter(v => v.productId === productId);

  function openEditor(p: Product) {
    setEditingProduct(p);
    setEditorOpen(true);
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
                <Button
                  variant={showTagManager ? "default" : "outline"}
                  size="sm"
                  className="rounded-xl"
                  onClick={() => setShowTagManager(!showTagManager)}
                  data-testid="button-toggle-tag-manager"
                >
                  <Tag className="h-4 w-4 mr-1" />
                  Tags{tagStats.length > 0 ? ` (${tagStats.length})` : ""}
                </Button>
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
                      const tags: string[] = p.attributes?.tags || [];

                      return pvariants.map((v, vi) => (
                        <TableRow
                          key={v.id}
                          className={selected ? "bg-primary/5 cursor-pointer hover:bg-primary/10 transition-colors" : "cursor-pointer hover:bg-muted/50 transition-colors"}
                          onClick={() => {
                            setSelectedProductId(p.id);
                            openEditor(p);
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

      {showTagManager && (
        <Card className="border bg-card shadow-soft lg:col-span-12">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between font-serif">
              <div className="flex items-center gap-2">
                <Tag className="h-5 w-5" />
                Tag Manager
              </div>
              <Button variant="ghost" size="sm" onClick={() => setShowTagManager(false)} data-testid="button-close-tag-manager">
                <X className="h-4 w-4" />
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {tagStats.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6" data-testid="text-no-tags">No tags in use.</p>
            ) : (
              <div className="space-y-2">
                {tagStats.map(({ tag, count }) => (
                  <div
                    key={tag}
                    className="flex items-center justify-between p-2.5 rounded-xl border bg-background/40"
                    data-testid={`tag-row-${tag}`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="inline-block px-2.5 py-0.5 rounded-full bg-primary/10 text-primary text-sm font-medium">{tag}</span>
                      <span className="text-xs text-muted-foreground">
                        {count} product{count !== 1 ? "s" : ""}
                      </span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive hover:bg-destructive/10 rounded-xl"
                      onClick={() => removeTag(tag)}
                      data-testid={`button-delete-tag-${tag}`}
                    >
                      <Trash2 className="h-4 w-4 mr-1" />
                      Remove
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <ProductWizard open={wizardOpen} onOpenChange={setWizardOpen} />
      <ProductEditor product={editingProduct} open={editorOpen} onOpenChange={setEditorOpen} />
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
