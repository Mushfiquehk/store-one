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
  Clock,
  LogOut
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
import { useStore } from "@/lib/store";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const nav = [
  { href: "/", label: "POS", icon: LayoutGrid, testid: "link-nav-pos" },
  { href: "/reports", label: "Reports", icon: BarChart3, testid: "link-nav-reports" },
  { href: "/menu", label: "Menu", icon: ClipboardList, testid: "link-nav-menu" },
  { href: "/recipes", label: "Recipes", icon: Soup, testid: "link-nav-recipes" },
  { href: "/inventory", label: "Ingredients", icon: Package, testid: "link-nav-inventory" },
  { href: "/employees", label: "Employees", icon: Users, testid: "link-nav-employees" },
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
  const { employees, timePunches, addTimePunch, updateTimePunch } = useStore();
  
  // Time Punch State
  const [isTimePunchOpen, setIsTimePunchOpen] = useState(false);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>("");
  
  // Check if selected employee is currently clocked in
  const activePunch = timePunches.find(tp => tp.employeeId === selectedEmployeeId && !tp.timeOut);
  const isClockedIn = !!activePunch;

  const handleTimePunchSubmit = () => {
    if (!selectedEmployeeId) {
      toast({ title: "Error", description: "Please select an employee", variant: "destructive" });
      return;
    }

    const emp = employees.find(e => e.id === selectedEmployeeId);
    
    if (isClockedIn && activePunch) {
      // Clock Out
      updateTimePunch(activePunch.id, { timeOut: Date.now() });
      toast({ title: "Clocked Out", description: `Goodbye, ${emp?.name}! Session ended at ${new Date().toLocaleTimeString()}` });
    } else {
      // Clock In
      addTimePunch({
        id: `tp_${Date.now()}`,
        employeeId: selectedEmployeeId,
        timeIn: Date.now()
      });
      toast({ title: "Clocked In", description: `Welcome, ${emp?.name}! Started at ${new Date().toLocaleTimeString()}` });
    }
    
    setIsTimePunchOpen(false);
    setSelectedEmployeeId("");
  };

  return (
    <div className="min-h-screen app-shell">
      {/* Time Punch Dialog */}
      <Dialog open={isTimePunchOpen} onOpenChange={setIsTimePunchOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Time Clock</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Select Employee</Label>
              <Select value={selectedEmployeeId} onValueChange={setSelectedEmployeeId}>
                <SelectTrigger>
                  <SelectValue placeholder="Who are you?" />
                </SelectTrigger>
                <SelectContent>
                  {employees.map(emp => (
                    <SelectItem key={emp.id} value={emp.id}>{emp.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            {selectedEmployeeId && (
              <div className={`p-4 rounded-xl border flex items-center gap-3 ${isClockedIn ? 'bg-orange-500/10 border-orange-500/20' : 'bg-green-500/10 border-green-500/20'}`}>
                <div className={`p-2 rounded-full ${isClockedIn ? 'bg-orange-500/20 text-orange-600' : 'bg-green-500/20 text-green-600'}`}>
                  {isClockedIn ? <LogOut className="h-5 w-5" /> : <Clock className="h-5 w-5" />}
                </div>
                <div>
                  <p className="font-medium">{isClockedIn ? "Ready to Clock Out?" : "Ready to Clock In?"}</p>
                  <p className="text-xs text-muted-foreground">
                    {isClockedIn 
                      ? `Started: ${new Date(activePunch.timeIn).toLocaleTimeString()}` 
                      : "Start your shift now"}
                  </p>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsTimePunchOpen(false)}>Cancel</Button>
            <Button 
              onClick={handleTimePunchSubmit} 
              disabled={!selectedEmployeeId}
              variant={isClockedIn ? "destructive" : "default"}
            >
              {isClockedIn ? "Clock Out" : "Clock In"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
                        <Link key={n.href} href={n.href}>
                          <Button
                            variant={active ? "default" : "ghost"}
                            className={cn("w-full justify-start rounded-xl text-base h-12 mb-1", active ? "" : "text-muted-foreground")}
                          >
                            <Icon className="mr-3 h-5 w-5" />
                            {n.label}
                            {active && <ArrowRight className="ml-auto h-4 w-4 opacity-50" />}
                          </Button>
                        </Link>
                      );
                    })}
                  </div>
                  
                  <div className="mt-auto border-t pt-4">
                    <Button 
                      variant="outline" 
                      className="w-full justify-start rounded-xl text-base h-12 text-primary border-primary/20 hover:bg-primary/5"
                      onClick={() => setIsTimePunchOpen(true)}
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
