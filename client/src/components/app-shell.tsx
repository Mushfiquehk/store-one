import { Link, useLocation } from "wouter";
import {
  BarChart3,
  ClipboardList,
  LayoutGrid,
  Menu as MenuIcon,
  Package,
  Sparkles,
  Soup,
  ArrowRight,
  Settings,
  Link2
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState } from "react";

const nav = [
  { href: "/", label: "POS", icon: LayoutGrid, testid: "link-nav-pos" },
  { href: "/reports", label: "Reports", icon: BarChart3, testid: "link-nav-reports" },
  { href: "/menu", label: "Menu", icon: ClipboardList, testid: "link-nav-menu" },
  { href: "/recipes", label: "Recipes", icon: Soup, testid: "link-nav-recipes" },
  { href: "/inventory", label: "Ingredients", icon: Package, testid: "link-nav-inventory" },
  { href: "/start", label: "Getting Started", icon: Sparkles, testid: "link-nav-start" },
  { href: "/integrations", label: "Integrations", icon: Link2, testid: "link-nav-integrations" },
];

export default function AppShell({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const [location] = useLocation();
  const [taxRate, setTaxRate] = useState(8.25);

  return (
    <div className="min-h-screen app-shell">
      <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="outline" size="icon" className="shrink-0 rounded-xl">
                  <MenuIcon className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-[280px] sm:w-[320px]">
                <SheetHeader>
                  <SheetTitle className="font-serif text-xl text-left">CornerPOS</SheetTitle>
                </SheetHeader>
                <div className="mt-6 flex flex-col gap-2">
                  {nav.map((n) => {
                    const active = location === n.href;
                    const Icon = n.icon;
                    return (
                      <Link key={n.href} href={n.href}>
                        <Button
                          variant={active ? "default" : "ghost"}
                          className={cn("w-full justify-start rounded-xl text-base h-12", active ? "" : "text-muted-foreground")}
                        >
                          <Icon className="mr-3 h-5 w-5" />
                          {n.label}
                          {active && <ArrowRight className="ml-auto h-4 w-4 opacity-50" />}
                        </Button>
                      </Link>
                    );
                  })}
                </div>
              </SheetContent>
            </Sheet>

            <div>
              <h1 className="font-serif text-xl leading-none" data-testid="text-page-title">
                {title}
              </h1>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="icon" className="rounded-xl h-9 w-9 text-muted-foreground hover:text-primary">
                  <Settings className="h-5 w-5" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-64 rounded-2xl p-4 shadow-xl border-primary/10">
                <div className="space-y-4">
                  <h4 className="font-medium leading-none">Settings</h4>
                  <div className="space-y-2">
                    <Label htmlFor="tax-rate" className="text-xs">Global Tax Rate (%)</Label>
                    <Input 
                      id="tax-rate"
                      type="number" 
                      value={taxRate} 
                      onChange={(e) => setTaxRate(Number(e.target.value))}
                      className="rounded-xl h-9"
                    />
                  </div>
                </div>
              </PopoverContent>
            </Popover>
            <div className="text-2xl font-serif font-bold tracking-tight text-primary sm:block">
              CornerPOS
            </div>
          </div>
        </div>

        <div>{children}</div>
      </div>
    </div>
  );
}
