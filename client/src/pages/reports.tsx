import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { 
  FileDown, 
  Calendar as CalendarIcon, 
  TrendingUp, 
  DollarSign, 
  Users, 
  Package, 
  PieChart,
  ArrowUpRight,
  ArrowDownRight,
  AlertCircle,
  Share2
} from "lucide-react";
import { format, addDays, subDays, differenceInDays } from "date-fns";
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
  Legend 
} from "recharts";

import AppShell from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import type { DateRange } from "react-day-picker";
import { useToast } from "@/hooks/use-toast";

function formatMoney(cents: number) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

function generateMockSalesData(
  granularity: 'hourly' | 'daily' | 'monthly', 
  hasComparison: boolean,
  dateRange?: { from: Date; to: Date }
) {
  const data = [];
  
  if (granularity === 'hourly') {
    for (let i = 6; i <= 22; i++) {
      const transactions = Math.floor(Math.random() * 20) + 5;
      const sales = (transactions * (Math.floor(Math.random() * 500) + 800)) / 100;
      const item = {
        label: `${i}:00`,
        sales,
        transactions,
      };
      if (hasComparison) {
        // @ts-ignore
        item.prevSales = sales * (0.8 + Math.random() * 0.4);
        // @ts-ignore
        item.prevTransactions = Math.floor(transactions * (0.8 + Math.random() * 0.4));
      }
      data.push(item);
    }
  } else if (granularity === 'daily') {
    const end = dateRange?.to || new Date();
    const start = dateRange?.from || subDays(end, 13);
    const diffTime = Math.abs(end.getTime() - start.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
    const daysToGenerate = Math.max(1, Math.min(diffDays + 1, 60));

    for (let i = 0; i < daysToGenerate; i++) {
      const date = addDays(start, i);
      const transactions = Math.floor(Math.random() * 50) + 40;
      const sales = (transactions * (Math.floor(Math.random() * 400) + 900)) / 100;
      const item = {
        label: format(date, "MMM dd"),
        sales,
        transactions,
      };
      if (hasComparison) {
        // @ts-ignore
        item.prevSales = sales * (0.8 + Math.random() * 0.4);
        // @ts-ignore
        item.prevTransactions = Math.floor(transactions * (0.8 + Math.random() * 0.4));
      }
      data.push(item);
    }
  } else {
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    months.forEach(m => {
      const transactions = Math.floor(Math.random() * 1000) + 800;
      const sales = (transactions * (Math.floor(Math.random() * 200) + 1000)) / 100;
      const item = {
        label: m,
        sales,
        transactions,
      };
      if (hasComparison) {
        // @ts-ignore
        item.prevSales = sales * (0.8 + Math.random() * 0.4);
        // @ts-ignore
        item.prevTransactions = Math.floor(transactions * (0.8 + Math.random() * 0.4));
      }
      data.push(item);
    });
  }
  return data;
}

export default function ReportsPage() {
  const { menu, inventory, inventoryCategories } = useStore();
  const { toast } = useToast();

  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: subDays(new Date(), 7),
    to: new Date(),
  });
  
  const [compareRange, setCompareRange] = useState<DateRange | undefined>();
  const [showCompare, setShowCompare] = useState(false);
  
  const [granularityIndex, setGranularityIndex] = useState([1]); 
  const granularities = ['hourly', 'daily', 'monthly'] as const;
  const currentGranularity = granularities[granularityIndex[0]];

  const salesData = useMemo(() => {
    // @ts-ignore
    return generateMockSalesData(currentGranularity, showCompare, dateRange);
  }, [currentGranularity, showCompare, dateRange]);
  
  const totals = useMemo(() => {
    const currentSales = salesData.reduce((acc, curr) => acc + curr.sales, 0);
    const currentTxns = salesData.reduce((acc, curr) => acc + curr.transactions, 0);
    
    let prevSales = 0;
    let prevTxns = 0;
    
    if (showCompare) {
      // @ts-ignore
      prevSales = salesData.reduce((acc, curr) => acc + (curr.prevSales || 0), 0);
      // @ts-ignore
      prevTxns = salesData.reduce((acc, curr) => acc + (curr.prevTransactions || 0), 0);
    }

    const salesDiff = prevSales ? ((currentSales - prevSales) / prevSales) * 100 : 0;
    const txnsDiff = prevTxns ? ((currentTxns - prevTxns) / prevTxns) * 100 : 0;

    return {
      sales: currentSales,
      txns: currentTxns,
      avgCheck: currentTxns ? currentSales / currentTxns : 0,
      salesDiff,
      txnsDiff
    };
  }, [salesData, showCompare]);

  const productMixData = useMemo(() => {
    return menu.slice(0, 8).map(item => ({
      name: item.name,
      quantity: Math.floor(Math.random() * 100) + 20,
      revenue: (Math.floor(Math.random() * 100) + 20) * (item.priceCents / 100)
    })).sort((a, b) => b.revenue - a.revenue);
  }, [menu]);

  const inventoryReportData = useMemo(() => {
    const reportData = inventory.map(item => {
      const beginning = item.onHand + Math.floor(Math.random() * 20);
      const received = Math.floor(Math.random() * 10);
      const sold = Math.floor(Math.random() * 15);
      const wastage = Math.floor(Math.random() * 3);
      const ending = Math.max(0, beginning + received - sold - wastage);
      const cogs = (sold + wastage) * item.unitCostCents;
      return { ...item, beginning, received, sold, wastage, ending, cogs };
    });

    // Group and aggregate by category
    const aggregated: Record<string, {
      beginning: number;
      received: number;
      sold: number;
      wastage: number;
      ending: number;
      cogs: number;
    }> = {};

    reportData.forEach(item => {
      const catName = inventoryCategories.find(c => c.id === item.categoryId)?.name || "Uncategorized";
      if (!aggregated[catName]) {
        aggregated[catName] = {
          beginning: 0,
          received: 0,
          sold: 0,
          wastage: 0,
          ending: 0,
          cogs: 0,
        };
      }
      aggregated[catName].beginning += item.beginning;
      aggregated[catName].received += item.received;
      aggregated[catName].sold += item.sold;
      aggregated[catName].wastage += item.wastage;
      aggregated[catName].ending += item.ending;
      aggregated[catName].cogs += item.cogs;
    });
    return aggregated;
  }, [inventory, inventoryCategories]);

  const rangeWarning = useMemo(() => {
    if (!showCompare || !dateRange?.from || !dateRange?.to || !compareRange?.from || !compareRange?.to) return null;
    
    const mainDiff = differenceInDays(dateRange.to, dateRange.from);
    const compareDiff = differenceInDays(compareRange.to, compareRange.from);
    
    if (mainDiff !== compareDiff) {
      return `Main period (${mainDiff + 1} days) and Comparison period (${compareDiff + 1} days) have different lengths. This may lead to skewed results.`;
    }
    return null;
  }, [showCompare, dateRange, compareRange]);

  const exportData = useMemo(() => {
    const payload = {
      reportType: "AI Operational Intelligence",
      generatedAt: new Date().toISOString(),
      dateRange: {
        from: dateRange?.from?.toISOString(),
        to: dateRange?.to?.toISOString(),
        granularity: currentGranularity,
      },
      kpis: {
        totalSales: totals.sales,
        totalTransactions: totals.txns,
        averageCheck: totals.avgCheck,
      },
      salesData: salesData.map(d => ({
        label: d.label,
        sales: d.sales,
        transactions: d.transactions,
        // @ts-ignore
        prevSales: d.prevSales,
      })),
      productMix: productMixData,
      inventory: Object.entries(inventoryReportData).map(([category, data]) => ({
        category,
        ...data,
        cogsFormatted: data.cogs / 100,
        cogsPercent: totals.sales > 0 ? (data.cogs / (totals.sales * 100)) * 100 : 0,
      })),
      context: "This data is optimized for LLM analysis. Please suggest optimizations for product pricing, wastage reduction, and peak hour staffing."
    };
    return JSON.stringify(payload, null, 2);
  }, [dateRange, currentGranularity, totals, salesData, productMixData, inventoryReportData]);

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(exportData);
      toast({ title: "Copied!", description: "AI analysis data copied to clipboard." });
    } catch {
      toast({ title: "Failed", description: "Clipboard access denied.", variant: "destructive" });
    }
  };

  const downloadFile = () => {
    const blob = new Blob([exportData], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `report-ai-export-${format(new Date(), "yyyy-MM-dd")}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast({ title: "Downloaded", description: "AI analysis file saved." });
  };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
      <AppShell title="Reports">
        <div className="flex flex-col gap-6">
          <header className="rounded-3xl border bg-card shadow-soft p-6">
            <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center w-full justify-between">
                <div>
                  <h2 className="text-2xl font-serif">Performance</h2>
                  <p className="text-muted-foreground text-sm">Analyze sales, trends, and inventory health.</p>
                </div>
                
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="rounded-xl border-primary/20 text-primary hover:bg-primary/5">
                      <Share2 className="mr-2 h-4 w-4" /> Export for AI
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-80 rounded-2xl p-4 shadow-xl border-primary/10">
                    <div className="grid gap-4">
                      <div className="space-y-2">
                        <h4 className="font-medium leading-none">AI Intelligence Export</h4>
                        <p className="text-sm text-muted-foreground">
                          Package all report data into a format optimized for analysis by LLMs like Claude or ChatGPT.
                        </p>
                      </div>
                      <div className="grid gap-2">
                        <Button className="rounded-xl" onClick={copyToClipboard}>Copy to Clipboard</Button>
                        <Button variant="outline" className="rounded-xl" onClick={downloadFile}>Download .txt</Button>
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
              
              <div className="flex flex-col lg:flex-row gap-4 items-end w-full xl:w-auto">
                 {rangeWarning && (
                   <div className="flex items-center gap-2 bg-amber-500/10 text-amber-600 dark:text-amber-400 px-4 py-2 rounded-xl text-xs font-medium border border-amber-500/20 animate-in fade-in slide-in-from-top-2">
                     <AlertCircle className="h-4 w-4 shrink-0" />
                     {rangeWarning}
                   </div>
                 )}
                 <div className="flex flex-col gap-1.5 w-full lg:w-[300px]">
                    <Label className="text-xs text-muted-foreground">Main Period</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className="w-full justify-start text-left font-normal rounded-xl">
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {dateRange?.from ? (
                            dateRange.to ? (
                              <>
                                {format(dateRange.from, "LLL dd")} - {format(dateRange.to, "LLL dd, y")}
                              </>
                            ) : (
                              format(dateRange.from, "LLL dd, y")
                            )
                          ) : (
                            <span>Pick a range</span>
                          )}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="end">
                        <Calendar mode="range" selected={dateRange} onSelect={setDateRange} initialFocus />
                      </PopoverContent>
                    </Popover>
                 </div>

                 <div className="flex flex-col gap-1.5 w-full lg:w-[300px]">
                    <div className="flex justify-between items-center">
                      <Label className="text-xs text-muted-foreground">Compare Period</Label>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="h-4 px-1 text-[10px] text-primary"
                        onClick={() => setShowCompare(!showCompare)}
                      >
                        {showCompare ? "Disable" : "Enable"}
                      </Button>
                    </div>
                    <Popover>
                      <PopoverTrigger asChild disabled={!showCompare}>
                        <Button variant="outline" className={cn("w-full justify-start text-left font-normal rounded-xl", !showCompare && "opacity-50")}>
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {compareRange?.from ? (
                            compareRange.to ? (
                              <>{format(compareRange.from, "LLL dd")} - {format(compareRange.to, "LLL dd, y")}</>
                            ) : (
                              format(compareRange.from, "LLL dd, y")
                            )
                          ) : (
                            <span>{showCompare ? "Pick compare range" : "Comparison disabled"}</span>
                          )}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="end">
                        <Calendar mode="range" selected={compareRange} onSelect={setCompareRange} initialFocus />
                      </PopoverContent>
                    </Popover>
                 </div>

                 <div className="flex flex-col gap-3 w-full lg:w-[180px]">
                    <div className="flex justify-between">
                       <Label className="text-xs text-muted-foreground">Granularity</Label>
                       <span className="text-xs font-medium capitalize text-primary">{currentGranularity}</span>
                    </div>
                    <Slider value={granularityIndex} onValueChange={setGranularityIndex} max={2} step={1} className="cursor-pointer" />
                 </div>
              </div>
            </div>
          </header>

          <Tabs defaultValue="sales" className="space-y-6">
            <TabsList className="bg-card border shadow-sm rounded-xl h-12 p-1">
              <TabsTrigger value="sales" className="rounded-lg h-full px-4">
                <TrendingUp className="h-4 w-4 mr-2" /> Sales Trends
              </TabsTrigger>
              <TabsTrigger value="product-mix" className="rounded-lg h-full px-4">
                <PieChart className="h-4 w-4 mr-2" /> Product Mix
              </TabsTrigger>
              <TabsTrigger value="inventory" className="rounded-lg h-full px-4">
                <Package className="h-4 w-4 mr-2" /> Inventory Log
              </TabsTrigger>
            </TabsList>

            <TabsContent value="sales" className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <KpiCard 
                  title="Total Revenue" 
                  value={formatMoney(totals.sales * 100)} 
                  diff={totals.salesDiff} 
                  showCompare={showCompare} 
                  icon={<DollarSign className="h-4 w-4 text-muted-foreground" />} 
                />
                <KpiCard 
                  title="Avg Ticket" 
                  value={formatMoney(totals.avgCheck * 100)} 
                  icon={<TrendingUp className="h-4 w-4 text-muted-foreground" />} 
                />
                <KpiCard 
                  title="Transactions" 
                  value={totals.txns.toString()} 
                  diff={totals.txnsDiff} 
                  showCompare={showCompare} 
                  icon={<Users className="h-4 w-4 text-muted-foreground" />} 
                />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                 <ChartCard title="Sales Overview" data={salesData} dataKey="sales" compareKey={showCompare ? "prevSales" : undefined} format="currency" />
                 <ChartCard title="Transaction Volume" data={salesData} dataKey="transactions" compareKey={showCompare ? "prevTransactions" : undefined} />
              </div>
            </TabsContent>

            <TabsContent value="product-mix">
              <Card className="shadow-soft rounded-2xl overflow-hidden">
                <div className="p-6 border-b bg-muted/20 flex justify-between items-center">
                   <h3 className="text-lg font-medium">Top Selling Items</h3>
                   <Button variant="outline" size="sm" className="rounded-xl">Export CSV</Button>
                </div>
                
                <div className="p-6">
                  <div className="h-[400px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart layout="vertical" data={productMixData} margin={{ top: 5, right: 30, left: 40, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
                        <XAxis type="number" hide />
                        <YAxis dataKey="name" type="category" width={120} tick={{fontSize: 12}} axisLine={false} tickLine={false} />
                        <Tooltip 
                          cursor={{fill: 'hsl(var(--muted))'}}
                          contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                          formatter={(value: number) => [`$${value.toFixed(2)}`, 'Revenue']}
                        />
                        <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} barSize={20} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="border-t">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Item Name</TableHead>
                        <TableHead className="text-right">Quantity Sold</TableHead>
                        <TableHead className="text-right">Total Revenue</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {productMixData.map((item, i) => (
                        <TableRow key={i}>
                          <TableCell className="font-medium">{item.name}</TableCell>
                          <TableCell className="text-right">{item.quantity}</TableCell>
                          <TableCell className="text-right font-medium">{formatMoney(item.revenue * 100)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </Card>
            </TabsContent>

            <TabsContent value="inventory">
              <Card className="shadow-soft rounded-2xl overflow-hidden">
                <div className="p-6 border-b bg-muted/20 flex justify-between items-center">
                   <div>
                      <h3 className="text-lg font-medium">COGS & Usage Report</h3>
                      <p className="text-sm text-muted-foreground">Calculated based on current unit costs.</p>
                   </div>
                   <Button variant="outline" className="rounded-xl">
                      <FileDown className="mr-2 h-4 w-4" /> Download Report
                   </Button>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Category</TableHead>
                      <TableHead className="text-right">Beginning</TableHead>
                      <TableHead className="text-right">Received</TableHead>
                      <TableHead className="text-right">Sold</TableHead>
                      <TableHead className="text-right">Wastage</TableHead>
                      <TableHead className="text-right font-bold">Ending</TableHead>
                      <TableHead className="text-right">COGS</TableHead>
                      <TableHead className="text-center">COGS %</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {Object.entries(inventoryReportData).map(([category, totalsRow]) => {
                      const netSalesCents = totals.sales * 100;
                      const cogsPercent = netSalesCents > 0 ? (totalsRow.cogs / netSalesCents) * 100 : 0;
                      return (
                        <TableRow key={category}>
                          <TableCell className="font-bold text-primary uppercase tracking-wider">
                            {category}
                          </TableCell>
                          <TableCell className="text-right text-muted-foreground">{totalsRow.beginning}</TableCell>
                          <TableCell className="text-right text-green-600">+{totalsRow.received}</TableCell>
                          <TableCell className="text-right">{totalsRow.sold}</TableCell>
                          <TableCell className="text-right text-destructive">-{totalsRow.wastage}</TableCell>
                          <TableCell className="text-right font-bold">{totalsRow.ending}</TableCell>
                          <TableCell className="text-right font-medium">{formatMoney(totalsRow.cogs)}</TableCell>
                          <TableCell className="text-center font-medium">
                            {cogsPercent.toFixed(1)}%
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </AppShell>
    </motion.div>
  );
}

function KpiCard({ title, value, diff, showCompare, icon }: { title: string, value: string, diff?: number, showCompare?: boolean, icon: React.ReactNode }) {
  return (
    <Card className="shadow-soft rounded-2xl">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-serif font-bold">{value}</div>
        {showCompare && diff !== undefined && (
          <div className={cn("flex items-center text-xs mt-1 font-medium", diff >= 0 ? "text-green-600" : "text-destructive")}>
            {diff >= 0 ? <ArrowUpRight className="h-3 w-3 mr-0.5" /> : <ArrowDownRight className="h-3 w-3 mr-0.5" />}
            {Math.abs(diff).toFixed(1)}% from last period
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ChartCard({ title, data, dataKey, compareKey, format }: { title: string, data: any[], dataKey: string, compareKey?: string, format?: 'currency' }) {
  return (
    <Card className="shadow-soft rounded-2xl p-6">
      <h3 className="text-lg font-medium mb-4">{title}</h3>
      <div className="h-[300px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
            <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{fontSize: 12}} />
            <YAxis axisLine={false} tickLine={false} tick={{fontSize: 12}} tickFormatter={(val) => format === 'currency' ? `$${val}` : val} />
            <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
            <Legend verticalAlign="top" align="right" height={36} iconType="circle" />
            <Line name="Current" type="monotone" dataKey={dataKey} stroke="hsl(var(--primary))" strokeWidth={3} dot={{ r: 4, fill: "hsl(var(--primary))" }} activeDot={{ r: 6 }} />
            {compareKey && (
              <Line name="Previous" type="monotone" dataKey={compareKey} stroke="hsl(var(--muted-foreground))" strokeWidth={2} strokeDasharray="5 5" dot={false} />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}