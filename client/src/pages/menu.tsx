import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ClipboardList, Link2, Plus, Soup } from "lucide-react";
import AppShell from "@/components/app-shell";
import HelpDialog from "@/components/help-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";

type MenuItem = {
  id: string;
  name: string;
  priceCents: number;
  category: string;
  taxable: boolean;
  recipeId?: string | null;
};

type Recipe = {
  id: string;
  name: string;
  ingredients: Array<{ invId: string; qty: number }>;
};

function formatMoney(cents: number) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

function uid(prefix: string) {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now()}`;
}

export default function MenuPage() {
  const { toast } = useToast();

  const [menu, setMenu] = useState<MenuItem[]>([
    {
      id: "coffee",
      name: "House Coffee",
      priceCents: 350,
      category: "Drinks",
      taxable: true,
      recipeId: "recipe_coffee",
    },
    {
      id: "latte",
      name: "Vanilla Latte",
      priceCents: 575,
      category: "Drinks",
      taxable: true,
      recipeId: "recipe_latte",
    },
    {
      id: "muffin",
      name: "Blueberry Muffin",
      priceCents: 425,
      category: "Bakery",
      taxable: true,
      recipeId: null,
    },
  ]);

  const [recipes, setRecipes] = useState<Recipe[]>([
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
  ]);

  const recipesById = useMemo(() => {
    const map = new Map<string, Recipe>();
    for (const r of recipes) map.set(r.id, r);
    return map;
  }, [recipes]);

  const [draftName, setDraftName] = useState("");
  const [draftCategory, setDraftCategory] = useState("General");
  const [draftPrice, setDraftPrice] = useState("");
  const [draftTaxable, setDraftTaxable] = useState(true);

  const [selectedMenuId, setSelectedMenuId] = useState<string | null>(menu[0]?.id ?? null);
  const selectedMenu = useMemo(() => menu.find((m) => m.id === selectedMenuId) ?? null, [menu, selectedMenuId]);

  function addMenuItem() {
    const name = draftName.trim();
    if (!name) {
      toast({ title: "Name is required", description: "Enter a menu item name." });
      return;
    }

    const price = Number(draftPrice);
    if (!Number.isFinite(price) || price <= 0) {
      toast({ title: "Price is required", description: "Enter a valid price (e.g., 4.50)." });
      return;
    }

    const item: MenuItem = {
      id: uid("menu"),
      name,
      category: draftCategory.trim() || "General",
      priceCents: Math.round(price * 100),
      taxable: draftTaxable,
      recipeId: null,
    };

    setMenu((prev) => [item, ...prev]);
    setSelectedMenuId(item.id);

    setDraftName("");
    setDraftPrice("");

    toast({ title: "Menu updated", description: `Added “${name}”. Next: assign a recipe (optional).` });
  }

  function assignRecipe(recipeId: string | null) {
    if (!selectedMenu) return;

    setMenu((prev) => prev.map((m) => (m.id === selectedMenu.id ? { ...m, recipeId } : m)));

    toast({
      title: "Recipe link updated",
      description: recipeId ? "This sale will deduct ingredients automatically." : "No recipe assigned yet.",
    });
  }

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
      <AppShell title="Menu">
        <header className="relative overflow-hidden rounded-3xl border bg-card shadow-soft grain">
            <div className="p-6 sm:p-8">
              <p className="text-sm font-medium text-muted-foreground" data-testid="text-tagline">
                Back Office
              </p>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div className="min-w-0">
                  <h1 className="mt-2 font-serif text-3xl tracking-[-0.02em] sm:text-4xl" data-testid="text-title">
                    Menu
                  </h1>
                  <p className="mt-2 max-w-2xl text-sm text-muted-foreground" data-testid="text-subtitle">
                    Create items. Link recipes.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <HelpDialog
                    title="Menu"
                    summary="Menu items are what customers buy."
                    steps={["Add menu item", "Select it in the list", "Link a recipe (optional)"]}
                    testid="button-help-menu"
                  />
                </div>
              </div>

              <Separator className="my-6" />

              <div className="grid gap-6 lg:grid-cols-12">
                <Card className="border bg-card shadow-soft lg:col-span-7">
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 font-serif" data-testid="text-menu-admin-title">
                      <ClipboardList className="h-5 w-5" />
                      Create a menu item
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="mt-4 grid gap-3">
                      <div className="grid gap-2 sm:grid-cols-2">
                        <div>
                          <Label className="text-xs text-muted-foreground" htmlFor="menuName">
                            Name
                          </Label>
                          <Input
                            id="menuName"
                            value={draftName}
                            onChange={(e) => setDraftName(e.target.value)}
                            className="mt-1 rounded-2xl"
                            placeholder="e.g., Lemonade"
                            data-testid="input-menu-name"
                          />
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground" htmlFor="menuCategory">
                            Category
                          </Label>
                          <Input
                            id="menuCategory"
                            value={draftCategory}
                            onChange={(e) => setDraftCategory(e.target.value)}
                            className="mt-1 rounded-2xl"
                            placeholder="e.g., Drinks"
                            data-testid="input-menu-category"
                          />
                        </div>
                      </div>

                      <div className="grid gap-2 sm:grid-cols-2">
                        <div>
                          <Label className="text-xs text-muted-foreground" htmlFor="menuPrice">
                            Price (USD)
                          </Label>
                          <Input
                            id="menuPrice"
                            value={draftPrice}
                            onChange={(e) => setDraftPrice(e.target.value)}
                            className="mt-1 rounded-2xl"
                            inputMode="decimal"
                            placeholder="e.g., 4.50"
                            data-testid="input-menu-price"
                          />
                        </div>
                        <div className="flex items-end justify-between gap-3 rounded-2xl border bg-background/50 px-3 py-2">
                          <div>
                            <p className="text-xs font-medium" data-testid="text-taxable-label">
                              Taxable
                            </p>
                            <p className="text-xs text-muted-foreground" data-testid="text-taxable-hint">
                              Included in tax calculation
                            </p>
                          </div>
                          <Button
                            variant={draftTaxable ? "default" : "secondary"}
                            className="rounded-xl"
                            onClick={() => setDraftTaxable((v) => !v)}
                            data-testid="button-toggle-taxable"
                          >
                            {draftTaxable ? "Yes" : "No"}
                          </Button>
                        </div>
                      </div>

                      <Button className="rounded-2xl" onClick={addMenuItem} data-testid="button-add-menu-item">
                        <Plus className="mr-2 h-4 w-4" />
                        Add item
                      </Button>

                      <Separator />

                      <div className="max-h-[360px] overflow-auto rounded-2xl border bg-background/40">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="w-[44%]">Item</TableHead>
                              <TableHead>Category</TableHead>
                              <TableHead className="text-right">Price</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {menu.map((m) => {
                              const selected = m.id === selectedMenuId;
                              const hasRecipe = Boolean(m.recipeId);

                              return (
                                <TableRow
                                  key={m.id}
                                  className={selected ? "bg-primary/5" : undefined}
                                  onClick={() => setSelectedMenuId(m.id)}
                                  data-testid={`row-menu-${m.id}`}
                                >
                                  <TableCell className="font-medium" data-testid={`text-menu-row-name-${m.id}`}>
                                    <div className="flex items-center gap-2">
                                      <span className="truncate">{m.name}</span>
                                      <span
                                        className={
                                          hasRecipe
                                            ? "rounded-full bg-accent/10 px-2 py-0.5 text-[11px] font-medium text-accent"
                                            : "rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
                                        }
                                        data-testid={`status-menu-recipe-${m.id}`}
                                      >
                                        {hasRecipe ? "Recipe linked" : "No recipe"}
                                      </span>
                                    </div>
                                  </TableCell>
                                  <TableCell className="text-muted-foreground" data-testid={`text-menu-row-category-${m.id}`}>
                                    {m.category}
                                  </TableCell>
                                  <TableCell className="text-right" data-testid={`text-menu-row-price-${m.id}`}>
                                    {formatMoney(m.priceCents)}
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border bg-card shadow-soft lg:col-span-5">
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 font-serif" data-testid="text-link-recipe-title">
                      <Link2 className="h-5 w-5" />
                      Link a recipe
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {selectedMenu ? (
                      <div className="space-y-3">
                        <div className="rounded-2xl border bg-background/40 p-4" data-testid="card-selected-menu">
                          <p className="text-xs font-medium text-muted-foreground" data-testid="text-selected-menu-label">
                            Selected menu item
                          </p>
                          <p className="mt-1 font-serif text-2xl" data-testid="text-selected-menu-name">
                            {selectedMenu.name}
                          </p>
                          <p className="mt-1 text-sm text-muted-foreground" data-testid="text-selected-menu-meta">
                            {formatMoney(selectedMenu.priceCents)} • {selectedMenu.category}
                          </p>
                        </div>

                        <div className="rounded-2xl border bg-background/40 p-4" data-testid="card-recipe-options">
                          <p className="text-xs font-medium text-muted-foreground" data-testid="text-recipe-options-title">
                            Choose a recipe
                          </p>

                          <div className="mt-3 grid gap-2">
                            <Button
                              variant={selectedMenu.recipeId ? "secondary" : "default"}
                              className="justify-start rounded-2xl"
                              onClick={() => assignRecipe(null)}
                              data-testid="button-assign-recipe-none"
                            >
                              No recipe yet
                            </Button>

                            {recipes.map((r) => {
                              const selected = selectedMenu.recipeId === r.id;
                              return (
                                <Button
                                  key={r.id}
                                  variant={selected ? "default" : "secondary"}
                                  className="justify-between rounded-2xl"
                                  onClick={() => assignRecipe(r.id)}
                                  data-testid={`button-assign-recipe-${r.id}`}
                                >
                                  <span className="flex items-center gap-2">
                                    <Soup className="h-4 w-4" />
                                    {r.name}
                                  </span>
                                  <span className="text-xs text-muted-foreground" data-testid={`text-recipe-ingredient-count-${r.id}`}>
                                    {r.ingredients.length} ingredients
                                  </span>
                                </Button>
                              );
                            })}
                          </div>

                          <p className="mt-3 text-xs text-muted-foreground" data-testid="text-recipe-next-step">
                            Next: go to the Recipes page to create or edit recipes.
                          </p>
                        </div>

                        <Separator />

                        <div className="rounded-2xl border bg-background/40 p-4" data-testid="card-tip">
                          <p className="text-sm font-medium" data-testid="text-tip-title">
                            Tip
                          </p>
                          <p className="mt-1 text-sm text-muted-foreground" data-testid="text-tip-body">
                            If a menu item has a recipe, recording a sale can automatically subtract the recipe ingredients from inventory.
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-2xl border bg-background/40 p-4 text-sm text-muted-foreground" data-testid="empty-selected-menu">
                        Select a menu item from the list.
                      </div>
                    )}

                    <Separator className="my-4" />

                    <div className="rounded-2xl border bg-background/40 p-4" data-testid="card-recipes-list">
                      <p className="text-xs font-medium text-muted-foreground" data-testid="text-recipes-available">
                        Recipes available
                      </p>
                      <ul className="mt-2 space-y-2 text-sm">
                        {recipes.map((r) => (
                          <li key={r.id} className="flex items-center justify-between" data-testid={`row-recipe-${r.id}`}>
                            <span className="text-muted-foreground">{r.name}</span>
                            <span className="font-medium" data-testid={`text-recipe-id-${r.id}`}>
                              {r.id}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <p className="mt-3 text-xs text-muted-foreground" data-testid="text-prototype-note">
                      Prototype: recipes are local to this page for now.
                    </p>
                  </CardContent>
                </Card>
              </div>
            </div>
        </header>
      </AppShell>
    </motion.div>
  );
}
