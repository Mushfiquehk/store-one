import {
  TrendingUp,
  DollarSign,
  Users,
  Package,
  PieChart,
  Wallet,
  Percent,
  AlertTriangle,
  Clock,
} from "lucide-react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

import AppShell from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { useStore } from "@/lib/store";
import { productMix, salesSeries, type Granularity } from "@shared/reports";
import { menuMargins } from "@shared/pricing";
import { laborCost, laborPct } from "@shared/labor";
import { Link } from "wouter";
import { useMemo, useState } from "react";
import { motion } from "framer-motion";

function formatMoney(cents: number) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(cents / 100);
}

function KpiCard({ title, value, icon }: { title: string; value: string; icon: React.ReactNode }) {
  return (
    <Card className="shadow-soft rounded-2xl p-4">
      <div className="flex items-center gap-2 mb-2 text-muted-foreground">{icon}<span className="text-sm">{title}</span></div>
      <div className="text-2xl font-bold">{value}</div>
    </Card>
  );
}

function ChartCard({ title, data, dataKey, format: fmt }: { title: string; data: any[]; dataKey: string; format?: string }) {
  return (
    <Card className="shadow-soft rounded-2xl">
      <CardHeader className="pb-2"><CardTitle className="text-base">{title}</CardTitle></CardHeader>
      <CardContent>
        {data.every(d => !d[dataKey]) ? (
          // A flat line at zero and a week of no trading look identical on a chart, and
          // only one of them is true. Say which.
          <div className="h-[280px] flex items-center justify-center text-sm text-muted-foreground" data-testid="text-no-sales">
            No sales yet
          </div>
        ) : (
        <div className="h-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            {fmt === "currency" ? (
              <LineChart data={data}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="label" className="text-xs" />
                <YAxis className="text-xs" />
                <Tooltip />
                <Line type="monotone" dataKey={dataKey} stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
              </LineChart>
            ) : (
              <BarChart data={data}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="label" className="text-xs" />
                <YAxis className="text-xs" />
                <Tooltip />
                <Bar dataKey={dataKey} fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            )}
          </ResponsiveContainer>
        </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function ReportsPage() {
  const { products, variants, inventory, bom, modifiers, sales, employees, timePunches } = useStore();

  const [granularityIndex, setGranularityIndex] = useState([1]);
  const granularities = ['hourly', 'daily', 'monthly'] as const;
  const currentGranularity = granularities[granularityIndex[0]];
  const [activeTab, setActiveTab] = useState("sales");
  const [showIngredientProducts, setShowIngredientProducts] = useState(false);

  // Real sales, bucketed the same way the API buckets them. Two loads of this page now
  // agree with each other, which the random series they replaced never did.
  //
  // Each granularity carries the range it means: hourly is today's trading day, or every
  // 09:00 the shop has ever traded would stack up under one repeated label.
  // One window for the whole page. Every number below is for this range and says so, so the
  // KPI cards and the product mix cannot quietly be measuring different periods.
  const range = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (currentGranularity === "hourly") return { since: startOfToday.getTime(), label: "today" };
    if (currentGranularity === "daily") {
      return { since: new Date(now.getFullYear(), now.getMonth(), now.getDate() - 13).getTime(), label: "last 14 days" };
    }
    return { since: new Date(now.getFullYear(), now.getMonth() - 11, 1).getTime(), label: "last 12 months" };
  }, [currentGranularity]);

  // fill: the chart's x-axis is a continuous range, so a day the shop was closed has to be a
  // zero on the line rather than a missing point that draws its neighbours as adjacent.
  const salesData = useMemo(
    () => salesSeries(sales, { granularity: currentGranularity as Granularity, since: range.since, fill: true })
      .map(b => ({ label: b.label, sales: b.revenueCents / 100, transactions: b.transactions })),
    [sales, currentGranularity, range],
  );

  // Zero-filled buckets are not evidence of trading — ask the transactions, not the bucket count.
  const hasSales = salesData.some(b => b.transactions > 0);

  const totals = useMemo(() => {
    const currentSales = salesData.reduce((acc, curr) => acc + curr.sales, 0);
    const currentTxns = salesData.reduce((acc, curr) => acc + curr.transactions, 0);
    return {
      sales: currentSales,
      txns: currentTxns,
      avgCheck: currentTxns ? currentSales / currentTxns : 0,
    };
  }, [salesData]);

  // productMix returns per-variant rows; the tab shows per-product, so the rollup happens
  // here rather than in a second shared function. A product that never sold has no row at
  // all — it is absent from the sales, not present with a quantity of zero.
  const productMixData = useMemo(() => {
    const productOfVariant = new Map(variants.map(v => [v.id, v.productId]));
    const byProduct = new Map<string, { name: string; quantity: number; revenueCents: number }>();

    for (const row of productMix(sales, { since: range.since })) {
      const productId = row.productId || productOfVariant.get(row.variantId) || "";
      const product = products.find(p => p.id === productId);
      if (!showIngredientProducts && product?.availableAsIngredient) continue;
      const key = productId || row.variantId;
      const existing = byProduct.get(key) ?? { name: product?.name || row.productName || "Unknown", quantity: 0, revenueCents: 0 };
      existing.quantity += row.quantity;
      existing.revenueCents += row.revenueCents;
      byProduct.set(key, existing);
    }

    return Array.from(byProduct.values()).sort((a, b) => b.revenueCents - a.revenueCents);
  }, [sales, products, variants, showIngredientProducts, range]);

  const revenueCents = Math.round(totals.sales * 100);

  // Labour for the same window as the revenue above it, so the percentage divides two
  // numbers that mean the same period. Until Feature 13 landed, that denominator was
  // generateMockSalesData() and this figure would have changed on every render.
  const labor = useMemo(
    () => laborCost(timePunches, employees, { since: range.since, now: Date.now() }),
    [timePunches, employees, range],
  );
  const laborPercent = laborPct(labor, revenueCents);

  // Margins, from the same costing the API's menu-margins endpoint uses and the same
  // volumes as the mix tab above. Worst first; unknown-cost rows are flagged, never
  // sorted as though a missing ingredient price were a 100% margin.
  const marginRows = useMemo(
    () => menuMargins(
      { products, variants, modifiers, bomEntries: bom, inventoryItems: inventory },
      productMix(sales, { since: range.since }),
    ),
    [products, variants, modifiers, bom, inventory, sales, range],
  );

  // An unknown cost is only actionable if the operator can reach the item that needs a
  // price. "Go find which of your 60 ingredients is missing one" is not a report.
  const inventoryIdByName = useMemo(() => new Map(inventory.map(i => [i.name, i.id])), [inventory]);

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
      <AppShell title="Reports">
        <div className="flex flex-col gap-6">
          <header className="rounded-3xl border bg-card shadow-soft p-6">
            <h2 className="text-2xl font-serif">Performance</h2>
            <p className="text-muted-foreground text-sm">Analyze sales, trends, and inventory health.</p>
          </header>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <TabsList className="bg-card border shadow-sm rounded-xl h-12 p-1 w-fit">
                <TabsTrigger value="sales" className="rounded-lg h-full px-4">
                  <TrendingUp className="h-4 w-4 mr-2" /> Sales Trends
                </TabsTrigger>
                <TabsTrigger value="product-mix" className="rounded-lg h-full px-4">
                  <PieChart className="h-4 w-4 mr-2" /> Product Mix
                </TabsTrigger>
                <TabsTrigger value="margins" className="rounded-lg h-full px-4">
                  <Percent className="h-4 w-4 mr-2" /> Margins
                </TabsTrigger>
                <TabsTrigger value="inventory" className="rounded-lg h-full px-4">
                  <Package className="h-4 w-4 mr-2" /> Inventory
                </TabsTrigger>
              </TabsList>

              {activeTab === "sales" && (
                <div className="flex flex-col gap-3 w-full sm:w-[180px]">
                  <div className="flex justify-between">
                    <Label className="text-xs text-muted-foreground">Granularity</Label>
                    <span className="text-xs font-medium capitalize text-primary">{currentGranularity}</span>
                  </div>
                  <Slider value={granularityIndex} onValueChange={setGranularityIndex} max={2} step={1} className="cursor-pointer" />
                </div>
              )}
            </div>

            <TabsContent value="sales" className="space-y-6 mt-0">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <KpiCard title={`Total Revenue (${range.label})`} value={hasSales ? formatMoney(totals.sales * 100) : "\u2014"} icon={<DollarSign className="h-4 w-4" />} />
                <KpiCard title={`Avg Ticket (${range.label})`} value={hasSales ? formatMoney(totals.avgCheck * 100) : "\u2014"} icon={<TrendingUp className="h-4 w-4" />} />
                <KpiCard title={`Transactions (${range.label})`} value={hasSales ? totals.txns.toString() : "\u2014"} icon={<Users className="h-4 w-4" />} />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <KpiCard
                  title={`Labour Cost (${range.label})`}
                  value={labor.hoursWithUnknownRate > 0 ? "\u2014" : formatMoney(labor.costCents)}
                  icon={<Wallet className="h-4 w-4" />}
                />
                {/* The form operators actually manage against. Null rather than a number
                    whose numerator is a guess. */}
                <KpiCard
                  title={`Labour % of Revenue (${range.label})`}
                  value={laborPercent == null ? "\u2014" : `${laborPercent.toFixed(1)}%`}
                  icon={<Percent className="h-4 w-4" />}
                />
                <KpiCard title={`Hours Worked (${range.label})`} value={labor.hours.toFixed(1)} icon={<Clock className="h-4 w-4" />} />
              </div>
              {(labor.unclosedPunches.length > 0 || labor.hoursWithUnknownRate > 0 || labor.inProgress.length > 0) && (
                <div className="rounded-2xl border bg-card p-4 text-sm space-y-2" data-testid="text-labour-caveats">
                  {labor.unclosedPunches.length > 0 && (
                    <p className="flex items-start gap-2 text-destructive" data-testid="text-labour-unclosed">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                      <span>
                        <strong>{labor.unclosedPunches.length} punch{labor.unclosedPunches.length > 1 ? "es" : ""} never clocked out</strong>{" "}
                        ({labor.unclosedPunches.map(p => `${p.employeeName}, ${p.hoursOpen.toFixed(0)}h open`).join("; ")}).
                        Those hours are <em>not</em> in the figures above — close them and this number will change.
                      </span>
                    </p>
                  )}
                  {labor.hoursWithUnknownRate > 0 && (
                    <p className="flex items-start gap-2 text-amber-700 dark:text-amber-500" data-testid="text-labour-unknown-rate">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                      <span>
                        {labor.hoursWithUnknownRate.toFixed(1)} hours worked by {labor.unknownRateEmployees.join(", ")} have no pay
                        rate set, so no labour cost or percentage can be stated. Set a rate on the{" "}
                        <Link href="/employees" className="underline">employees page</Link>.
                      </span>
                    </p>
                  )}
                  {labor.inProgress.length > 0 && (
                    <p className="text-muted-foreground" data-testid="text-labour-in-progress">
                      {labor.inProgress.length} shift{labor.inProgress.length > 1 ? "s" : ""} still in progress
                      ({labor.inProgress.map(p => p.employeeName).join(", ")}), counted up to now.
                    </p>
                  )}
                </div>
              )}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <ChartCard title="Sales Overview" data={salesData} dataKey="sales" format="currency" />
                <ChartCard title="Transaction Volume" data={salesData} dataKey="transactions" />
              </div>
            </TabsContent>

            <TabsContent value="product-mix" className="mt-0">
              <Card className="shadow-soft rounded-2xl">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle>Product Performance <span className="text-sm font-normal text-muted-foreground">({range.label})</span></CardTitle>
                    <div className="flex items-center gap-2" data-testid="toggle-show-ingredient-products">
                      <Label className="text-xs text-muted-foreground">Show ingredient products</Label>
                      <Switch
                        checked={showIngredientProducts}
                        onCheckedChange={setShowIngredientProducts}
                        data-testid="switch-show-ingredient-products"
                      />
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Product</TableHead>
                        <TableHead className="text-right">Units Sold</TableHead>
                        <TableHead className="text-right">Revenue</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {productMixData.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={3} className="text-center text-muted-foreground py-8" data-testid="text-no-product-mix">
                            No sales yet
                          </TableCell>
                        </TableRow>
                      ) : productMixData.map((item, i) => (
                        <TableRow key={i}>
                          <TableCell className="font-medium">{item.name}</TableCell>
                          <TableCell className="text-right">{item.quantity}</TableCell>
                          <TableCell className="text-right">{formatMoney(item.revenueCents)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="margins" className="mt-0">
              <Card className="shadow-soft rounded-2xl">
                <CardHeader>
                  <CardTitle>
                    Menu Margins <span className="text-sm font-normal text-muted-foreground">(volumes: {range.label})</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {marginRows.length === 0 ? (
                    <p className="text-sm text-muted-foreground" data-testid="text-no-margins">No menu items yet.</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Item</TableHead>
                          <TableHead className="text-right">Price</TableHead>
                          <TableHead className="text-right">Cost</TableHead>
                          <TableHead className="text-right">Margin</TableHead>
                          <TableHead className="text-right">Sold</TableHead>
                          <TableHead className="text-right">Contribution</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {marginRows.map(row => (
                          <TableRow key={row.variantId} data-testid={`row-margin-${row.variantId}`}>
                            <TableCell className="font-medium">
                              {row.productName} <span className="text-muted-foreground">{row.variantName}</span>
                              {!row.costKnown && (
                                <span className="mt-1 flex flex-wrap items-center gap-1 text-xs text-muted-foreground" data-testid={`text-margin-unknown-${row.variantId}`}>
                                  <AlertTriangle className="h-3 w-3 text-amber-600" />
                                  No price for
                                  {row.unknownIngredients.map(name => {
                                    const id = inventoryIdByName.get(name);
                                    return id ? (
                                      <Link key={name} href={`/inventory?item=${encodeURIComponent(id)}`} className="underline">{name}</Link>
                                    ) : (
                                      <span key={name}>{name}</span>
                                    );
                                  })}
                                </span>
                              )}
                            </TableCell>
                            <TableCell className="text-right font-mono">{formatMoney(row.priceCents)}</TableCell>
                            {/* An unknown cost is not a cheap one: show nothing rather than a floor
                                that reads as the answer. */}
                            <TableCell className="text-right font-mono">{row.costKnown ? formatMoney(row.costCents) : "\u2014"}</TableCell>
                            <TableCell className={`text-right font-mono ${row.costKnown && row.marginCents < 0 ? "font-semibold text-destructive" : ""}`}>
                              {row.costKnown ? `${formatMoney(row.marginCents)} (${row.marginPct!.toFixed(1)}%)` : "unknown"}
                            </TableCell>
                            <TableCell className="text-right font-mono">{row.quantity}</TableCell>
                            <TableCell className={`text-right font-mono ${row.contributionCents < 0 ? "font-semibold text-destructive" : ""}`}>
                              {row.costKnown ? formatMoney(row.contributionCents) : "\u2014"}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="inventory" className="mt-0">
              <Card className="shadow-soft rounded-2xl">
                <CardHeader><CardTitle>Inventory Status</CardTitle></CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Item</TableHead>
                        <TableHead className="text-right">On Hand</TableHead>
                        <TableHead className="text-right">Unit</TableHead>
                        <TableHead className="text-center">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {inventory.map(item => {
                        const lowAlert = item.lowStockThreshold ?? 0;
                        // Same rule as the inventory page: over-drawn is its own state, not "Low".
                        const isOverDrawn = item.currentQuantity < 0;
                        const isLow = !isOverDrawn && lowAlert > 0 && item.currentQuantity <= lowAlert;
                        return (
                          <TableRow key={item.id}>
                            <TableCell className="font-medium">{item.name}</TableCell>
                            <TableCell className="text-right font-mono">{item.currentQuantity}</TableCell>
                            <TableCell className="text-right text-muted-foreground">{item.unitOfMeasure}</TableCell>
                            <TableCell className="text-center">
                              <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${isOverDrawn ? 'bg-red-600 text-white' : isLow ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                                {isOverDrawn ? "Over-drawn" : isLow ? "Low" : "OK"}
                              </span>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </AppShell>
    </motion.div>
  );
}
