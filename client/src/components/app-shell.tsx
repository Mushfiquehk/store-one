import { Link, useLocation } from "wouter";
import {
  BarChart3,
  ClipboardList,
  LayoutGrid,
  Menu as MenuIcon,
  Package,
  Sparkles,
  Soup,
  ArrowRight
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

const nav = [
  { href: "/", label: "POS", icon: LayoutGrid, testid: "link-nav-pos" },
  { href: "/inventory", label: "Inventory", icon: Package, testid: "link-nav-inventory" },
  { href: "/recipes", label: "Recipes", icon: Soup, testid: "link-nav-recipes" },
  { href: "/menu", label: "Menu", icon: ClipboardList, testid: "link-nav-menu" },
  { href: "/reports", label: "Reports", icon: BarChart3, testid: "link-nav-reports" },
  { href: "/start", label: "Getting Started", icon: Sparkles, testid: "link-nav-start" },
];

export default function AppShell({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const [location] = useLocation();

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
          
          <div className="text-xs font-medium text-muted-foreground hidden sm:block">
            CornerPOS
          </div>
        </div>

        <div>{children}</div>
      </div>
    </div>
  );
}
