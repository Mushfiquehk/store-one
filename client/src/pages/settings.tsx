import { motion } from "framer-motion";
import AppShell from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useStore } from "@/lib/store";
import { useState, useEffect, useCallback } from "react";
import {
  Settings, Percent, CloudUpload, CloudDownload, Database, CheckCircle2,
  XCircle, Loader2, RefreshCw, Package, Warehouse, ShoppingCart, Clock, Timer, FileText,
} from "lucide-react";
import InteractiveSyncUI from "@/components/interactive-sync";
import { db } from "@/lib/db";
import {
  syncCategory, syncAll, getLastSyncedAt, getAutoSyncEnabled,
  setAutoSyncEnabled, getAutoSyncInterval, setAutoSyncIntervalMinutes,
  startAutoSync, stopAutoSync,
} from "@/lib/sync";
import type { SyncCategory } from "@shared/schema";

type SyncStatus = "idle" | "syncing" | "success" | "error";

interface CategoryState {
  status: SyncStatus;
  message: string;
  lastSynced: number;
}

const CATEGORY_CONFIG: { key: SyncCategory; label: string; icon: typeof Package; description: string }[] = [
  { key: "menu", label: "Menu Items", icon: Package, description: "Products, variants, modifier groups, and modifiers" },
  { key: "ingredients", label: "Ingredients", icon: Warehouse, description: "Inventory items and bill of materials" },
  { key: "sales", label: "Sales", icon: ShoppingCart, description: "Sales transactions and line items" },
  { key: "invoices", label: "Invoices", icon: FileText, description: "Invoices and invoice line items" },
];

export default function SettingsPage() {
  const [taxRate, setTaxRate] = useState(8.25);
  const [clientCode, setClientCode] = useState(() => localStorage.getItem("cornerpos_client_code") || "");
  const [backupStatus, setBackupStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [restoreStatus, setRestoreStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [statusMessage, setStatusMessage] = useState("");

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

  const handleBackup = async () => {
    if (!clientCode.trim()) {
      setBackupStatus("error");
      setStatusMessage("Please enter a client/store code first.");
      return;
    }

    setBackupStatus("loading");
    setStatusMessage("Collecting local data...");

    try {
      const snapshot = {
        products: await db.products.toArray(),
        variants: await db.variants.toArray(),
        modifierGroups: await db.modifierGroups.toArray(),
        productModifierGroups: await db.productModifierGroups.toArray(),
        modifiers: await db.modifiers.toArray(),
        inventoryItems: await db.inventoryItems.toArray(),
        billOfMaterials: await db.billOfMaterials.toArray(),
        employees: await db.employees.toArray(),
        timePunches: await db.timePunches.toArray(),
        sales: await db.sales.toArray(),
      };

      setStatusMessage("Uploading backup...");

      const res = await fetch("/api/backup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientCode: clientCode.trim(), snapshot }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Backup failed");
      }

      const result = await res.json();
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

      const { snapshot } = await res.json();
      setStatusMessage("Restoring data to local database...");

      await db.transaction("rw",
        [db.products, db.variants, db.modifierGroups, db.productModifierGroups,
         db.modifiers, db.inventoryItems, db.billOfMaterials, db.employees,
         db.timePunches, db.sales],
        async () => {
          await db.products.clear();
          await db.variants.clear();
          await db.modifierGroups.clear();
          await db.productModifierGroups.clear();
          await db.modifiers.clear();
          await db.inventoryItems.clear();
          await db.billOfMaterials.clear();
          await db.employees.clear();
          await db.timePunches.clear();
          await db.sales.clear();

          if (snapshot.products?.length) await db.products.bulkPut(snapshot.products);
          if (snapshot.variants?.length) await db.variants.bulkPut(snapshot.variants);
          if (snapshot.modifierGroups?.length) await db.modifierGroups.bulkPut(snapshot.modifierGroups);
          if (snapshot.productModifierGroups?.length) await db.productModifierGroups.bulkPut(snapshot.productModifierGroups);
          if (snapshot.modifiers?.length) await db.modifiers.bulkPut(snapshot.modifiers);
          if (snapshot.inventoryItems?.length) await db.inventoryItems.bulkPut(snapshot.inventoryItems);
          if (snapshot.billOfMaterials?.length) await db.billOfMaterials.bulkPut(snapshot.billOfMaterials);
          if (snapshot.employees?.length) await db.employees.bulkPut(snapshot.employees);
          if (snapshot.timePunches?.length) await db.timePunches.bulkPut(snapshot.timePunches);
          if (snapshot.sales?.length) await db.sales.bulkPut(snapshot.sales);
        }
      );

      setRestoreStatus("success");
      setStatusMessage("Data restored successfully! Reload the page to see updated data.");
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
                    <p className="text-sm text-muted-foreground">The default tax rate applied to all taxable items.</p>
                  </div>
                  <div className="relative w-32">
                    <Input
                      type="number"
                      value={taxRate}
                      onChange={(e) => setTaxRate(Number(e.target.value))}
                      className="pr-8 rounded-xl"
                      data-testid="input-tax-rate"
                    />
                    <Percent className="absolute right-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  </div>
                </div>
              </div>
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
                  <CardDescription>Full snapshot backup of all local data, or restore from a previous backup.</CardDescription>
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

              {statusMessage && (
                <div className="flex items-start gap-2 p-3 rounded-xl bg-muted/50 text-sm" data-testid="text-backup-status">
                  {statusIcon(backupStatus !== "idle" ? backupStatus : restoreStatus)}
                  <span>{statusMessage}</span>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </AppShell>
    </motion.div>
  );
}
