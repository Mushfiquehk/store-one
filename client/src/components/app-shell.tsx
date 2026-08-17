import { Link, useLocation, useRoute } from "wouter";
import {
  BarChart3,
  CalendarDays,
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
  LogOut,
  Banknote
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCallback, useEffect, useState } from "react";
import { PinProtection } from "@/components/pin-protection";
import { useToast } from "@/hooks/use-toast";
import { useStore } from "@/lib/store";
import { parseDollarsToCents } from "@shared/money";
import {
  DEFAULT_VARIANCE_NOTE_THRESHOLD_CENTS, VARIANCE_NOTE_THRESHOLD_KEY, closeSummary, expectedCash,
  openSession, varianceNeedsNote, varianceNoteThresholdCents,
  type DrawerSale, type DrawerSession, type ExpectedCash,
} from "@shared/drawer";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const nav = [
  { href: "/", label: "POS", icon: LayoutGrid, testid: "link-nav-pos" },
  { href: "/reports", label: "Reports", icon: BarChart3, testid: "link-nav-reports" },
  { href: "/products", label: "Products", icon: ClipboardList, testid: "link-nav-products" },
  { href: "/employees", label: "Employees", icon: Users, testid: "link-nav-employees" },
  { href: "/schedule", label: "Schedule", icon: CalendarDays, testid: "link-nav-schedule" },
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
  const { toast } = useToast();
  const {
    employees, timePunches, addTimePunch, updateTimePunch, currentEmployee, setCurrentEmployeeId,
    sales, getDrawerSessions, openDrawerSession, closeDrawerSession, getCashMovements, logAction,
  } = useStore();
  
  // Drawer state. The count is entered before anything else is shown — see the dialog below.
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [session, setSession] = useState<DrawerSession | null>(null);
  const [floatInput, setFloatInput] = useState("");
  const [countInput, setCountInput] = useState("");
  const [countNote, setCountNote] = useState("");
  const [reveal, setReveal] = useState<{ counted: number; expected: ExpectedCash } | null>(null);
  const [threshold, setThreshold] = useState(DEFAULT_VARIANCE_NOTE_THRESHOLD_CENTS);

  const refreshSession = useCallback(async () => {
    const sessions = await getDrawerSessions();
    setSession(openSession(sessions));
  }, [getDrawerSessions]);

  useEffect(() => { refreshSession().catch(() => {}); }, [refreshSession]);

  useEffect(() => {
    fetch(`/api/settings/${VARIANCE_NOTE_THRESHOLD_KEY}`)
      .then(r => r.json())
      .then(d => setThreshold(varianceNoteThresholdCents(d.value)))
      .catch(() => {});
  }, []);

  const handleOpenDrawer = async () => {
    const cents = parseDollarsToCents(floatInput);
    if (cents == null) {
      toast({ title: "Opening float required", description: "Enter what is in the drawer to start with.", variant: "destructive" });
      return;
    }
    try {
      await openDrawerSession(cents);
      await refreshSession();
      setFloatInput("");
      toast({ title: "Drawer open", description: `Starting with ${(cents / 100).toFixed(2)}.` });
    } catch (err) {
      // Refused rather than opening a second session: two make every sale ambiguous.
      toast({ title: "Not opened", description: err instanceof Error ? err.message : "Failed", variant: "destructive" });
    }
  };

  // Step one: the count, with nothing else on screen. Only then is expected computed and shown —
  // a count taken with the target visible is not a count.
  const handleSubmitCount = async () => {
    if (!session) return;
    const counted = parseDollarsToCents(countInput);
    if (counted == null) {
      toast({ title: "Enter the counted total", variant: "destructive" });
      return;
    }
    const expected = expectedCash(session, sales as DrawerSale[], await getCashMovements(), Date.now());
    setReveal({ counted, expected });
  };

  const handleConfirmClose = async () => {
    if (!session || !reveal) return;
    const variance = reveal.counted - reveal.expected.expectedCents;
    if (varianceNeedsNote(variance, threshold) && !countNote.trim()) {
      toast({
        title: "A note is required",
        description: "Say what you think happened while you still remember it.",
        variant: "destructive",
      });
      return;
    }

    await closeDrawerSession(session.id, {
      countedCents: reveal.counted,
      expectedCents: reveal.expected.expectedCents,
      note: countNote.trim(),
    });
    // A closed drawer is a decision with money attached: it belongs in the same list as the voids.
    await logAction({
      action: "DRAWER_CLOSED",
      targetType: "drawerSession",
      targetId: session.id,
      summary: closeSummary(reveal.counted, reveal.expected.expectedCents, reveal.expected.basis),
      detail: { varianceCents: variance, basis: reveal.expected.basis, note: countNote.trim() || null },
    });

    setReveal(null);
    setCountInput("");
    setCountNote("");
    setIsDrawerOpen(false);
    await refreshSession();
    toast({ title: "Drawer closed", description: closeSummary(reveal.counted, reveal.expected.expectedCents, reveal.expected.basis) });
  };

  // Time Punch State
  const [isTimePunchOpen, setIsTimePunchOpen] = useState(false);
  // The dialog's own selection, defaulting to whoever is already on the till.
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>(currentEmployee?.id ?? "");
  
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
      // Clock Out — and this is the one place clearing the current employee is correct.
      updateTimePunch(activePunch.id, { timeOut: Date.now() });
      if (currentEmployee?.id === selectedEmployeeId) setCurrentEmployeeId(null);
      toast({ title: "Clocked Out", description: `Goodbye, ${emp?.name}! Session ended at ${new Date().toLocaleTimeString()}` });
    } else {
      // Clock In
      addTimePunch({
        id: `tp_${Date.now()}`,
        employeeId: selectedEmployeeId,
        timeIn: Date.now()
      });
      // Clocking in is what puts someone on the till, and it survives a reload.
      setCurrentEmployeeId(selectedEmployeeId);
      toast({ title: "Clocked In", description: `Welcome, ${emp?.name}! Started at ${new Date().toLocaleTimeString()}` });
    }

    setIsTimePunchOpen(false);
    // Deliberately not clearing the current employee here: closing a dialog is not clocking
    // out, and treating it as such is why nothing could ever be attributed to anyone.
  };

  return (
    <div className="min-h-screen app-shell">
      {/* Drawer Dialog — the count is entered before the expected figure exists on screen. */}
      <Dialog open={isDrawerOpen} onOpenChange={open => { setIsDrawerOpen(open); if (!open) { setReveal(null); setCountNote(""); setCountInput(""); } }}>
        <DialogContent className="sm:max-w-md" data-testid="dialog-drawer">
          <DialogHeader>
            <DialogTitle>{session ? "Close the drawer" : "Open the drawer"}</DialogTitle>
          </DialogHeader>

          {!session ? (
            <div className="space-y-3 py-2">
              <Label htmlFor="drawer-float">Opening float</Label>
              <Input
                id="drawer-float"
                inputMode="decimal"
                value={floatInput}
                onChange={e => setFloatInput(e.target.value)}
                placeholder="200.00"
                data-testid="input-drawer-float"
              />
              <Button className="w-full" onClick={handleOpenDrawer} data-testid="button-open-drawer">Open drawer</Button>
            </div>
          ) : !reveal ? (
            <div className="space-y-3 py-2">
              <p className="text-sm text-muted-foreground">
                Count the drawer and enter the total. What the sales say should be there is shown after —
                a count taken with the target on screen is not a count.
              </p>
              <Label htmlFor="drawer-count">Counted total</Label>
              <Input
                id="drawer-count"
                inputMode="decimal"
                value={countInput}
                onChange={e => setCountInput(e.target.value)}
                placeholder="0.00"
                autoFocus
                data-testid="input-drawer-count"
              />
              <Button className="w-full" onClick={handleSubmitCount} data-testid="button-submit-count">
                Submit count
              </Button>
            </div>
          ) : (
            <div className="space-y-3 py-2" data-testid="drawer-reveal">
              <div className="rounded-xl border p-3 text-sm space-y-1">
                <div className="flex justify-between"><span className="text-muted-foreground">Counted</span><span className="font-mono">{(reveal.counted / 100).toFixed(2)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Expected</span><span className="font-mono" data-testid="text-drawer-expected">{(reveal.expected.expectedCents / 100).toFixed(2)}</span></div>
                <div className="flex justify-between font-medium">
                  <span>Variance</span>
                  <span className={reveal.counted - reveal.expected.expectedCents === 0 ? "font-mono" : "font-mono text-destructive"} data-testid="text-drawer-variance">
                    {((reveal.counted - reveal.expected.expectedCents) / 100).toFixed(2)}
                  </span>
                </div>
                {reveal.expected.basis === "SALE_TOTALS" && (
                  <p className="pt-1 text-xs text-amber-700 dark:text-amber-500">
                    Expected is approximate: some cash sales did not record what was handed over.
                  </p>
                )}
              </div>
              <Label htmlFor="drawer-note">
                Note{varianceNeedsNote(reveal.counted - reveal.expected.expectedCents, threshold) ? " (required)" : " (optional)"}
              </Label>
              <Input
                id="drawer-note"
                value={countNote}
                onChange={e => setCountNote(e.target.value)}
                placeholder="What do you think happened?"
                data-testid="input-drawer-note"
              />
              <Button className="w-full" onClick={handleConfirmClose} data-testid="button-confirm-close-drawer">
                Close drawer
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

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
                    <Button
                      variant="outline"
                      className="mt-2 w-full justify-start rounded-xl text-base h-12 text-primary border-primary/20 hover:bg-primary/5"
                      onClick={() => setIsDrawerOpen(true)}
                      data-testid="button-drawer"
                    >
                      <Banknote className="mr-3 h-5 w-5" />
                      {session ? "Close drawer" : "Open drawer"}
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
            {/* Who is on the till, where the operator can see and change it. */}
            <Button
              variant="ghost"
              size="sm"
              className="rounded-full"
              onClick={() => { setSelectedEmployeeId(currentEmployee?.id ?? ""); setIsTimePunchOpen(true); }}
              data-testid="button-current-employee"
            >
              <Clock className="mr-2 h-4 w-4" />
              {currentEmployee ? currentEmployee.name : "No one on till"}
            </Button>
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
