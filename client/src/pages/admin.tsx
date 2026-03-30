import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  LayoutDashboard,
  Users,
  Package,
  Warehouse,
  ShoppingCart,
  RefreshCw,
  Clock,
  Server,
  FileText,
} from "lucide-react";
import { AdminStoreProvider } from "@/lib/admin-store";
import ProductsPage from "./products";
import AdminInvoiceIntake from "@/components/admin-invoice-intake";
import InteractiveSyncUI from "@/components/interactive-sync";

type Metrics = {
  clientCount: number;
  totalProducts: number;
  totalVariants: number;
  totalInventoryItems: number;
  totalSales: number;
};

type ClientInfo = {
  id: number;
  code: string;
  name: string | null;
  createdAt: string;
  lastBackupAt: string | null;
};

function DashboardTab() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [clients, setClients] = useState<ClientInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [metricsRes, clientsRes] = await Promise.all([
        fetch("/api/admin/metrics"),
        fetch("/api/clients"),
      ]);
      if (!metricsRes.ok || !clientsRes.ok) throw new Error("Failed to fetch data");
      setMetrics(await metricsRes.json());
      setClients(await clientsRes.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load dashboard data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "Never";
    return new Date(dateStr).toLocaleString();
  };

  const statCards = metrics
    ? [
        { label: "Registered Clients", value: metrics.clientCount, icon: Users, color: "text-blue-600" },
        { label: "Total Products", value: metrics.totalProducts + metrics.totalVariants, icon: Package, color: "text-green-600" },
        { label: "Inventory Items", value: metrics.totalInventoryItems, icon: Warehouse, color: "text-orange-600" },
        { label: "Total Sales", value: metrics.totalSales, icon: ShoppingCart, color: "text-purple-600" },
      ]
    : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div />
        <Button variant="outline" size="sm" onClick={fetchData} disabled={loading} data-testid="button-refresh-dashboard">
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {error && (
        <Card className="border-destructive">
          <CardContent className="pt-6">
            <p className="text-destructive" data-testid="text-admin-error">{error}</p>
          </CardContent>
        </Card>
      )}

      {loading && !metrics ? (
        <div className="flex items-center justify-center py-20">
          <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : metrics ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {statCards.map((stat) => (
              <Card key={stat.label} className="border shadow-soft rounded-2xl overflow-hidden">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">{stat.label}</p>
                      <p className="text-3xl font-bold mt-1" data-testid={`text-metric-${stat.label.toLowerCase().replace(/\s/g, "-")}`}>
                        {stat.value.toLocaleString()}
                      </p>
                    </div>
                    <div className={`p-3 rounded-xl bg-muted/50 ${stat.color}`}>
                      <stat.icon className="h-6 w-6" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card className="border shadow-soft rounded-2xl overflow-hidden">
            <CardHeader className="bg-muted/20 pb-4">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-primary/10 text-primary">
                  <Server className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle className="font-serif">Connected Clients</CardTitle>
                  <CardDescription>All registered POS client instances and their backup status</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-4">
              {clients.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground" data-testid="text-no-clients">
                  <Users className="h-10 w-10 mx-auto mb-3 opacity-50" />
                  <p>No clients have registered yet.</p>
                  <p className="text-sm mt-1">Clients will appear here after their first backup.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Client Code</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Registered</TableHead>
                      <TableHead>Last Backup</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {clients.map((client) => (
                      <TableRow key={client.id} data-testid={`row-client-${client.id}`}>
                        <TableCell className="font-mono font-medium" data-testid={`text-client-code-${client.id}`}>
                          {client.code}
                        </TableCell>
                        <TableCell>{client.name || "\u2014"}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatDate(client.createdAt)}
                        </TableCell>
                        <TableCell className="text-sm">
                          <div className="flex items-center gap-1.5">
                            <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                            <span data-testid={`text-last-backup-${client.id}`}>{formatDate(client.lastBackupAt)}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={client.lastBackupAt ? "default" : "secondary"} data-testid={`badge-status-${client.id}`}>
                            {client.lastBackupAt ? "Active" : "No Backup"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}


export default function AdminPage() {
  const [activeTab, setActiveTab] = useState("dashboard");

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto p-6 space-y-6">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10 text-primary">
            <LayoutDashboard className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-serif font-bold" data-testid="text-admin-title">Admin Dashboard</h1>
            <p className="text-sm text-muted-foreground">Server-side data management and client overview</p>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="bg-card border shadow-sm rounded-xl h-12 p-1 w-fit">
            <TabsTrigger value="dashboard" className="rounded-lg h-full px-4" data-testid="tab-admin-dashboard">
              <LayoutDashboard className="h-4 w-4 mr-2" /> Dashboard
            </TabsTrigger>
            <TabsTrigger value="products" className="rounded-lg h-full px-4" data-testid="tab-admin-products">
              <Package className="h-4 w-4 mr-2" /> Products
            </TabsTrigger>
            <TabsTrigger value="invoices" className="rounded-lg h-full px-4" data-testid="tab-admin-invoices">
              <FileText className="h-4 w-4 mr-2" /> Invoice Intake
            </TabsTrigger>
            <TabsTrigger value="sync" className="rounded-lg h-full px-4" data-testid="tab-admin-sync">
              <RefreshCw className="h-4 w-4 mr-2" /> Sync
            </TabsTrigger>
          </TabsList>

          <TabsContent value="dashboard" className="mt-6">
            <DashboardTab />
          </TabsContent>

          <TabsContent value="products" className="mt-6">
            <AdminStoreProvider>
              <ProductsPage embedded />
            </AdminStoreProvider>
          </TabsContent>

          <TabsContent value="invoices" className="mt-6">
            <AdminStoreProvider>
              <AdminInvoiceIntake />
            </AdminStoreProvider>
          </TabsContent>

          <TabsContent value="sync" className="mt-6">
            <InteractiveSyncUI mode="admin" />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
