import { Link, useLocation, useRoute } from "wouter";
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
  Link2,
  Sliders,
  Users,
  Clock
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState } from "react";
import { PinProtection } from "@/components/pin-protection";
import { useToast } from "@/hooks/use-toast";

const nav = [
  { href: "/", label: "POS", icon: LayoutGrid, testid: "link-nav-pos" },
  { href: "/reports", label: "Reports", icon: BarChart3, testid: "link-nav-reports" },
  { href: "/menu", label: "Menu", icon: ClipboardList, testid: "link-nav-menu" },
  { href: "/recipes", label: "Recipes", icon: Soup, testid: "link-nav-recipes" },
  { href: "/inventory", label: "Ingredients", icon: Package, testid: "link-nav-inventory" },
  { href: "/employees", label: "Employees", icon: Users, testid: "link-nav-employees", protected: true },
  { href: "/start", label: "Getting Started", icon: Sparkles, testid: "link-nav-start" },
  { href: "/integrations", label: "Integrations", icon: Link2, testid: "link-nav-integrations" },
  { href: "/settings", label: "Settings", icon: Settings, testid: "link-nav-settings" },
];

export default function AppShell({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const [location, setLocation] = useLocation();
  const [taxRate, setTaxRate] = useState(8.25);
  const { toast } = useToast();
  
  const [pinOpen, setPinOpen] = useState(false);
  const [targetPath, setTargetPath] = useState<string | null>(null);

  const handleNavClick = (n: typeof nav[0]) => {
    if (n.protected) {
      setTargetPath(n.href);
      setPinOpen(true);
    } else {
      setLocation(n.href);
    }
  };

  const handlePinSuccess = () => {
    if (targetPath) {
      setLocation(targetPath);
      setTargetPath(null);
    }
  };

  const handleTimePunch = () => {
    toast({ title: "Time Punch", description: "Clocked in successfully at " + new Date().toLocaleTimeString() });
  };

  return (
    <div className="min-h-screen app-shell">
      <PinProtection 
        isOpen={pinOpen} 
        onClose={() => setPinOpen(false)} 
        onSuccess={handlePinSuccess}
        title="Admin Access"
      />

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
                  <SheetTitle className="font-serif text-xl text-left">CornerShop</SheetTitle>
                </SheetHeader>
                <div className="mt-6 flex flex-col gap-2 relative h-[calc(100vh-100px)]">
                  <div className="flex-1">
                    {nav.map((n) => {
                      const active = location === n.href;
                      const Icon = n.icon;
                      return (
                        <Button
                          key={n.href}
                          variant={active ? "default" : "ghost"}
                          className={cn("w-full justify-start rounded-xl text-base h-12 mb-1", active ? "" : "text-muted-foreground")}
                          onClick={() => handleNavClick(n)}
                        >
                          <Icon className="mr-3 h-5 w-5" />
                          {n.label}
                          {n.protected && <span className="ml-auto text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground">PIN</span>}
                          {active && !n.protected && <ArrowRight className="ml-auto h-4 w-4 opacity-50" />}
                        </Button>
                      );
                    })}
                  </div>
                  
                  <div className="mt-auto border-t pt-4">
                    <Button 
                      variant="outline" 
                      className="w-full justify-start rounded-xl text-base h-12 text-primary border-primary/20 hover:bg-primary/5"
                      onClick={handleTimePunch}
                    >
                      <Clock className="mr-3 h-5 w-5" />
                      Time Punch
                    </Button>
                  </div>
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
            <div className="text-2xl font-serif font-bold tracking-tight text-primary sm:block">
              CornerShop
            </div>
          </div>
        </div>

        <div>{children}</div>
      </div>
    </div>
  );
}
