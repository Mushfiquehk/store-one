import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ClipboardList, Plus, Filter } from "lucide-react";
import AppShell from "@/components/app-shell";
import ProductWizard from "@/components/product-wizard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useStore } from "@/lib/store";

function formatMoney(cents: number) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(cents / 100);
}

export default function MenuPage({ isTab = false }: { isTab?: boolean }) {
  const { products, variants } = useStore();

  const [filterType, setFilterType] = useState<string>("all");
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);

  const filteredProducts = useMemo(() => {
    if (filterType === "all") return products;
    return products.filter(p => p.type === filterType);
  }, [products, filterType]);

  if (!selectedProductId && products.length > 0) {
    setSelectedProductId(products[0].id);
  }

  const getProductVariants = (productId: string) => variants.filter(v => v.productId === productId);

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
                          className={selected ? "bg-primary/5" : undefined}
                          onClick={() => setSelectedProductId(p.id)}
                          data-testid={`row-menu-${v.id}`}
                        >
                          <TableCell className="font-medium" data-testid={`text-menu-row-name-${v.id}`}>
                            {vi === 0 ? p.name : ""} {pvariants.length > 1 ? `(${v.name})` : ""}
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
