import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { BarChart3, FileDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

type MenuItem = {
  id: string;
  name: string;
  priceCents: number;
  category: string;
  taxable: boolean;
  recipeId?: string | null;
};

type InventoryItem = {
  id: string;
  name: string;
  sku: string;
  onHand: number;
  reorderAt: number;
  unitCostCents: number;
  unit: string;
};

type Recipe = {
  id: string;
  name: string;
  ingredients: Array<{ invId: string; qty: number }>;
};

type SaleLine = {
  menuItemId: string;
  qty: number;
};

type Sale = {
  id: string;
  createdAt: number;
  lines: SaleLine[];
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  paymentMethod: "Cash" | "Card";
};

function formatMoney(cents: number) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

function sumBy<T>(arr: T[], fn: (t: T) => number) {
  return arr.reduce((acc, item) => acc + fn(item), 0);
}

export default function ReportsPage() {
  const { toast } = useToast();

  const [businessName] = useState("Corner Store");
  const [taxRatePct] = useState(8.25);

  const [menu] = useState<MenuItem[]>([
    { id: "coffee", name: "House Coffee", priceCents: 350, category: "Drinks", taxable: true, recipeId: "recipe_coffee" },
    { id: "latte", name: "Vanilla Latte", priceCents: 575, category: "Drinks", taxable: true, recipeId: "recipe_latte" },
    { id: "muffin", name: "Blueberry Muffin", priceCents: 425, category: "Bakery", taxable: true, recipeId: "recipe_muffin" },
  ]);

  const [recipes] = useState<Recipe[]>([
    {
      id: "recipe_coffee",
      name: "Coffee (12oz)",
      ingredients: [
        { invId: "beans_g", qty: 18 },
        { invId: "cup_12oz", qty: 1 },
      ],
    },
    {
      id: "recipe_latte",
      name: "Vanilla Latte (12oz)",
      ingredients: [
        { invId: "beans_g", qty: 18 },
        { invId: "milk_ml", qty: 220 },
        { invId: "cup_12oz", qty: 1 },
      ],
    },
    {
      id: "recipe_muffin",
      name: "Muffin",
      ingredients: [{ invId: "muffin_each", qty: 1 }],
    },
  ]);

  const [inventory] = useState<InventoryItem[]>([
    { id: "beans_g", name: "Coffee Beans", sku: "BEANS", onHand: 2500, reorderAt: 1200, unitCostCents: 2, unit: "g" },
    { id: "milk_ml", name: "Whole Milk", sku: "MILK", onHand: 6000, reorderAt: 2500, unitCostCents: 1, unit: "ml" },
    { id: "cup_12oz", name: "Cup 12oz", sku: "CUP-12", onHand: 250, reorderAt: 120, unitCostCents: 9, unit: "each" },
    { id: "muffin_each", name: "Muffin", sku: "MUFF", onHand: 24, reorderAt: 12, unitCostCents: 150, unit: "each" },
  ]);

  const [sales] = useState<Sale[]>([]);

  const menuById = useMemo(() => {
    const m = new Map<string, MenuItem>();
    for (const item of menu) m.set(item.id, item);
    return m;
  }, [menu]);

  const reports = useMemo(() => {
    const totalSalesCents = sumBy(sales, (s) => s.totalCents);
    const totalTaxCents = sumBy(sales, (s) => s.taxCents);

    const itemCounts = new Map<string, number>();
    for (const s of sales) {
      for (const line of s.lines) {
        itemCounts.set(line.menuItemId, (itemCounts.get(line.menuItemId) ?? 0) + line.qty);
      }
    }

    const topItems = Array.from(itemCounts.entries())
      .map(([id, qty]) => ({ id, qty, name: menuById.get(id)?.name ?? id }))
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 5);

    const lowStock = inventory
      .filter((i) => i.onHand <= i.reorderAt)
      .map((i) => ({ name: i.name, onHand: i.onHand, reorderAt: i.reorderAt }));

    return {
      kpis: {
        salesCount: sales.length,
        totalSalesCents,
        totalTaxCents,
        avgTicketCents: sales.length ? Math.round(totalSalesCents / sales.length) : 0,
      },
      topItems,
      lowStock,
    };
  }, [inventory, menuById, sales]);

  const exportText = useMemo(() => {
    const now = new Date();

    const payload = {
      app: "CornerPOS (prototype)",
      generatedAt: now.toISOString(),
      business: {
        name: businessName,
        taxRatePct,
      },
      menu: menu.map((m) => ({
        id: m.id,
        name: m.name,
        category: m.category,
        price: formatMoney(m.priceCents),
        taxable: m.taxable,
        recipeId: m.recipeId ?? null,
      })),
      recipes,
      inventory: inventory.map((i) => ({
        id: i.id,
        name: i.name,
        sku: i.sku,
        onHand: i.onHand,
        reorderAt: i.reorderAt,
        unit: i.unit,
        unitCost: formatMoney(i.unitCostCents),
      })),
      reports: {
        kpis: {
          salesCount: reports.kpis.salesCount,
          totalSales: formatMoney(reports.kpis.totalSalesCents),
          totalTax: formatMoney(reports.kpis.totalTaxCents),
          avgTicket: formatMoney(reports.kpis.avgTicketCents),
        },
        topItems: reports.topItems,
        lowStock: reports.lowStock,
      },
      prompt: {
        instruction:
          "You are a retail operations assistant. Based on the menu, recipes, inventory, and sales KPIs, suggest 5 improvements for pricing, menu layout, and reorder levels. Keep it practical for a single-location mom-and-pop shop.",
      },
    };

    return [
      `# CornerPOS Export`,
      `Generated: ${payload.generatedAt}`,
      `Business: ${payload.business.name}`,
      "",
      "## Recommended LLM Prompt",
      payload.prompt.instruction,
      "",
      "## Data (JSON)",
      JSON.stringify(payload, null, 2),
      "",
    ].join("\n");
  }, [businessName, inventory, menu, recipes, reports, taxRatePct]);

  async function copyExport() {
    try {
      await navigator.clipboard.writeText(exportText);
      toast({ title: "Copied", description: "Export text copied to clipboard." });
    } catch {
      toast({ title: "Copy failed", description: "Your browser blocked clipboard access. You can still select & copy manually." });
    }
  }

  function downloadExport() {
    const blob = new Blob([exportText], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${businessName.replaceAll(/\s+/g, "-").toLowerCase()}-cornerpos-export.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

    toast({ title: "Downloaded", description: "Export file saved." });
  }

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
      <div className="min-h-screen app-shell">
        <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
          <header className="relative overflow-hidden rounded-3xl border bg-card shadow-soft grain">
            <div className="p-6 sm:p-8">
              <p className="text-sm font-medium text-muted-foreground" data-testid="text-tagline">
                Back Office
              </p>
              <h1 className="mt-2 font-serif text-3xl tracking-[-0.02em] sm:text-4xl" data-testid="text-title">
                Reports + Export
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground" data-testid="text-subtitle">
                Quick KPIs and a single text file export you can paste into any LLM for recommendations.
              </p>

              <Separator className="my-6" />

              <div className="grid gap-6 lg:grid-cols-12">
                <Card className="border bg-card shadow-soft lg:col-span-5">
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 font-serif" data-testid="text-reports-title">
                      <BarChart3 className="h-5 w-5" />
                      KPIs
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-3">
                      <MiniCard label="All-time sales" value={formatMoney(reports.kpis.totalSalesCents)} testid="report-alltime-sales" />
                      <MiniCard label="All-time tax" value={formatMoney(reports.kpis.totalTaxCents)} testid="report-alltime-tax" />
                      <MiniCard label="Sales count" value={`${reports.kpis.salesCount}`} testid="report-sales-count" />
                      <MiniCard label="Avg ticket" value={formatMoney(reports.kpis.avgTicketCents)} testid="report-avg-ticket" />
                    </div>
                  </CardContent>
                </Card>

                <Card className="border bg-card shadow-soft lg:col-span-7">
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 font-serif" data-testid="text-export-title">
                      <FileDown className="h-5 w-5" />
                      Export for an LLM
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground" data-testid="text-export-subheading">
                      Includes: menu, recipes, inventory, and report KPIs + a suggested prompt.
                    </p>

                    <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                      <Button variant="secondary" className="rounded-2xl" onClick={copyExport} data-testid="button-copy-export">
                        Copy export
                      </Button>
                      <Button className="rounded-2xl" onClick={downloadExport} data-testid="button-download-export">
                        Download .txt
                      </Button>
                    </div>

                    <div className="mt-4">
                      <Label className="text-xs text-muted-foreground" htmlFor="export">
                        Preview
                      </Label>
                      <Textarea
                        id="export"
                        value={exportText}
                        readOnly
                        className="mt-1 h-[380px] rounded-2xl font-mono text-xs"
                        data-testid="textarea-export-preview"
                      />
                    </div>

                    <p className="mt-3 text-xs text-muted-foreground" data-testid="text-prototype-note">
                      Prototype: reports here are local to this page for now.
                    </p>
                  </CardContent>
                </Card>
              </div>
            </div>
          </header>
        </div>
      </div>
    </motion.div>
  );
}

function MiniCard({
  label,
  value,
  testid,
}: {
  label: string;
  value: string;
  testid: string;
}) {
  return (
    <div className="rounded-2xl border bg-background/50 p-3" data-testid={testid}>
      <p className="text-xs text-muted-foreground" data-testid={`${testid}-label`}>
        {label}
      </p>
      <p className="mt-1 font-serif text-xl" data-testid={`${testid}-value`}>
        {value}
      </p>
    </div>
  );
}
