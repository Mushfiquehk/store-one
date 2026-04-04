import { useState, useCallback } from "react";
import { RefreshCw, Check, X, ArrowRightLeft, Plus, Pencil, Trash2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { db as dexieDb } from "@/lib/db";
import { SYNC_CATEGORY_TABLES, type SyncCategory } from "@shared/schema";

type DiffAction = "add_to_pos" | "add_to_admin" | "update_pos" | "update_admin" | "delete_from_pos" | "delete_from_admin";

type DiffItem = {
  id: string;
  tableName: string;
  recordId: string;
  action: DiffAction;
  label: string;
  detail: string;
  data: Record<string, unknown>;
  accepted: boolean;
};

export type SyncMode = "admin" | "pos";

const SYNC_TABLES = [
  "products", "variants", "modifierGroups", "productModifierGroups",
  "modifiers", "inventoryItems", "billOfMaterials", "invoices", "invoiceLineItems",
];

const TABLE_LABELS: Record<string, string> = {
  products: "Products", variants: "Variants", modifierGroups: "Modifier Groups",
  productModifierGroups: "Product-Modifier Links", modifiers: "Modifiers",
  inventoryItems: "Inventory Items", billOfMaterials: "Bill of Materials",
  invoices: "Invoices", invoiceLineItems: "Invoice Line Items",
};

function getRecordId(tableName: string, record: Record<string, unknown>): string {
  if (tableName === "productModifierGroups") return `${record.productId}::${record.modifierGroupId}`;
  return record.id as string;
}

function getRecordLabel(tableName: string, record: Record<string, unknown>): string {
  const name = (record.name as string) || (record.description as string) || "";
  const id = getRecordId(tableName, record);
  return name ? `${name} (${id.slice(0, 12)}...)` : id.slice(0, 20);
}

async function getLocalRecords(tableName: string): Promise<Record<string, unknown>[]> {
  const tableMap: Record<string, import("dexie").Table> = {
    products: dexieDb.products,
    variants: dexieDb.variants,
    modifierGroups: dexieDb.modifierGroups,
    productModifierGroups: dexieDb.productModifierGroups,
    modifiers: dexieDb.modifiers,
    inventoryItems: dexieDb.inventoryItems,
    billOfMaterials: dexieDb.billOfMaterials,
    invoices: dexieDb.invoices,
    invoiceLineItems: dexieDb.invoiceLineItems,
  };
  const table = tableMap[tableName];
  if (!table) return [];
  return (await table.toArray()) as Record<string, unknown>[];
}

interface InteractiveSyncProps {
  mode: SyncMode;
}

export default function InteractiveSyncUI({ mode }: InteractiveSyncProps) {
  const { toast } = useToast();
  const [clientCode, setClientCode] = useState(
    () => localStorage.getItem("cornerpos_client_code") || ""
  );
  const [phase, setPhase] = useState("idle" as string);
  const [diffs, setDiffs] = useState<DiffItem[]>([]);

  const computeDiff = useCallback(async () => {
    if (!clientCode.trim()) {
      toast({ title: "Client Code Required", description: "Enter the POS client code to sync with.", variant: "destructive" });
      return;
    }
    setPhase("loading");

    try {
      const adminRes = await fetch("/api/admin/all-data-with-deleted");
      if (!adminRes.ok) throw new Error("Failed to fetch admin data");
      const adminData = await adminRes.json();

      let posData: Record<string, Record<string, unknown>[]>;

      if (mode === "admin") {
        const clientRes = await fetch(`/api/admin/client-data/${encodeURIComponent(clientCode.trim())}`);
        if (!clientRes.ok) {
          const errBody = await clientRes.json().catch(() => ({}));
          throw new Error(errBody.error || "Failed to fetch POS client data from server");
        }
        posData = await clientRes.json();
      } else {
        posData = {};
        for (const tableName of SYNC_TABLES) {
          posData[tableName] = await getLocalRecords(tableName);
        }
      }

      const allDiffs: DiffItem[] = [];
      let counter = 0;

      for (const tableName of SYNC_TABLES) {
        const posRecords = posData[tableName] || [];
        const posMap = new Map<string, Record<string, unknown>>();
        for (const r of posRecords) {
          posMap.set(getRecordId(tableName, r), r);
        }

        const adminKey = tableName === "billOfMaterials" ? "billOfMaterials" : tableName;
        const adminRecords: Record<string, unknown>[] = adminData[adminKey] || [];
        const adminMap = new Map<string, Record<string, unknown>>();
        for (const r of adminRecords) {
          adminMap.set(getRecordId(tableName, r), r);
        }

        const allIds = new Set<string>();
        adminMap.forEach((_v, id) => allIds.add(id));
        posMap.forEach((_v, id) => allIds.add(id));

        allIds.forEach(id => {
          const adminRec = adminMap.get(id);
          const posRec = posMap.get(id);
          const adminDeleted = !!(adminRec && adminRec.deletedAt);
          const posDeleted = !!(posRec && posRec.deletedAt);
          const adminTime = adminRec ? ((adminRec.updatedAt as number) || 0) : 0;
          const posTime = posRec ? ((posRec.updatedAt as number) || 0) : 0;

          if (adminRec && posRec) {
            if (adminDeleted && !posDeleted) {
              allDiffs.push({
                id: `diff_${counter++}`,
                tableName, recordId: id,
                action: "delete_from_pos",
                label: `Delete from POS: ${getRecordLabel(tableName, posRec)}`,
                detail: `Deleted on admin (${new Date(adminTime).toLocaleString()}). Admin takes priority.`,
                data: adminRec,
                accepted: true,
              });
              allDiffs.push({
                id: `diff_${counter++}`,
                tableName, recordId: id,
                action: "update_admin",
                label: `Restore on Admin: ${getRecordLabel(tableName, posRec)}`,
                detail: `POS version (${new Date(posTime).toLocaleString()}) — override admin deletion`,
                data: posRec,
                accepted: false,
              });
            } else if (!adminDeleted && posDeleted) {
              allDiffs.push({
                id: `diff_${counter++}`,
                tableName, recordId: id,
                action: "update_pos",
                label: `Restore on POS: ${getRecordLabel(tableName, adminRec)}`,
                detail: `Admin version (${new Date(adminTime).toLocaleString()}) takes priority over POS deletion (${new Date(posTime).toLocaleString()})`,
                data: adminRec,
                accepted: true,
              });
              allDiffs.push({
                id: `diff_${counter++}`,
                tableName, recordId: id,
                action: "delete_from_admin",
                label: `Delete from Admin: ${getRecordLabel(tableName, adminRec)}`,
                detail: `Accept POS deletion (${new Date(posTime).toLocaleString()}) — override admin`,
                data: posRec,
                accepted: false,
              });
            } else if (!adminDeleted && !posDeleted && adminTime !== posTime) {
              allDiffs.push({
                id: `diff_${counter++}`,
                tableName, recordId: id,
                action: "update_pos",
                label: `Update POS: ${getRecordLabel(tableName, adminRec)}`,
                detail: `Admin version (${new Date(adminTime).toLocaleString()}) takes priority${posTime > adminTime ? ` — POS is newer (${new Date(posTime).toLocaleString()})` : ` vs POS (${new Date(posTime).toLocaleString()})`}`,
                data: adminRec,
                accepted: true,
              });
              allDiffs.push({
                id: `diff_${counter++}`,
                tableName, recordId: id,
                action: "update_admin",
                label: `Update Admin: ${getRecordLabel(tableName, posRec)}`,
                detail: `POS version (${new Date(posTime).toLocaleString()})${posTime > adminTime ? " is newer" : ""} — override admin`,
                data: posRec,
                accepted: false,
              });
            }
          } else if (adminRec && !posRec) {
            if (!adminDeleted) {
              allDiffs.push({
                id: `diff_${counter++}`,
                tableName, recordId: id,
                action: "add_to_pos",
                label: `Add to POS: ${getRecordLabel(tableName, adminRec)}`,
                detail: `${TABLE_LABELS[tableName] || tableName} exists on admin but not in POS — add to POS`,
                data: adminRec,
                accepted: true,
              });
              allDiffs.push({
                id: `diff_${counter++}`,
                tableName, recordId: id,
                action: "delete_from_admin",
                label: `Delete from Admin: ${getRecordLabel(tableName, adminRec)}`,
                detail: `${TABLE_LABELS[tableName] || tableName} exists on admin but not in POS — remove from admin`,
                data: adminRec,
                accepted: false,
              });
            }
          } else if (posRec && !adminRec) {
            if (!posDeleted) {
              allDiffs.push({
                id: `diff_${counter++}`,
                tableName, recordId: id,
                action: "add_to_admin",
                label: `Add to Admin: ${getRecordLabel(tableName, posRec)}`,
                detail: `${TABLE_LABELS[tableName] || tableName} exists in POS but not on admin — add to admin`,
                data: posRec,
                accepted: true,
              });
              allDiffs.push({
                id: `diff_${counter++}`,
                tableName, recordId: id,
                action: "delete_from_pos",
                label: `Delete from POS: ${getRecordLabel(tableName, posRec)}`,
                detail: `${TABLE_LABELS[tableName] || tableName} exists in POS but not on admin — remove from POS`,
                data: posRec,
                accepted: false,
              });
            }
          }
        });
      }

      setDiffs(allDiffs);
      setPhase("review");
      if (allDiffs.length === 0) {
        toast({ title: "In Sync", description: "Admin and POS data are already synchronized." });
        setPhase("idle");
      }
    } catch (err) {
      toast({ title: "Sync Error", description: (err as Error).message, variant: "destructive" });
      setPhase("idle");
    }
  }, [clientCode, mode, toast]);

  const toggleItem = (id: string) => {
    setDiffs(prev => prev.map(d => d.id === id ? { ...d, accepted: !d.accepted } : d));
  };

  const toggleAll = (accepted: boolean) => {
    setDiffs(prev => prev.map(d => ({ ...d, accepted })));
  };

  const applyChanges = useCallback(async () => {
    const acceptedDiffs = diffs.filter(d => d.accepted);
    if (acceptedDiffs.length === 0) {
      toast({ title: "Nothing Selected", description: "Select at least one change to apply." });
      return;
    }
    setPhase("applying");

    try {
      const posChanges: DiffItem[] = [];
      const adminChanges: { tableName: string; recordId: string; data: Record<string, unknown>; action: string }[] = [];

      for (const diff of acceptedDiffs) {
        if (diff.action === "add_to_pos" || diff.action === "update_pos") {
          posChanges.push(diff);
        } else if (diff.action === "delete_from_pos") {
          posChanges.push(diff);
        } else if (diff.action === "add_to_admin" || diff.action === "update_admin") {
          adminChanges.push({ tableName: diff.tableName, recordId: diff.recordId, data: diff.data, action: diff.action.startsWith("add") ? "add" : "update" });
        } else if (diff.action === "delete_from_admin") {
          adminChanges.push({ tableName: diff.tableName, recordId: diff.recordId, data: diff.data, action: "delete" });
        }
      }

      if (mode === "pos") {
        for (const change of posChanges) {
          const tMap: Record<string, import("dexie").Table> = {
            products: dexieDb.products, variants: dexieDb.variants, modifierGroups: dexieDb.modifierGroups,
            productModifierGroups: dexieDb.productModifierGroups, modifiers: dexieDb.modifiers,
            inventoryItems: dexieDb.inventoryItems, billOfMaterials: dexieDb.billOfMaterials,
            invoices: dexieDb.invoices, invoiceLineItems: dexieDb.invoiceLineItems,
          };
          const table = tMap[change.tableName];
          if (!table) continue;

          if (change.action === "delete_from_pos") {
            if (change.tableName === "productModifierGroups") {
              const [pId, gId] = change.recordId.split("::");
              await table.update([pId, gId], { deletedAt: Date.now(), updatedAt: Date.now() });
            } else {
              await table.update(change.recordId, { deletedAt: Date.now(), updatedAt: Date.now() });
            }
          } else {
            await table.put(change.data);
          }
        }
        if (clientCode.trim()) {
          const syncPayload = posChanges.map(change => ({
            tableName: change.tableName,
            recordId: change.recordId,
            data: change.data,
            updatedAt: (change.data.updatedAt as number) || Date.now(),
            deletedAt: change.action === "delete_from_pos" ? Date.now() : null,
          }));
          for (const category of Object.keys(SYNC_CATEGORY_TABLES) as SyncCategory[]) {
            const tableNames = SYNC_CATEGORY_TABLES[category];
            const categoryChanges = syncPayload.filter(c => tableNames.includes(c.tableName));
            if (categoryChanges.length > 0) {
              await fetch(`/api/sync/${category}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ clientCode: clientCode.trim(), lastSyncedAt: 0, changes: categoryChanges }),
              });
            }
          }
        }
      } else if (mode === "admin" && posChanges.length > 0) {
        const syncChanges = posChanges.map(change => ({
          tableName: change.tableName,
          recordId: change.recordId,
          data: change.data,
          action: change.action === "delete_from_pos" ? "delete"
            : change.action === "add_to_pos" ? "add" : "update",
        }));
        const res = await fetch(`/api/admin/apply-client-sync-changes/${encodeURIComponent(clientCode.trim())}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ changes: syncChanges }),
        });
        if (!res.ok) throw new Error("Failed to apply POS client changes on server");
      }

      if (adminChanges.length > 0) {
        const res = await fetch("/api/admin/apply-sync-changes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ changes: adminChanges }),
        });
        if (!res.ok) throw new Error("Failed to apply admin changes");
      }

      toast({ title: "Sync Complete", description: `Applied ${acceptedDiffs.length} changes successfully.` });
      setDiffs([]);
      setPhase("idle");
    } catch (err) {
      toast({ title: "Sync Error", description: (err as Error).message, variant: "destructive" });
      setPhase("review");
    }
  }, [diffs, mode, clientCode, toast]);

  const acceptedCount = diffs.filter(d => d.accepted).length;

  const getActionIcon = (action: string) => {
    if (action.startsWith("update")) return <Pencil className="h-4 w-4 text-blue-600" />;
    if (action.startsWith("delete")) return <Trash2 className="h-4 w-4 text-red-600" />;
    return <Plus className="h-4 w-4 text-green-600" />;
  };

  const getActionBadge = (action: string) => {
    if (action.includes("pos")) return <Badge variant="outline" className="text-xs">POS</Badge>;
    return <Badge variant="secondary" className="text-xs">Admin</Badge>;
  };

  return (
    <div className="space-y-6">
      <Card className="border shadow-soft rounded-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 font-serif">
            <ArrowRightLeft className="h-5 w-5" /> Interactive Sync
          </CardTitle>
          <CardDescription>
            {mode === "admin"
              ? "Compare admin server data with a POS client's synced data on the server and selectively apply changes."
              : "Compare your local POS data with admin server data and selectively apply changes."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-end gap-4">
            <div className="flex-1">
              <Label>POS Client Code</Label>
              <Input
                value={clientCode}
                onChange={e => setClientCode(e.target.value)}
                placeholder="my-pos-client"
                data-testid="input-sync-client-code"
              />
            </div>
            <Button
              onClick={computeDiff}
              disabled={phase === "loading" || phase === "applying"}
              data-testid="button-compute-diff"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${phase === "loading" ? "animate-spin" : ""}`} />
              {phase === "loading" ? "Comparing..." : "Compare & Sync"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {phase === "review" && diffs.length > 0 && (
        <Card className="border shadow-soft rounded-2xl">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="font-serif">Review Changes</CardTitle>
                <CardDescription>{diffs.length} differences found, {acceptedCount} selected</CardDescription>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => toggleAll(true)} data-testid="button-accept-all">
                  <Check className="h-4 w-4 mr-1" /> Accept All
                </Button>
                <Button variant="outline" size="sm" onClick={() => toggleAll(false)} data-testid="button-reject-all">
                  <X className="h-4 w-4 mr-1" /> Reject All
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-50 border border-blue-200 text-blue-800 text-sm" data-testid="admin-priority-note">
              <ShieldCheck className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <span>
                <strong>Admin priority:</strong> When the same record exists on both sides, admin changes are pre-selected by default. You can manually override any item before applying.
              </span>
            </div>
            {diffs.map(diff => (
              <div
                key={diff.id}
                className={`flex items-center gap-3 p-3 rounded-lg border ${diff.accepted ? "bg-accent/30 border-accent" : "bg-muted/30 border-muted"}`}
                data-testid={`diff-item-${diff.id}`}
              >
                <Checkbox
                  checked={diff.accepted}
                  onCheckedChange={() => toggleItem(diff.id)}
                  data-testid={`checkbox-${diff.id}`}
                />
                {getActionIcon(diff.action)}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm truncate">{diff.label}</span>
                    {getActionBadge(diff.action)}
                    <Badge variant="outline" className="text-xs">{TABLE_LABELS[diff.tableName] || diff.tableName}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{diff.detail}</p>
                </div>
              </div>
            ))}

            <div className="flex justify-end pt-4">
              <Button
                onClick={applyChanges}
                disabled={acceptedCount === 0}
                data-testid="button-apply-sync"
              >
                <Check className="h-4 w-4 mr-2" /> Apply {acceptedCount} Changes
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
