import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { 
  BarChart3, 
  FileDown, 
  Calendar as CalendarIcon, 
  TrendingUp, 
  DollarSign, 
  Users, 
  Package, 
  PieChart 
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
  Legend, 
  AreaChart, 
  Area 
} from "recharts";

import AppShell from "@/components/app-shell";
import HelpDialog from "@/components/help-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";

function formatMoney(cents: number) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

function generateMockSalesData(granularity: 'hourly' | 'daily' | 'monthly') {
  const data = [];
  
  if (granularity === 'hourly') {
    for (let i = 6; i <= 22; i++) { // 6 AM to 10 PM
      const transactions = Math.floor(Math.random() * 20) + 5;
      const avgCheck = Math.floor(Math.random() * 500) + 800; // $8.00 - $13.00
      data.push({
        label: `${i}:00`,
        sales: (transactions * avgCheck) / 100,
        transactions,
        avgCheck: avgCheck / 100
      });
    }
  } else if (granularity === 'daily') {
    for (let i = 1; i <= 30; i++) {
      const transactions = Math.floor(Math.random() * 50) + 40;
      const avgCheck = Math.floor(Math.random() * 400) + 900;
      data.push({
        label: `Day ${i}`,
        sales: (transactions * avgCheck) / 100,
        transactions,
        avgCheck: avgCheck / 100
      });
    }
  } else {
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    months.forEach(m => {
      const transactions = Math.floor(Math.random() * 1000) + 800;
      const avgCheck = Math.floor(Math.random() * 200) + 1000;
      data.push({
        label: m,
        sales: (transactions * avgCheck) / 100,
        transactions,
        avgCheck: avgCheck / 100
      });
    });
  }
  return data;
}

export default function ReportsPage() {
  const { toast } = useToast();
  const { menu, inventory } = useStore();

  // Date Range State
  const [date, setDate] = useState<Date | undefined>(new Date());
  
  // Granularity State (0=Hourly, 1=Daily, 2=Monthly)
  const [granularityIndex, setGranularityIndex] = useState([1]); 
  const granularities = ['hourly', 'daily', 'monthly'] as const;
  const currentGranularity = granularities[granularityIndex[0]];

  // Mock Data
  const salesData = useMemo(() => generateMockSalesData(currentGranularity), [currentGranularity]);
  
  const productMixData = useMemo(() => {
    return menu.slice(0, 8).map(item => ({
      name: item.name,
      quantity: Math.floor(Math.random() * 100) + 20,
      revenue: (Math.floor(Math.random() * 100) + 20) * (item.priceCents / 100)
    })).sort((a, b) => b.revenue - a.revenue);
  }, [menu]);

  const inventoryReportData = useMemo(() => {
    return inventory.map(item => {
      const beginning = item.onHand + Math.floor(Math.random() * 20);
      const received = Math.floor(Math.random() * 10);
      const sold = Math.floor(Math.random() * 15);
      const wastage = Math.floor(Math.random() * 3);
      // ending calculation assumes some randomness for the mock
      const ending = Math.max(0, beginning + received - sold - wastage);
      const cogs = (sold + wastage) * item.unitCostCents;

      return {
        ...item,
        beginning,
        received,
        sold,
        wastage,
        ending,
        cogs
      };
    });
  }, [inventory]);

  const totalSales = salesData.reduce((acc, curr) => acc + curr.sales, 0);
  const totalTxns = salesData.reduce((acc, curr) => acc + curr.transactions, 0);
  const avgCheck = totalTxns ? totalSales / totalTxns : 0;

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
      <AppShell title="Reports">
        <div className="flex flex-col gap-6">
          
          {/* Controls Header */}
          <header className="rounded-3xl border bg-card shadow-soft p-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
              <div>
                <h2 className="text-2xl font-serif">Performance</h2>
                <p className="text-muted-foreground text-sm">Analyze sales, trends, and inventory health.</p>
              </div>
              
              <div className="flex flex-col sm:flex-row gap-6 items-center w-full md:w-auto">
                 {/* Date Picker */}
                 <div className="flex flex-col gap-1.5 w-full sm:w-auto">
                    <Label className="text-xs text-muted-foreground">Date Range</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant={"outline"}
                          className={cn(
                            "w-full sm:w-[240px] justify-start text-left font-normal rounded-xl",
                            !date && "text-muted-foreground"
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {date ? format(date, "PPP") : <span>Pick a date</span>}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="end">
                        <Calendar
                          mode="single"
                          selected={date}
                          onSelect={setDate}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                 </div>

                 {/* Granularity Slider */}
                 <div className="flex flex-col gap-3 w-full sm:w-[200px]">
                    <div className="flex justify-between">
                       <Label className="text-xs text-muted-foreground">Granularity</Label>
                       <span className="text-xs font-medium capitalize text-primary">{currentGranularity}</span>
                    </div>
                    <Slider
                      value={granularityIndex}
                      onValueChange={setGranularityIndex}
                      max={2}
                      step={1}
                      className="cursor-pointer"
                    />
                    <div className="flex justify-between text-[10px] text-muted-foreground px-1">
                      <span>Hour</span>
                      <span>Day</span>
                      <span>Month</span>
                    </div>
                 </div>
              </div>
            </div>
          </header>

          <Tabs defaultValue="sales" className="space-y-6">
            <TabsList className="bg-card border shadow-sm rounded-xl h-12 p-1">
              <TabsTrigger value="sales" className="rounded-lg h-full px-4 data-[state=active]:bg-primary/10 data-[state=active]:text-primary">
                <TrendingUp className="h-4 w-4 mr-2" /> Sales Trends
              </TabsTrigger>
              <TabsTrigger value="product-mix" className="rounded-lg h-full px-4 data-[state=active]:bg-primary/10 data-[state=active]:text-primary">
                <PieChart className="h-4 w-4 mr-2" /> Product Mix
              </TabsTrigger>
              <TabsTrigger value="inventory" className="rounded-lg h-full px-4 data-[state=active]:bg-primary/10 data-[state=active]:text-primary">
                <Package className="h-4 w-4 mr-2" /> Inventory Log
              </TabsTrigger>
            </TabsList>

            {/* --- Sales Tab --- */}
            <TabsContent value="sales" className="space-y-6">
              {/* KPIs */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="shadow-soft rounded-2xl">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
                    <DollarSign className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-serif font-bold">{new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(totalSales)}</div>
                    <p className="text-xs text-muted-foreground">+20.1% from last period</p>
                  </CardContent>
                </Card>
                <Card className="shadow-soft rounded-2xl">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Avg Ticket</CardTitle>
                    <TrendingUp className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-serif font-bold">{new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(avgCheck)}</div>
                    <p className="text-xs text-muted-foreground">+4% from last period</p>
                  </CardContent>
                </Card>
                <Card className="shadow-soft rounded-2xl">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Transactions</CardTitle>
                    <Users className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-serif font-bold">{totalTxns}</div>
                    <p className="text-xs text-muted-foreground">+12% from last period</p>
                  </CardContent>
                </Card>
              </div>

              {/* Charts */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                 <Card className="shadow-soft rounded-2xl p-6">
                    <h3 className="text-lg font-medium mb-4">Sales Overview</h3>
                    <div className="h-[300px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={salesData}>
                          <defs>
                            <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                              <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                          <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{fontSize: 12}} />
                          <YAxis axisLine={false} tickLine={false} tick={{fontSize: 12}} tickFormatter={(value) => `$${value}`} />
                          <Tooltip 
                            contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                            formatter={(value: number) => [`$${value.toFixed(2)}`, 'Sales']}
                          />
                          <Area type="monotone" dataKey="sales" stroke="hsl(var(--primary))" strokeWidth={3} fillOpacity={1} fill="url(#colorSales)" />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                 </Card>

                 <Card className="shadow-soft rounded-2xl p-6">
                    <h3 className="text-lg font-medium mb-4">Transaction Volume</h3>
                    <div className="h-[300px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={salesData}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                          <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{fontSize: 12}} />
                          <YAxis axisLine={false} tickLine={false} tick={{fontSize: 12}} />
                          <Tooltip 
                            cursor={{fill: 'hsl(var(--muted))'}}
                            contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                          />
                          <Bar dataKey="transactions" fill="hsl(var(--accent))" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                 </Card>
              </div>
            </TabsContent>

            {/* --- Product Mix Tab --- */}
            <TabsContent value="product-mix">
              <Card className="shadow-soft rounded-2xl p-6">
                <div className="flex justify-between items-center mb-6">
                   <h3 className="text-lg font-medium">Top Selling Items</h3>
                   <Button variant="outline" size="sm" className="rounded-xl">Export CSV</Button>
                </div>
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
              </Card>
            </TabsContent>

            {/* --- Inventory Tab --- */}
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
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Item Name</TableHead>
                        <TableHead className="text-right">Beginning</TableHead>
                        <TableHead className="text-right">Received</TableHead>
                        <TableHead className="text-right">Sold</TableHead>
                        <TableHead className="text-right">Wastage</TableHead>
                        <TableHead className="text-right font-bold">Ending</TableHead>
                        <TableHead className="text-right">Unit Cost</TableHead>
                        <TableHead className="text-right">COGS</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {inventoryReportData.map((row) => (
                        <TableRow key={row.id}>
                          <TableCell className="font-medium">{row.name}</TableCell>
                          <TableCell className="text-right text-muted-foreground">{row.beginning}</TableCell>
                          <TableCell className="text-right text-green-600">+{row.received}</TableCell>
                          <TableCell className="text-right">{row.sold}</TableCell>
                          <TableCell className="text-right text-destructive">-{row.wastage}</TableCell>
                          <TableCell className="text-right font-bold">{row.ending}</TableCell>
                          <TableCell className="text-right text-muted-foreground">{formatMoney(row.unitCostCents)}</TableCell>
                          <TableCell className="text-right font-medium">{formatMoney(row.cogs)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </Card>
            </TabsContent>
          </Tabs>

        </div>
      </AppShell>
    </motion.div>
  );
}