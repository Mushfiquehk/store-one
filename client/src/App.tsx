import { useEffect, useRef } from "react";
import { Route, Switch } from "wouter";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { StoreProvider } from "@/lib/store";
import { isDemoDataSeeded, seedDemoData } from "@/lib/seed-data";

import OnboardingPage from "@/pages/onboarding";
import PosPage from "@/pages/pos";
import InventoryPage from "@/pages/inventory";
import ProductsPage from "@/pages/products";
import ReportsPage from "@/pages/reports";
import IntegrationsPage from "@/pages/integrations";
import SettingsPage from "@/pages/settings";
import EmployeesPage from "@/pages/employees";
import DemoPage from "@/pages/demo";
import AdminPage from "@/pages/admin";

function Router() {
  return (
    <Switch>
      <Route path="/" component={PosPage} />
      <Route path="/start" component={OnboardingPage} />
      <Route path="/products">{() => <ProductsPage />}</Route>
      <Route path="/reports" component={ReportsPage} />
      <Route path="/integrations" component={IntegrationsPage} />
      <Route path="/employees" component={EmployeesPage} />
      <Route path="/settings" component={SettingsPage} />
      <Route path="/demo" component={DemoPage} />
      <Route path="/admin" component={AdminPage} />

      <Route component={NotFound} />
    </Switch>
  );
}

function useAutoSeedDemo() {
  const ran = useRef(false);
  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    isDemoDataSeeded().then((seeded) => {
      if (!seeded) {
        seedDemoData().then(() => {
          console.log("Auto-seeded demo data");
        }).catch((err) => {
          console.error("Auto-seed failed:", err);
        });
      }
    });
  }, []);
}

function App() {
  useAutoSeedDemo();

  return (
    <StoreProvider>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </StoreProvider>
  );
}

export default App;
