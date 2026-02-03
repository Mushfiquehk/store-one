import { Route, Switch } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { queryClient } from "./lib/queryClient";
import { StoreProvider } from "@/lib/store";

import OnboardingPage from "@/pages/onboarding";
import PosPage from "@/pages/pos";
import InventoryPage from "@/pages/inventory";
import RecipesPage from "@/pages/recipes";
import MenuPage from "@/pages/menu";
import ReportsPage from "@/pages/reports";

function Router() {
  return (
    <Switch>
      <Route path="/" component={PosPage} />
      <Route path="/start" component={OnboardingPage} />
      <Route path="/inventory" component={InventoryPage} />
      <Route path="/recipes" component={RecipesPage} />
      <Route path="/menu" component={MenuPage} />
      <Route path="/reports" component={ReportsPage} />

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <StoreProvider>
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </StoreProvider>
    </QueryClientProvider>
  );
}

export default App;
