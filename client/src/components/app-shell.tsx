import { Link, useLocation } from "wouter";
import {
  BarChart3,
  ClipboardList,
  LayoutGrid,
  Package,
  Sparkles,
  Soup,
} from "lucide-react";
import { HamburgerMenuIcon } from "@radix-ui/react-icons";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium text-muted-foreground" data-testid="text-app-name">
              CornerPOS
            </p>
            <h1 className="mt-1 truncate font-serif text-2xl" data-testid="text-page-title">
              {title}
            </h1>
          </div>

          <div className="min-w-0" data-testid="nav-top">
            {/* Small screens: scrollable pill row */}
            <div className="sm:hidden" data-testid="nav-mobile">
              <div className="nav-scroll -mr-4 flex max-w-[78vw] items-center gap-2 overflow-x-auto pr-4" data-testid="nav-scroll">
                {nav.map((n) => {
                  const active = location === n.href;
                  const Icon = n.icon;
                  return (
                    <Link key={n.href} href={n.href} data-testid={n.testid}>
                      <Button
                        variant={active ? "default" : "secondary"}
                        className={cn("shrink-0 rounded-2xl", !active && "bg-background/60")}
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

            {/* Larger screens: visible buttons + optional overflow */}
            <div className="hidden items-center justify-end gap-2 sm:flex" data-testid="nav-desktop">
              {nav.slice(0, 4).map((n) => {
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

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="secondary" className="rounded-2xl bg-background/60" data-testid="button-nav-more">
                    <HamburgerMenuIcon />
                    <span className="ml-2">More</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>Navigate</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {nav.slice(4).map((n) => {
                    const Icon = n.icon;
                    return (
                      <Link key={n.href} href={n.href} data-testid={`${n.testid}-more`}>
                        <DropdownMenuItem className="gap-2" data-testid={`${n.testid}-item`}>
                          <Icon className="h-4 w-4" />
                          {n.label}
                        </DropdownMenuItem>
                      </Link>
                    );
                  })}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>

        <div className="mt-6">{children}</div>
      </div>
    </div>
  );
}
