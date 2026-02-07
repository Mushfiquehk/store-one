import { motion } from "framer-motion";
import { Link2, CheckCircle2, AlertCircle } from "lucide-react";
import AppShell from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useStore } from "@/lib/store";

export default function IntegrationsPage() {
  const { integrations, toggleIntegration } = useStore();

  const inventoryIntegrations = [
    { id: "inv_sysco", name: "Sysco Connect", description: "Auto-order produce and proteins.", category: "inventory" },
    { id: "inv_usfoods", name: "US Foods", description: "Sync dry goods and bakery stock.", category: "inventory" },
    { id: "inv_local", name: "Local Farms API", description: "Direct connection to local suppliers.", category: "inventory" },
  ];

  const paymentIntegrations = [
    { id: "pay_stripe", name: "Stripe Terminal", description: "Accept card payments securely.", category: "payment" },
    { id: "pay_square", name: "Square Reader", description: "Integration for Square hardware.", category: "payment" },
    { id: "pay_toast", name: "Toast Connect", description: "Link existing Toast terminals.", category: "payment" },
  ];

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
      <AppShell title="Integrations">
        <div className="flex flex-col gap-6 max-w-5xl mx-auto">
          <div className="flex flex-col gap-2">
            <h2 className="text-2xl font-serif">Connect Services</h2>
            <p className="text-muted-foreground">Manage your connections to third-party inventory and payment providers.</p>
          </div>

          <Tabs defaultValue="all" className="w-full">
            <TabsList className="bg-card border shadow-sm rounded-xl h-12 p-1 mb-6 w-full sm:w-auto justify-start overflow-x-auto">
              <TabsTrigger value="all" className="rounded-lg h-full px-6">All</TabsTrigger>
              <TabsTrigger value="inventory" className="rounded-lg h-full px-6">Inventory</TabsTrigger>
              <TabsTrigger value="payment" className="rounded-lg h-full px-6">Payment</TabsTrigger>
            </TabsList>

            <TabsContent value="all" className="space-y-8 mt-0">
              <div className="space-y-4">
                <h3 className="text-lg font-medium flex items-center gap-2">
                  <Badge variant="outline" className="rounded-md">Payment</Badge>
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {paymentIntegrations.map(integ => (
                    <IntegrationCard key={integ.id} integration={integ} isConnected={integrations.includes(integ.id)} onToggle={() => toggleIntegration(integ.id)} />
                  ))}
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="text-lg font-medium flex items-center gap-2">
                  <Badge variant="outline" className="rounded-md">Inventory</Badge>
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {inventoryIntegrations.map(integ => (
                    <IntegrationCard key={integ.id} integration={integ} isConnected={integrations.includes(integ.id)} onToggle={() => toggleIntegration(integ.id)} />
                  ))}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="inventory" className="mt-0">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {inventoryIntegrations.map(integ => (
                  <IntegrationCard key={integ.id} integration={integ} isConnected={integrations.includes(integ.id)} onToggle={() => toggleIntegration(integ.id)} />
                ))}
              </div>
            </TabsContent>

            <TabsContent value="payment" className="mt-0">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {paymentIntegrations.map(integ => (
                  <IntegrationCard key={integ.id} integration={integ} isConnected={integrations.includes(integ.id)} onToggle={() => toggleIntegration(integ.id)} />
                ))}
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </AppShell>
    </motion.div>
  );
}

function IntegrationCard({ integration, isConnected, onToggle }: { integration: any, isConnected: boolean, onToggle: () => void }) {
  return (
    <Card className={`transition-all duration-200 ${isConnected ? 'border-primary/50 bg-primary/5 shadow-md' : 'shadow-soft hover:shadow-md'}`}>
      <CardHeader className="pb-3">
        <div className="flex justify-between items-start">
          <div className="h-10 w-10 rounded-xl bg-muted flex items-center justify-center mb-2">
            {isConnected ? <CheckCircle2 className="h-6 w-6 text-primary" /> : <Link2 className="h-5 w-5 text-muted-foreground" />}
          </div>
          {isConnected && <Badge className="bg-primary/20 text-primary hover:bg-primary/20 border-none">Connected</Badge>}
        </div>
        <CardTitle className="text-base">{integration.name}</CardTitle>
        <CardDescription className="line-clamp-2 min-h-[2.5rem]">{integration.description}</CardDescription>
      </CardHeader>
      <CardContent>
        <Button 
          variant={isConnected ? "outline" : "default"} 
          className={`w-full rounded-xl ${isConnected ? 'hover:bg-destructive/10 hover:text-destructive hover:border-destructive/50' : ''}`}
          onClick={onToggle}
        >
          {isConnected ? "Disconnect" : "Connect"}
        </Button>
      </CardContent>
    </Card>
  );
}
