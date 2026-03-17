import { Route, Switch } from "wouter";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { StoreProvider } from "@/lib/store";

import OnboardingPage from "@/pages/onboarding";
import PosPage from "@/pages/pos";
import InventoryPage from "@/pages/inventory";
import ProductsPage from "@/pages/products";
import ReportsPage from "@/pages/reports";
import IntegrationsPage from "@/pages/integrations";
import SettingsPage from "@/pages/settings";
import EmployeesPage from "@/pages/employees";
import DemoPage from "@/pages/demo";

function Router() {
  return (
    <Switch>
      <Route path="/" component={PosPage} />
      <Route path="/start" component={OnboardingPage} />
      <Route path="/products" component={ProductsPage} />
      <Route path="/reports" component={ReportsPage} />
      <Route path="/integrations" component={IntegrationsPage} />
      <Route path="/employees" component={EmployeesPage} />
      <Route path="/settings" component={SettingsPage} />
      <Route path="/demo" component={DemoPage} />

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
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
