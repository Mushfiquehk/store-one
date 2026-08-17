import { motion } from "framer-motion";
import { formatDistanceToNow } from "date-fns";
import AppShell from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useStore } from "@/lib/store";
import { useState, useEffect, useCallback } from "react";
import {
  Settings, Percent, CloudUpload, CloudDownload, Database, CheckCircle2,
  XCircle, Loader2, RefreshCw, Package, Warehouse, ShoppingCart, Clock, Timer, FileText,
  CalendarClock, Mail, Save,
} from "lucide-react";
import InteractiveSyncUI from "@/components/interactive-sync";
import { useToast } from "@/hooks/use-toast";
import { db, BACKUP_TABLES } from "@/lib/db";
import {
  runBackup, getLastBackupAt, getAutoBackupEnabled, setAutoBackupEnabled,
  getAutoBackupInterval, setAutoBackupIntervalMinutes, startAutoBackup, stopAutoBackup,
} from "@/lib/backup";
import { planRestore, describeRestore, mergeRestoredSettings, SETTINGS_TABLE, type RestorePlan } from "@shared/backup";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  syncCategory, syncAll, getLastSyncedAt, getAutoSyncEnabled,
  setAutoSyncEnabled, getAutoSyncInterval, setAutoSyncIntervalMinutes,
  startAutoSync, stopAutoSync,
} from "@/lib/sync";
import {
  DEFAULT_TAX_RATE_PCT, DEFAULT_TENDER_METHODS, TAX_INCLUSIVE_KEY, TAX_RATE_KEY, TENDER_METHODS_KEY,
  taxRatePct, tenderMethods, type SyncCategory,
} from "@shared/schema";

type SyncStatus = "idle" | "syncing" | "success" | "error";

interface CategoryState {
  status: SyncStatus;
  message: string;
  lastSynced: number;
}

type PendingRestore = {
  snapshot: unknown;
  createdAt: number;
  plan: RestorePlan;
  counts: Record<string, number>;
};

const CATEGORY_CONFIG: { key: SyncCategory; label: string; icon: typeof Package; description: string }[] = [
  { key: "menu", label: "Menu Items", icon: Package, description: "Products, variants, modifier groups, and modifiers" },
  { key: "ingredients", label: "Ingredients", icon: Warehouse, description: "Inventory items and bill of materials" },
  { key: "sales", label: "Sales", icon: ShoppingCart, description: "Sales transactions and line items" },
  { key: "invoices", label: "Invoices", icon: FileText, description: "Invoices and invoice line items" },
];

type HoursOfOperation = {
  openHour: number;
  closeHour: number;
  operatingDays: number[];
};

type EmailConfig = {
  provider: string;
  host: string;
  port: number;
  secure: boolean;
  username: string;
  password: string;
  senderEmail: string;
  senderName: string;
};

const DEFAULT_HOURS: HoursOfOperation = { openHour: 6, closeHour: 22, operatingDays: [0, 1, 2, 3, 4, 5, 6] };
const DEFAULT_EMAIL: EmailConfig = { provider: "smtp", host: "", port: 587, secure: false, username: "", password: "", senderEmail: "", senderName: "" };

const PROVIDER_PRESETS: Record<string, Partial<EmailConfig>> = {
  smtp: { host: "", port: 587, secure: false },
  gmail: { host: "smtp.gmail.com", port: 587, secure: false },
  outlook: { host: "smtp-mail.outlook.com", port: 587, secure: false },
  sendgrid: { host: "smtp.sendgrid.net", port: 587, secure: false },
  ses: { host: "email-smtp.us-east-1.amazonaws.com", port: 587, secure: false },
};

export default function SettingsPage() {
  const { toast } = useToast();
  // Zero until the operator says otherwise: an unconfigured rate must look unconfigured.
  const [taxRate, setTaxRate] = useState(DEFAULT_TAX_RATE_PCT);
  const [taxSaving, setTaxSaving] = useState(false);
  const [taxInclusive, setTaxInclusive] = useState(false);
  const [clientCode, setClientCode] = useState(() => localStorage.getItem("cornerpos_client_code") || "");
  const [backupStatus, setBackupStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [restoreStatus, setRestoreStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [statusMessage, setStatusMessage] = useState("");
  const [pendingRestore, setPendingRestore] = useState<PendingRestore | null>(null);
  const [lastBackupAt, setLastBackupAt] = useState(getLastBackupAt());
  const [autoBackup, setAutoBackup] = useState(getAutoBackupEnabled());
  const [backupInterval, setBackupInterval] = useState(getAutoBackupInterval());

  const [acceptedMethods, setAcceptedMethods] = useState<string[]>(DEFAULT_TENDER_METHODS);
  const [hours, setHours] = useState<HoursOfOperation>(DEFAULT_HOURS);
  const [hoursSaving, setHoursSaving] = useState(false);
  const [emailConfig, setEmailConfig] = useState<EmailConfig>(DEFAULT_EMAIL);
  const [emailSaving, setEmailSaving] = useState(false);

  useEffect(() => {
    fetch("/api/settings/hoursOfOperation")
      .then(r => r.json())
      .then(d => { if (d.value) setHours(d.value as HoursOfOperation); })
      .catch(() => {});
    fetch(`/api/settings/${TAX_RATE_KEY}`)
      .then(r => r.json())
      .then(d => setTaxRate(taxRatePct(d.value)))
      .catch(() => {});
    fetch(`/api/settings/${TAX_INCLUSIVE_KEY}`)
      .then(r => r.json())
      .then(d => setTaxInclusive(d.value === true))
      .catch(() => {});
    fetch(`/api/settings/${TENDER_METHODS_KEY}`)
      .then(r => r.json())
      .then(d => setAcceptedMethods(tenderMethods(d.value)))
      .catch(() => {});
    fetch("/api/settings/emailConfig")
      .then(r => r.json())
      .then(d => { if (d.value) setEmailConfig(d.value as EmailConfig); })
      .catch(() => {});
  }, []);

  const saveTaxRate = async (rate: number) => {
    // The field used to be bound to useState and written nowhere: an operator typed their
    // real rate, navigated away, and the till kept charging 8.25%.
    if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
      toast({ title: "Not saved", description: "Enter a rate between 0 and 100.", variant: "destructive" });
      return;
    }
    setTaxSaving(true);
    try {
      const res = await fetch(`/api/settings/${TAX_RATE_KEY}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: rate }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Save failed");
      toast({ title: "Saved", description: `Tax rate is now ${rate}%.` });
    } catch (err) {
      toast({ title: "Not saved", description: err instanceof Error ? err.message : "Save failed", variant: "destructive" });
    } finally {
      setTaxSaving(false);
    }
  };

  const saveTaxInclusive = async (inclusive: boolean) => {
    const previous = taxInclusive;
    setTaxInclusive(inclusive);
    try {
      const res = await fetch(`/api/settings/${TAX_INCLUSIVE_KEY}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: inclusive }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Save failed");
    } catch (err) {
      setTaxInclusive(previous);
      toast({ title: "Not saved", description: err instanceof Error ? err.message : "Save failed", variant: "destructive" });
    }
  };

  const saveTenderMethods = async (methods: string[]) => {
    // The server rejects an empty list too — this is the same rule stated where the
    // operator can see it, not the only thing standing between a till and cash-only.
    if (!methods.length) {
      toast({ title: "Not saved", description: "A store must accept at least one payment method.", variant: "destructive" });
      return;
    }
    const ordered = DEFAULT_TENDER_METHODS.filter(m => methods.includes(m));
    const previous = acceptedMethods;
    setAcceptedMethods(ordered);
    try {
      const res = await fetch(`/api/settings/${TENDER_METHODS_KEY}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: ordered }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Save failed");
    } catch (err) {
      setAcceptedMethods(previous);
      toast({ title: "Not saved", description: err instanceof Error ? err.message : "Save failed", variant: "destructive" });
    }
  };

  const saveHours = async () => {
    setHoursSaving(true);
    try {
      await fetch("/api/settings/hoursOfOperation", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: hours }),
      });
      toast({ title: "Saved", description: "Hours of operation updated." });
    } catch {
      toast({ title: "Error", description: "Failed to save hours.", variant: "destructive" });
    } finally {
      setHoursSaving(false);
    }
  };

  const saveEmailConfig = async () => {
    setEmailSaving(true);
    try {
      await fetch("/api/settings/emailConfig", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: emailConfig }),
      });
      toast({ title: "Saved", description: "Email configuration updated." });
    } catch {
      toast({ title: "Error", description: "Failed to save email config.", variant: "destructive" });
    } finally {
      setEmailSaving(false);
    }
  };

  const handleProviderChange = (provider: string) => {
    const preset = PROVIDER_PRESETS[provider] || {};
    setEmailConfig(prev => ({ ...prev, provider, ...preset }));
  };

  const toggleDay = (day: number) => {
    setHours(prev => ({
      ...prev,
      operatingDays: prev.operatingDays.includes(day)
        ? prev.operatingDays.filter(d => d !== day)
        : [...prev.operatingDays, day].sort(),
    }));
  };

  const [categoryStates, setCategoryStates] = useState<Record<SyncCategory, CategoryState>>({
    menu: { status: "idle", message: "", lastSynced: getLastSyncedAt("menu") },
    ingredients: { status: "idle", message: "", lastSynced: getLastSyncedAt("ingredients") },
    sales: { status: "idle", message: "", lastSynced: getLastSyncedAt("sales") },
    invoices: { status: "idle", message: "", lastSynced: getLastSyncedAt("invoices") },
  });

  const [autoSync, setAutoSync] = useState(getAutoSyncEnabled());
  const [syncInterval, setSyncInterval] = useState(getAutoSyncInterval());
  const [syncAllStatus, setSyncAllStatus] = useState<SyncStatus>("idle");

  const saveClientCode = (code: string) => {
    setClientCode(code);
    localStorage.setItem("cornerpos_client_code", code);
  };

  const updateCategoryState = useCallback((category: SyncCategory, update: Partial<CategoryState>) => {
    setCategoryStates(prev => ({
      ...prev,
      [category]: { ...prev[category], ...update },
    }));
  }, []);

  const handleSyncCategory = useCallback(async (category: SyncCategory) => {
    if (!clientCode.trim()) {
      updateCategoryState(category, { status: "error", message: "Enter a client code first." });
      return;
    }

    updateCategoryState(category, { status: "syncing", message: "Syncing..." });

    const result = await syncCategory(category, clientCode.trim());

    if (result.success) {
      updateCategoryState(category, {
        status: "success",
        message: `Pushed ${result.pushed}, pulled ${result.pulled} records`,
        lastSynced: Date.now(),
      });
    } else {
      updateCategoryState(category, {
        status: "error",
        message: result.error || "Sync failed",
      });
    }
  }, [clientCode, updateCategoryState]);

  const handleSyncAll = useCallback(async () => {
    if (!clientCode.trim()) {
      setSyncAllStatus("error");
      return;
    }

    setSyncAllStatus("syncing");
    const categories: SyncCategory[] = ["menu", "ingredients", "sales", "invoices"];
    for (const cat of categories) {
      updateCategoryState(cat, { status: "syncing", message: "Syncing..." });
    }

    const { results } = await syncAll(clientCode.trim());

    let allSuccess = true;
    for (const cat of categories) {
      const r = results[cat];
      if (r.success) {
        updateCategoryState(cat, {
          status: "success",
          message: `Pushed ${r.pushed}, pulled ${r.pulled} records`,
          lastSynced: Date.now(),
        });
      } else {
        allSuccess = false;
        updateCategoryState(cat, { status: "error", message: r.error || "Failed" });
      }
    }

    setSyncAllStatus(allSuccess ? "success" : "error");
    setTimeout(() => setSyncAllStatus("idle"), 3000);
  }, [clientCode, updateCategoryState]);

  const handleAutoSyncToggle = useCallback((enabled: boolean) => {
    setAutoSync(enabled);
    setAutoSyncEnabled(enabled);
    if (enabled && clientCode.trim()) {
      startAutoSync(clientCode.trim());
    } else {
      stopAutoSync();
    }
  }, [clientCode]);

  const handleIntervalChange = useCallback((minutes: number) => {
    const clamped = Math.max(1, Math.min(1440, minutes));
    setSyncInterval(clamped);
    setAutoSyncIntervalMinutes(clamped);
    if (autoSync && clientCode.trim()) {
      startAutoSync(clientCode.trim());
    }
  }, [autoSync, clientCode]);

  useEffect(() => {
    if (autoSync && clientCode.trim()) {
      startAutoSync(clientCode.trim());
    }
    return () => stopAutoSync();
  }, [autoSync, clientCode]);

  useEffect(() => {
    if (autoBackup && clientCode.trim()) {
      startAutoBackup(clientCode.trim(), uploaded => {
        if (uploaded) setLastBackupAt(getLastBackupAt());
      });
    }
    return () => stopAutoBackup();
  }, [autoBackup, backupInterval, clientCode]);

  const handleBackup = async () => {
    if (!clientCode.trim()) {
      setBackupStatus("error");
      setStatusMessage("Please enter a client/store code first.");
      return;
    }

    setBackupStatus("loading");
    setStatusMessage("Collecting local data...");

    try {
      setStatusMessage("Uploading backup...");
      const result = await runBackup(clientCode.trim());
      setLastBackupAt(result.createdAt);
      setBackupStatus("success");
      setStatusMessage(`Backup created at ${new Date(result.createdAt).toLocaleString()}`);
    } catch (err) {
      setBackupStatus("error");
      setStatusMessage(err instanceof Error ? err.message : "Backup failed");
    }
  };

  const handleRestore = async () => {
    if (!clientCode.trim()) {
      setRestoreStatus("error");
      setStatusMessage("Please enter a client/store code first.");
      return;
    }

    setRestoreStatus("loading");
    setStatusMessage("Downloading backup...");

    try {
      const res = await fetch(`/api/backup/${encodeURIComponent(clientCode.trim())}`);
      if (!res.ok) {
        if (res.status === 404) throw new Error("No backup found for this client code.");
        const err = await res.json();
        throw new Error(err.error || "Restore failed");
      }

      const { snapshot, createdAt } = await res.json();

      // Decide what this snapshot may destroy before opening a transaction.
      const plan = planRestore(snapshot, BACKUP_TABLES);
      if (plan.errors.length) throw new Error(plan.errors.join(" "));

      const counts = Object.fromEntries(
        await Promise.all(plan.restore.map(async t => [t, await db.table(t).count()] as const)),
      );

      setRestoreStatus("idle");
      setStatusMessage("");
      setPendingRestore({ snapshot, createdAt, plan, counts });
    } catch (err) {
      setRestoreStatus("error");
      setStatusMessage(err instanceof Error ? err.message : "Restore failed");
    }
  };

  const confirmRestore = async () => {
    if (!pendingRestore) return;
    const { snapshot, plan } = pendingRestore;
    setPendingRestore(null);
    setRestoreStatus("loading");
    setStatusMessage("Restoring data to local database...");

    try {
      // Only tables the snapshot carries a key for are in plan.restore, so a partial
      // snapshot leaves everything else untouched instead of clearing it.
      await db.transaction("rw", plan.restore.map(t => db.table(t)), async () => {
        for (const name of plan.restore) {
          let rows = (snapshot as Record<string, unknown[]>)[name];
          // A redacted credential in a snapshot must not overwrite a working one.
          if (name === SETTINGS_TABLE) rows = mergeRestoredSettings(rows, await db.table(name).toArray());
          await db.table(name).clear();
          if (rows.length) await db.table(name).bulkPut(rows);
        }
      });

      setRestoreStatus("success");
      setStatusMessage("Data restored. Reloading…");
      // A reload is required for correctness after replacing the database, so do it
      // rather than asking — stale state after a destructive operation is a trap.
      setTimeout(() => window.location.reload(), 800);
    } catch (err) {
      setRestoreStatus("error");
      setStatusMessage(err instanceof Error ? err.message : "Restore failed");
    }
  };

  const statusIcon = (status: string) => {
    if (status === "loading" || status === "syncing") return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />;
    if (status === "success") return <CheckCircle2 className="h-4 w-4 text-green-500" />;
    if (status === "error") return <XCircle className="h-4 w-4 text-destructive" />;
    return null;
  };

  // A backup that last ran three weeks ago should read as wrong at a glance, which a
  // bare timestamp does not. date-fns is already a dependency.
  const lastBackupLabel = lastBackupAt
    ? `${formatDistanceToNow(lastBackupAt, { addSuffix: true })} (${new Date(lastBackupAt).toLocaleString()})`
    : "Never";

  const formatLastSynced = (timestamp: number) => {
    if (!timestamp) return "Never";
    return new Date(timestamp).toLocaleString();
  };

  const isBusy = backupStatus === "loading" || restoreStatus === "loading" ||
    Object.values(categoryStates).some(s => s.status === "syncing");

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
      <AppShell title="Settings">
        <div className="max-w-2xl mx-auto space-y-6">
          <Card className="border shadow-soft rounded-2xl overflow-hidden">
            <CardHeader className="bg-muted/20 pb-4">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-primary/10 text-primary">
                  <Settings className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle className="font-serif">General Settings</CardTitle>
                  <CardDescription>Configure your store's basic parameters.</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-6 space-y-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-base">Tax Configuration</Label>
                    <p className="text-sm text-muted-foreground">
                      The default tax rate applied to all taxable items. Saved when you leave the field —
                      the till charges exactly this.
                    </p>
                  </div>
                  <div className="relative w-32">
                    <Input
                      type="number"
                      value={taxRate}
                      onChange={(e) => setTaxRate(Number(e.target.value))}
                      onBlur={(e) => saveTaxRate(Number(e.target.value))}
                      disabled={taxSaving}
                      className="pr-8 rounded-xl"
                      data-testid="input-tax-rate"
                    />
                    <Percent className="absolute right-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-base">Prices include tax</Label>
                    <p className="text-sm text-muted-foreground">
                      On for VAT and GST pricing: the menu price is what the customer pays and the tax
                      is shown as included. Off adds the tax on top at the till.
                    </p>
                  </div>
                  <Switch
                    checked={taxInclusive}
                    onCheckedChange={saveTaxInclusive}
                    data-testid="switch-tax-inclusive"
                  />
                </div>

                <Separator />

                <div className="space-y-0.5">
                  <Label className="text-base">Payment Methods</Label>
                  <p className="text-sm text-muted-foreground">
                    What this store accepts. The till shows a button for each — cards taken on a
                    terminal from your bank count, no integration required.
                  </p>
                </div>
                {DEFAULT_TENDER_METHODS.map(method => (
                  <div key={method} className="flex items-center justify-between">
                    <Label className="font-normal">{method}</Label>
                    <Switch
                      checked={acceptedMethods.includes(method)}
                      onCheckedChange={v => saveTenderMethods(
                        v ? [...acceptedMethods, method] : acceptedMethods.filter(m => m !== method),
                      )}
                      data-testid={`switch-tender-${method.toLowerCase()}`}
                    />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="border shadow-soft rounded-2xl overflow-hidden">
            <CardHeader className="bg-muted/20 pb-4">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-primary/10 text-primary">
                  <CalendarClock className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle className="font-serif">Hours of Operation</CardTitle>
                  <CardDescription>Define your store's operating hours for the scheduling board.</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-6 space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Opening Hour</Label>
                  <Select value={String(hours.openHour)} onValueChange={v => setHours(prev => ({ ...prev, openHour: Number(v) }))}>
                    <SelectTrigger className="rounded-xl" data-testid="select-open-hour">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 24 }, (_, i) => (
                        <SelectItem key={i} value={String(i)}>
                          {i === 0 ? "12:00 AM" : i < 12 ? `${i}:00 AM` : i === 12 ? "12:00 PM" : `${i - 12}:00 PM`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Closing Hour</Label>
                  <Select value={String(hours.closeHour)} onValueChange={v => setHours(prev => ({ ...prev, closeHour: Number(v) }))}>
                    <SelectTrigger className="rounded-xl" data-testid="select-close-hour">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 24 }, (_, i) => i + 1).map(i => (
                        <SelectItem key={i} value={String(i)}>
                          {i === 24 ? "12:00 AM (midnight)" : i === 12 ? "12:00 PM" : i < 12 ? `${i}:00 AM` : `${i - 12}:00 PM`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Operating Days</Label>
                <div className="flex gap-1.5 flex-wrap">
                  {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day, i) => (
                    <Button
                      key={day}
                      variant={hours.operatingDays.includes(i) ? "default" : "outline"}
                      size="sm"
                      className="rounded-lg px-3"
                      onClick={() => toggleDay(i)}
                      data-testid={`button-day-${i}`}
                    >
                      {day}
                    </Button>
                  ))}
                </div>
              </div>

              <Button
                onClick={saveHours}
                disabled={hoursSaving}
                className="w-full rounded-xl"
                data-testid="button-save-hours"
              >
                {hoursSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                Save Hours
              </Button>
            </CardContent>
          </Card>

          <Card className="border shadow-soft rounded-2xl overflow-hidden">
            <CardHeader className="bg-muted/20 pb-4">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-primary/10 text-primary">
                  <Mail className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle className="font-serif">Email Backend</CardTitle>
                  <CardDescription>Configure SMTP settings for sending schedule notifications to employees.</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-6 space-y-4">
              <div className="space-y-2">
                <Label>Provider</Label>
                <Select value={emailConfig.provider} onValueChange={handleProviderChange}>
                  <SelectTrigger className="rounded-xl" data-testid="select-email-provider">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="smtp">Custom SMTP</SelectItem>
                    <SelectItem value="gmail">Gmail</SelectItem>
                    <SelectItem value="outlook">Outlook / Microsoft 365</SelectItem>
                    <SelectItem value="sendgrid">SendGrid</SelectItem>
                    <SelectItem value="ses">Amazon SES</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>SMTP Host</Label>
                  <Input
                    value={emailConfig.host}
                    onChange={e => setEmailConfig(prev => ({ ...prev, host: e.target.value }))}
                    placeholder="smtp.example.com"
                    className="rounded-xl"
                    data-testid="input-smtp-host"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Port</Label>
                  <Input
                    type="number"
                    value={emailConfig.port}
                    onChange={e => setEmailConfig(prev => ({ ...prev, port: Number(e.target.value) }))}
                    className="rounded-xl"
                    data-testid="input-smtp-port"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Use SSL/TLS</Label>
                  <p className="text-xs text-muted-foreground">Enable for port 465, disable for STARTTLS (port 587).</p>
                </div>
                <Switch
                  checked={emailConfig.secure}
                  onCheckedChange={v => setEmailConfig(prev => ({ ...prev, secure: v }))}
                  data-testid="switch-smtp-secure"
                />
              </div>

              <Separator />

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Username</Label>
                  <Input
                    value={emailConfig.username}
                    onChange={e => setEmailConfig(prev => ({ ...prev, username: e.target.value }))}
                    placeholder="user@example.com"
                    className="rounded-xl"
                    data-testid="input-smtp-username"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Password</Label>
                  <Input
                    type="password"
                    value={emailConfig.password}
                    onChange={e => setEmailConfig(prev => ({ ...prev, password: e.target.value }))}
                    placeholder="App password or API key"
                    className="rounded-xl"
                    data-testid="input-smtp-password"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Sender Email</Label>
                  <Input
                    value={emailConfig.senderEmail}
                    onChange={e => setEmailConfig(prev => ({ ...prev, senderEmail: e.target.value }))}
                    placeholder="schedule@mystore.com"
                    className="rounded-xl"
                    data-testid="input-sender-email"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Sender Name</Label>
                  <Input
                    value={emailConfig.senderName}
                    onChange={e => setEmailConfig(prev => ({ ...prev, senderName: e.target.value }))}
                    placeholder="CornerShop"
                    className="rounded-xl"
                    data-testid="input-sender-name"
                  />
                </div>
              </div>

              <Button
                onClick={saveEmailConfig}
                disabled={emailSaving}
                className="w-full rounded-xl"
                data-testid="button-save-email"
              >
                {emailSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                Save Email Settings
              </Button>
            </CardContent>
          </Card>

          <Card className="border shadow-soft rounded-2xl overflow-hidden">
            <CardHeader className="bg-muted/20 pb-4">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-primary/10 text-primary">
                  <RefreshCw className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle className="font-serif">Incremental Sync</CardTitle>
                  <CardDescription>Sync individual data categories to the server incrementally.</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-6 space-y-6">
              <div className="space-y-2">
                <Label htmlFor="client-code">Client / Store Code</Label>
                <Input
                  id="client-code"
                  placeholder="e.g., store-001"
                  value={clientCode}
                  onChange={(e) => saveClientCode(e.target.value)}
                  className="rounded-xl"
                  data-testid="input-client-code"
                />
                <p className="text-xs text-muted-foreground">
                  A unique identifier for this POS terminal. Use the same code across devices for data sync.
                </p>
              </div>

              <Separator />

              <div className="space-y-3">
                {CATEGORY_CONFIG.map(({ key, label, icon: Icon, description }) => {
                  const state = categoryStates[key];
                  return (
                    <div key={key} className="flex items-center gap-3 p-3 rounded-xl border bg-card" data-testid={`sync-category-${key}`}>
                      <div className="p-2 rounded-lg bg-muted/50">
                        <Icon className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{label}</p>
                        <p className="text-xs text-muted-foreground truncate">{description}</p>
                        <div className="flex items-center gap-1 mt-0.5">
                          <Clock className="h-3 w-3 text-muted-foreground" />
                          <span className="text-xs text-muted-foreground" data-testid={`text-last-synced-${key}`}>
                            {formatLastSynced(state.lastSynced)}
                          </span>
                        </div>
                        {state.message && state.status !== "idle" && (
                          <div className="flex items-center gap-1 mt-1">
                            {statusIcon(state.status)}
                            <span className="text-xs text-muted-foreground">{state.message}</span>
                          </div>
                        )}
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleSyncCategory(key)}
                        disabled={isBusy}
                        className="rounded-lg shrink-0"
                        data-testid={`button-sync-${key}`}
                      >
                        {state.status === "syncing" ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <RefreshCw className="h-3.5 w-3.5" />
                        )}
                        <span className="ml-1.5">Sync</span>
                      </Button>
                    </div>
                  );
                })}
              </div>

              <Button
                onClick={handleSyncAll}
                disabled={isBusy}
                className="w-full rounded-xl"
                data-testid="button-sync-all"
              >
                {syncAllStatus === "syncing" ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" />
                )}
                Sync All Categories
              </Button>

              <Separator />

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-base flex items-center gap-2">
                      <Timer className="h-4 w-4" />
                      Auto Sync
                    </Label>
                    <p className="text-sm text-muted-foreground">Automatically sync all categories on a schedule.</p>
                  </div>
                  <Switch
                    checked={autoSync}
                    onCheckedChange={handleAutoSyncToggle}
                    data-testid="switch-auto-sync"
                  />
                </div>

                {autoSync && (
                  <div className="flex items-center gap-3 pl-6">
                    <Label htmlFor="sync-interval" className="text-sm whitespace-nowrap">Every</Label>
                    <Input
                      id="sync-interval"
                      type="number"
                      min={1}
                      max={1440}
                      value={syncInterval}
                      onChange={(e) => handleIntervalChange(Number(e.target.value))}
                      className="w-20 rounded-xl"
                      data-testid="input-sync-interval"
                    />
                    <span className="text-sm text-muted-foreground">minutes</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <InteractiveSyncUI mode="pos" />

          <Card className="border shadow-soft rounded-2xl overflow-hidden">
            <CardHeader className="bg-muted/20 pb-4">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-primary/10 text-primary">
                  <Database className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle className="font-serif">Full Backup & Restore</CardTitle>
                  <CardDescription>
                    Snapshot of all {BACKUP_TABLES.length} local tables, or restore from a previous backup.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-6 space-y-6">
              <div className="flex gap-3">
                <Button
                  onClick={handleBackup}
                  disabled={isBusy}
                  className="flex-1 rounded-xl"
                  data-testid="button-backup"
                >
                  {backupStatus === "loading" ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <CloudUpload className="h-4 w-4 mr-2" />
                  )}
                  Full Backup
                </Button>
                <Button
                  variant="outline"
                  onClick={handleRestore}
                  disabled={isBusy}
                  className="flex-1 rounded-xl"
                  data-testid="button-restore"
                >
                  {restoreStatus === "loading" ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <CloudDownload className="h-4 w-4 mr-2" />
                  )}
                  Full Restore
                </Button>
              </div>

              <div className="text-sm text-muted-foreground" data-testid="text-last-backup">
                Last backup: {lastBackupLabel}
              </div>

              <Separator />

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-base flex items-center gap-2">
                      <Timer className="h-4 w-4" />
                      Auto Backup
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      Back up on a schedule, skipping the upload when nothing has changed.
                    </p>
                  </div>
                  <Switch
                    checked={autoBackup}
                    onCheckedChange={(enabled) => { setAutoBackup(enabled); setAutoBackupEnabled(enabled); }}
                    data-testid="switch-auto-backup"
                  />
                </div>

                {autoBackup && (
                  <div className="flex items-center gap-3 pl-6">
                    <Label htmlFor="backup-interval" className="text-sm whitespace-nowrap">Every</Label>
                    <Input
                      id="backup-interval"
                      type="number"
                      min={1}
                      max={1440}
                      value={backupInterval}
                      onChange={(e) => {
                        const clamped = Math.max(1, Math.min(1440, Number(e.target.value)));
                        setBackupInterval(clamped);
                        setAutoBackupIntervalMinutes(clamped);
                      }}
                      className="w-20 rounded-xl"
                      data-testid="input-backup-interval"
                    />
                    <span className="text-sm text-muted-foreground">minutes</span>
                  </div>
                )}
              </div>

              {statusMessage && (
                <div className="flex items-start gap-2 p-3 rounded-xl bg-muted/50 text-sm" data-testid="text-backup-status">
                  {statusIcon(backupStatus !== "idle" ? backupStatus : restoreStatus)}
                  <span>{statusMessage}</span>
                </div>
              )}
            </CardContent>
          </Card>

          <AlertDialog open={pendingRestore !== null} onOpenChange={open => { if (!open) setPendingRestore(null); }}>
            <AlertDialogContent data-testid="dialog-restore-confirm">
              <AlertDialogHeader>
                <AlertDialogTitle>Replace this device's data?</AlertDialogTitle>
                <AlertDialogDescription asChild>
                  <div className="space-y-2">
                    <p>
                      Restoring the backup for <strong>{clientCode.trim()}</strong>, taken{" "}
                      {pendingRestore ? new Date(pendingRestore.createdAt).toLocaleString() : ""}.
                    </p>
                    <p>{pendingRestore ? describeRestore(pendingRestore.plan, pendingRestore.counts) : ""}</p>
                    {pendingRestore && pendingRestore.plan.untouched.length > 0 && (
                      <p className="text-muted-foreground">
                        Not in this backup, and left untouched: {pendingRestore.plan.untouched.join(", ")}.
                      </p>
                    )}
                    <p>This cannot be undone.</p>
                  </div>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel data-testid="button-restore-cancel">Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={confirmRestore} data-testid="button-restore-confirm">
                  Replace my data
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </AppShell>
    </motion.div>
  );
}
