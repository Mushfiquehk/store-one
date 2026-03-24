import {
  TrendingUp,
  DollarSign,
  Users,
  Package,
  PieChart,
  Wallet,
} from "lucide-react";
import { format, subDays } from "date-fns";
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
import { useMemo, useState } from "react";
import { motion } from "framer-motion";

function formatMoney(cents: number) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(cents / 100);
}

function generateMockSalesData(granularity: 'hourly' | 'daily' | 'monthly') {
  const data = [];
  if (granularity === 'hourly') {
    for (let i = 6; i <= 22; i++) {
      const transactions = Math.floor(Math.random() * 20) + 5;
      const sales = (transactions * (Math.floor(Math.random() * 500) + 800)) / 100;
      data.push({ label: `${i}:00`, sales, transactions });
    }
  } else if (granularity === 'daily') {
    for (let i = 0; i < 14; i++) {
      const date = subDays(new Date(), 13 - i);
      const transactions = Math.floor(Math.random() * 50) + 40;
      const sales = (transactions * (Math.floor(Math.random() * 400) + 900)) / 100;
      data.push({ label: format(date, "MMM dd"), sales, transactions });
    }
  } else {
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    months.forEach(m => {
      const transactions = Math.floor(Math.random() * 1000) + 800;
      const sales = (transactions * (Math.floor(Math.random() * 200) + 1000)) / 100;
      data.push({ label: m, sales, transactions });
    });
  }
  return data;
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
      </CardContent>
    </Card>
  );
}

export default function ReportsPage() {
  const { products, variants, inventory, sales, employees } = useStore();

  const [granularityIndex, setGranularityIndex] = useState([1]);
  const granularities = ['hourly', 'daily', 'monthly'] as const;
  const currentGranularity = granularities[granularityIndex[0]];
  const [activeTab, setActiveTab] = useState("sales");
  const [showIngredientProducts, setShowIngredientProducts] = useState(false);

  const salesData = useMemo(() => generateMockSalesData(currentGranularity), [currentGranularity]);

  const totals = useMemo(() => {
    const currentSales = salesData.reduce((acc, curr) => acc + curr.sales, 0);
    const currentTxns = salesData.reduce((acc, curr) => acc + curr.transactions, 0);
    return {
      sales: currentSales,
      txns: currentTxns,
      avgCheck: currentTxns ? currentSales / currentTxns : 0,
    };
  }, [salesData]);

  const productMixData = useMemo(() => {
    const filtered = showIngredientProducts
      ? products
      : products.filter(p => !p.availableAsIngredient);
    return filtered.slice(0, 8).map(p => {
      const pvariants = variants.filter(v => v.productId === p.id);
      const avgPrice = pvariants.length > 0 ? pvariants.reduce((s, v) => s + v.basePrice, 0) / pvariants.length : 0;
      return {
        name: p.name,
        quantity: Math.floor(Math.random() * 100) + 20,
        revenue: (Math.floor(Math.random() * 100) + 20) * (avgPrice / 100),
      };
    }).sort((a, b) => b.revenue - a.revenue);
  }, [products, variants, showIngredientProducts]);

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
                <KpiCard title="Total Revenue" value={formatMoney(totals.sales * 100)} icon={<DollarSign className="h-4 w-4" />} />
                <KpiCard title="Avg Ticket" value={formatMoney(totals.avgCheck * 100)} icon={<TrendingUp className="h-4 w-4" />} />
                <KpiCard title="Transactions" value={totals.txns.toString()} icon={<Users className="h-4 w-4" />} />
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <ChartCard title="Sales Overview" data={salesData} dataKey="sales" format="currency" />
                <ChartCard title="Transaction Volume" data={salesData} dataKey="transactions" />
              </div>
            </TabsContent>

            <TabsContent value="product-mix" className="mt-0">
              <Card className="shadow-soft rounded-2xl">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle>Product Performance</CardTitle>
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
                      {productMixData.map((item, i) => (
                        <TableRow key={i}>
                          <TableCell className="font-medium">{item.name}</TableCell>
                          <TableCell className="text-right">{item.quantity}</TableCell>
                          <TableCell className="text-right">{formatMoney(item.revenue * 100)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
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
                        let lowAlert = 0;
                        try { lowAlert = JSON.parse(item.trackingConfig || "{}").low_stock_alert || 0; } catch {}
                        const isLow = item.currentQuantity <= lowAlert;
                        return (
                          <TableRow key={item.id}>
                            <TableCell className="font-medium">{item.name}</TableCell>
                            <TableCell className="text-right font-mono">{item.currentQuantity}</TableCell>
                            <TableCell className="text-right text-muted-foreground">{item.unitOfMeasure}</TableCell>
                            <TableCell className="text-center">
                              <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${isLow ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                                {isLow ? "Low" : "OK"}
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
