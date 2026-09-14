import { motion } from "framer-motion";
import { Link2 } from "lucide-react";
import AppShell from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import { integrationsByCategory, type Integration } from "@shared/integrations";

const payment = integrationsByCategory("payment");
const inventory = integrationsByCategory("inventory");

export default function IntegrationsPage() {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
      <AppShell title="Integrations">
        <div className="flex flex-col gap-6 max-w-5xl mx-auto">
          <div className="flex flex-col gap-2">
            <h2 className="text-2xl font-serif">Connect Services</h2>
            <p className="text-muted-foreground">
              Planned connections to third-party inventory and payment providers. None of these is
              built yet, so nothing here can be switched on.
            </p>
            {/* The page used to imply the till needed one of these to take a card. It does not. */}
            <p className="text-sm text-muted-foreground">
              Taking card payments does not depend on any of this — a terminal from your bank works
              today. Turn Card on under <Link href="/settings" className="underline">Settings → Payment Methods</Link>.
            </p>
          </div>

          <Tabs defaultValue="all" className="w-full">
            <TabsList className="bg-card border shadow-sm rounded-xl h-12 p-1 mb-6 w-full sm:w-auto justify-start overflow-x-auto">
              <TabsTrigger value="all" className="rounded-lg h-full px-6">All</TabsTrigger>
              <TabsTrigger value="inventory" className="rounded-lg h-full px-6">Inventory</TabsTrigger>
              <TabsTrigger value="payment" className="rounded-lg h-full px-6">Payment</TabsTrigger>
            </TabsList>

            <TabsContent value="all" className="space-y-8 mt-0">
              <IntegrationSection label="Payment" integrations={payment} />
              <IntegrationSection label="Inventory" integrations={inventory} />
            </TabsContent>

            <TabsContent value="inventory" className="mt-0">
              <IntegrationGrid integrations={inventory} />
            </TabsContent>

            <TabsContent value="payment" className="mt-0">
              <IntegrationGrid integrations={payment} />
            </TabsContent>
          </Tabs>
        </div>
      </AppShell>
    </motion.div>
  );
}

function IntegrationSection({ label, integrations }: { label: string; integrations: Integration[] }) {
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-medium flex items-center gap-2">
        <Badge variant="outline" className="rounded-md">{label}</Badge>
      </h3>
      <IntegrationGrid integrations={integrations} />
    </div>
  );
}

function IntegrationGrid({ integrations }: { integrations: Integration[] }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {integrations.map(integration => (
        <IntegrationCard key={integration.id} integration={integration} />
      ))}
    </div>
  );
}

function IntegrationCard({ integration }: { integration: Integration }) {
  const planned = integration.status === "planned";
  return (
    <Card className="shadow-soft" data-testid={`card-integration-${integration.id}`}>
      <CardHeader className="pb-3">
        <div className="flex justify-between items-start">
          <div className="h-10 w-10 rounded-xl bg-muted flex items-center justify-center mb-2">
            <Link2 className="h-5 w-5 text-muted-foreground" />
          </div>
          {planned && <Badge variant="outline" className="rounded-md">Not available yet</Badge>}
        </div>
        <CardTitle className="text-base">{integration.name}</CardTitle>
        <CardDescription className="line-clamp-2 min-h-[2.5rem]">{integration.description}</CardDescription>
      </CardHeader>
      <CardContent>
        {/* A disabled button that says what is true, rather than one that toasts
            "Successfully linked" about a provider that was never contacted. */}
        <Button variant="outline" className="w-full rounded-xl" disabled={planned}>
          {planned ? "Planned" : "Connect"}
        </Button>
      </CardContent>
    </Card>
  );
}
