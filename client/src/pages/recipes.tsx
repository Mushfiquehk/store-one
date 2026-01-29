import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Plus, Soup } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";

type InventoryItem = {
  id: string;
  name: string;
  unit: string;
};

type Recipe = {
  id: string;
  name: string;
  ingredients: Array<{ invId: string; qty: number }>;
};

function uid(prefix: string) {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now()}`;
}

export default function RecipesPage() {
  const { toast } = useToast();

  const [inventory] = useState<InventoryItem[]>([
    { id: "beans_g", name: "Coffee Beans", unit: "g" },
    { id: "milk_ml", name: "Whole Milk", unit: "ml" },
    { id: "cup_12oz", name: "Cup 12oz", unit: "each" },
    { id: "muffin_each", name: "Muffin", unit: "each" },
  ]);

  const invById = useMemo(() => {
    const map = new Map<string, InventoryItem>();
    for (const i of inventory) map.set(i.id, i);
    return map;
  }, [inventory]);

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

  const [selectedRecipeId, setSelectedRecipeId] = useState<string | null>(recipes[0]?.id ?? null);
  const selectedRecipe = useMemo(() => recipes.find((r) => r.id === selectedRecipeId) ?? null, [recipes, selectedRecipeId]);

  const [draftRecipeName, setDraftRecipeName] = useState("");

  const [draftInvId, setDraftInvId] = useState(inventory[0]?.id ?? "");
  const [draftQty, setDraftQty] = useState("1");

  function createRecipe() {
    const name = draftRecipeName.trim();
    if (!name) {
      toast({ title: "Recipe name required", description: "Enter a recipe name (e.g., Latte 12oz)." });
      return;
    }

    const recipe: Recipe = {
      id: uid("recipe"),
      name,
      ingredients: [],
    };

    setRecipes((prev) => [recipe, ...prev]);
    setSelectedRecipeId(recipe.id);
    setDraftRecipeName("");

    toast({ title: "Recipe created", description: "Next: add ingredients from inventory." });
  }

  function addIngredient() {
    if (!selectedRecipe) return;

    const invId = draftInvId.trim();
    const qty = Number(draftQty);

    if (!invById.get(invId)) {
      toast({ title: "Pick a valid inventory item", description: "Choose an item from the inventory list." });
      return;
    }

    if (!Number.isFinite(qty) || qty <= 0) {
      toast({ title: "Quantity must be valid", description: "Use a number greater than 0." });
      return;
    }

    setRecipes((prev) =>
      prev.map((r) => {
        if (r.id !== selectedRecipe.id) return r;

        const existing = r.ingredients.find((i) => i.invId === invId);
        if (existing) {
          return {
            ...r,
            ingredients: r.ingredients.map((i) => (i.invId === invId ? { ...i, qty: i.qty + qty } : i)),
          };
        }

        return {
          ...r,
          ingredients: [...r.ingredients, { invId, qty }],
        };
      }),
    );

    toast({ title: "Ingredient added", description: "This will deduct from inventory when the linked menu item is sold." });
    setDraftQty("1");
  }

  function removeIngredient(invId: string) {
    if (!selectedRecipe) return;
    setRecipes((prev) =>
      prev.map((r) => (r.id === selectedRecipe.id ? { ...r, ingredients: r.ingredients.filter((i) => i.invId !== invId) } : r)),
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
      <div className="min-h-screen app-shell">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <header className="relative overflow-hidden rounded-3xl border bg-card shadow-soft grain">
            <div className="p-6 sm:p-8">
              <p className="text-sm font-medium text-muted-foreground" data-testid="text-tagline">
                Back Office
              </p>
              <h1 className="mt-2 font-serif text-3xl tracking-[-0.02em] sm:text-4xl" data-testid="text-title">
                Recipes
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground" data-testid="text-subtitle">
                Recipes are built from inventory items. When a menu item links to a recipe, recording a sale deducts those ingredients.
              </p>

              <Separator className="my-6" />

              <div className="grid gap-6 lg:grid-cols-12">
                <Card className="border bg-card shadow-soft lg:col-span-5">
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 font-serif" data-testid="text-recipe-create-title">
                      <Soup className="h-5 w-5" />
                      Create a recipe
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ol className="grid gap-3 rounded-2xl border bg-background/40 p-4 text-sm" data-testid="list-steps-recipe">
                      <li className="flex gap-3" data-testid="step-recipe-1">
                        <span className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
                          1
                        </span>
                        <span>
                          Enter a <span className="font-medium">recipe name</span> and click <span className="font-medium">Create recipe</span>.
                        </span>
                      </li>
                      <li className="flex gap-3" data-testid="step-recipe-2">
                        <span className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
                          2
                        </span>
                        <span>
                          Select the recipe from the list (it will auto-select after creation).
                        </span>
                      </li>
                      <li className="flex gap-3" data-testid="step-recipe-3">
                        <span className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
                          3
                        </span>
                        <span>
                          Add ingredients: choose an <span className="font-medium">inventory item</span> and a <span className="font-medium">quantity</span> used per sale.
                        </span>
                      </li>
                    </ol>

                    <div className="mt-4 grid gap-3">
                      <div>
                        <Label className="text-xs text-muted-foreground" htmlFor="recipeName">
                          Recipe name
                        </Label>
                        <Input
                          id="recipeName"
                          value={draftRecipeName}
                          onChange={(e) => setDraftRecipeName(e.target.value)}
                          className="mt-1 rounded-2xl"
                          placeholder="e.g., Iced Latte 16oz"
                          data-testid="input-recipe-name"
                        />
                      </div>

                      <Button className="rounded-2xl" onClick={createRecipe} data-testid="button-create-recipe">
                        <Plus className="mr-2 h-4 w-4" />
                        Create recipe
                      </Button>

                      <Separator />

                      <div className="rounded-2xl border bg-background/40 p-3" data-testid="card-recipes">
                        <p className="text-xs font-medium text-muted-foreground" data-testid="text-recipes-list-title">
                          Recipes
                        </p>
                        <div className="mt-2 grid gap-2">
                          {recipes.map((r) => {
                            const selected = r.id === selectedRecipeId;
                            return (
                              <Button
                                key={r.id}
                                variant={selected ? "default" : "secondary"}
                                className="justify-between rounded-2xl"
                                onClick={() => setSelectedRecipeId(r.id)}
                                data-testid={`button-select-recipe-${r.id}`}
                              >
                                <span className="truncate">{r.name}</span>
                                <span className="text-xs text-muted-foreground" data-testid={`text-recipe-ingredients-${r.id}`}>
                                  {r.ingredients.length} items
                                </span>
                              </Button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border bg-card shadow-soft lg:col-span-7">
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 font-serif" data-testid="text-recipe-edit-title">
                      <Soup className="h-5 w-5" />
                      Add ingredients
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {selectedRecipe ? (
                      <div className="space-y-4">
                        <div className="rounded-2xl border bg-background/40 p-4" data-testid="card-selected-recipe">
                          <p className="text-xs font-medium text-muted-foreground" data-testid="text-selected-recipe-label">
                            Selected recipe
                          </p>
                          <p className="mt-1 font-serif text-2xl" data-testid="text-selected-recipe-name">
                            {selectedRecipe.name}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground" data-testid="text-selected-recipe-id">
                            ID: {selectedRecipe.id}
                          </p>
                        </div>

                        <div className="grid gap-3 rounded-2xl border bg-background/40 p-4" data-testid="card-add-ingredient">
                          <p className="text-xs font-medium text-muted-foreground" data-testid="text-add-ingredient-title">
                            Add an ingredient (per 1 menu item sold)
                          </p>

                          <div className="grid gap-2 sm:grid-cols-2">
                            <div>
                              <Label className="text-xs text-muted-foreground" htmlFor="invId">
                                Inventory item
                              </Label>
                              <Input
                                id="invId"
                                value={draftInvId}
                                onChange={(e) => setDraftInvId(e.target.value)}
                                className="mt-1 rounded-2xl"
                                placeholder="beans_g"
                                data-testid="input-ingredient-invid"
                              />
                              <p className="mt-1 text-xs text-muted-foreground" data-testid="text-inventory-hint">
                                Tip: copy an ID from the inventory list below.
                              </p>
                            </div>

                            <div>
                              <Label className="text-xs text-muted-foreground" htmlFor="qty">
                                Quantity
                              </Label>
                              <Input
                                id="qty"
                                value={draftQty}
                                onChange={(e) => setDraftQty(e.target.value)}
                                className="mt-1 rounded-2xl"
                                inputMode="decimal"
                                placeholder="e.g., 18"
                                data-testid="input-ingredient-qty"
                              />
                              <p className="mt-1 text-xs text-muted-foreground" data-testid="text-unit-preview">
                                Unit: {invById.get(draftInvId)?.unit ?? "—"}
                              </p>
                            </div>
                          </div>

                          <Button className="rounded-2xl" onClick={addIngredient} data-testid="button-add-ingredient">
                            <Plus className="mr-2 h-4 w-4" />
                            Add ingredient
                          </Button>
                        </div>

                        <div className="rounded-2xl border bg-background/40" data-testid="table-ingredients">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Ingredient</TableHead>
                                <TableHead className="w-[140px] text-right">Qty</TableHead>
                                <TableHead className="w-[120px] text-right">Action</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {selectedRecipe.ingredients.length ? (
                                selectedRecipe.ingredients.map((i) => (
                                  <TableRow key={i.invId} data-testid={`row-ingredient-${i.invId}`}>
                                    <TableCell>
                                      <p className="font-medium" data-testid={`text-ingredient-name-${i.invId}`}>
                                        {invById.get(i.invId)?.name ?? i.invId}
                                      </p>
                                      <p className="text-xs text-muted-foreground" data-testid={`text-ingredient-id-${i.invId}`}>
                                        ID: {i.invId}
                                      </p>
                                    </TableCell>
                                    <TableCell className="text-right" data-testid={`text-ingredient-qty-${i.invId}`}>
                                      {i.qty} {invById.get(i.invId)?.unit ?? ""}
                                    </TableCell>
                                    <TableCell className="text-right">
                                      <Button
                                        variant="secondary"
                                        size="sm"
                                        className="rounded-xl"
                                        onClick={() => removeIngredient(i.invId)}
                                        data-testid={`button-remove-ingredient-${i.invId}`}
                                      >
                                        Remove
                                      </Button>
                                    </TableCell>
                                  </TableRow>
                                ))
                              ) : (
                                <TableRow>
                                  <TableCell colSpan={3} className="py-10 text-center text-sm text-muted-foreground" data-testid="empty-ingredients">
                                    No ingredients yet. Add your first ingredient above.
                                  </TableCell>
                                </TableRow>
                              )}
                            </TableBody>
                          </Table>
                        </div>

                        <Separator />

                        <div className="rounded-2xl border bg-background/40 p-4" data-testid="card-inventory-reference">
                          <p className="text-xs font-medium text-muted-foreground" data-testid="text-inventory-reference-title">
                            Inventory reference
                          </p>
                          <ul className="mt-2 grid gap-2 text-sm">
                            {inventory.map((i) => (
                              <li key={i.id} className="flex items-center justify-between" data-testid={`row-invref-${i.id}`}>
                                <span className="text-muted-foreground">{i.name}</span>
                                <span className="font-mono text-xs" data-testid={`text-invref-id-${i.id}`}>
                                  {i.id} ({i.unit})
                                </span>
                              </li>
                            ))}
                          </ul>
                        </div>

                        <p className="text-xs text-muted-foreground" data-testid="text-next-step">
                          Next: go to the Menu page and link this recipe to a menu item.
                        </p>
                      </div>
                    ) : (
                      <div className="rounded-2xl border bg-background/40 p-4 text-sm text-muted-foreground" data-testid="empty-selected-recipe">
                        Select or create a recipe to begin.
                      </div>
                    )}

                    <p className="mt-3 text-xs text-muted-foreground" data-testid="text-prototype-note">
                      Prototype: recipes are local to this page for now.
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
