import { Link, useLocation } from "wouter";
import {
  BarChart3,
  ClipboardList,
  LayoutGrid,
  Package,
  Sparkles,
  Soup,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const nav = [
  { href: "/", label: "POS", icon: LayoutGrid, testid: "link-nav-pos" },
  { href: "/start", label: "Start", icon: Sparkles, testid: "link-nav-start" },
  { href: "/inventory", label: "Inventory", icon: Package, testid: "link-nav-inventory" },
  { href: "/recipes", label: "Recipes", icon: Soup, testid: "link-nav-recipes" },
  { href: "/menu", label: "Menu", icon: ClipboardList, testid: "link-nav-menu" },
  { href: "/reports", label: "Reports", icon: BarChart3, testid: "link-nav-reports" },
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
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <p className="text-xs font-medium text-muted-foreground" data-testid="text-app-name">
              CornerPOS
            </p>
            <h1 className="mt-1 truncate font-serif text-2xl" data-testid="text-page-title">
              {title}
            </h1>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2" data-testid="nav-top">
            {nav.map((n) => {
              const active = location === n.href;
              const Icon = n.icon;
              return (
                <Link key={n.href} href={n.href} data-testid={n.testid}>
                  <Button
                    variant={active ? "default" : "secondary"}
                    className={cn("rounded-2xl", !active && "bg-background/60")}
                    data-testid={`${n.testid}-button`}
                  >
                    <Icon className="mr-2 h-4 w-4" />
                    {n.label}
                  </Button>
                </Link>
              );
            })}
          </div>
        </div>

        <div className="mt-6">{children}</div>
      </div>
    </div>
  );
}
