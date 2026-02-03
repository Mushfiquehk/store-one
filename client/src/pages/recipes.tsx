import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Plus, Soup, Trash2 } from "lucide-react";
import AppShell from "@/components/app-shell";
import HelpDialog from "@/components/help-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useStore, type Recipe, type RecipeComponent } from "@/lib/store";

function uid(prefix: string) {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now()}`;
}

export default function RecipesPage() {
  const { toast } = useToast();
  const { recipes, inventory, inventoryCategories, addRecipe, updateRecipe } = useStore();

  const [selectedRecipeId, setSelectedRecipeId] = useState<string | null>(null);
  const selectedRecipe = useMemo(() => recipes.find((r) => r.id === selectedRecipeId) ?? null, [recipes, selectedRecipeId]);

  // Ensure selection validity
  if (selectedRecipeId && !selectedRecipe && recipes.length > 0) {
     setSelectedRecipeId(null);
  }
  if (!selectedRecipeId && recipes.length > 0) {
     setSelectedRecipeId(recipes[0].id);
  }

  // --- Create Recipe Dialog State ---
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("");

  function handleCreateRecipe() {
    const name = createName.trim();
    if (!name) return;

    const newRecipe: Recipe = {
      id: uid("recipe"),
      name,
      components: [],
    };
    addRecipe(newRecipe);
    setSelectedRecipeId(newRecipe.id);
    setCreateName("");
    setIsCreateOpen(false);
    toast({ title: "Recipe created", description: "Now add components." });
  }

  // --- Add Component Dialog State ---
  const [isAddCompOpen, setIsAddCompOpen] = useState(false);
  const [compName, setCompName] = useState("");
  const [compCatId, setCompCatId] = useState("");
  const [compDefaultItemId, setCompDefaultItemId] = useState("");
  const [compQty, setCompQty] = useState("");

  // Filter items based on selected category
  const availableItems = useMemo(() => 
    inventory.filter(i => i.categoryId === compCatId)
  , [inventory, compCatId]);

  function handleAddComponent() {
    if (!selectedRecipe) return;
    
    const name = compName.trim();
    const qty = Number(compQty);

    if (!name) {
      toast({ title: "Slot name required", description: "e.g., 'Milk Choice'" });
      return;
    }
    if (!compCatId) {
      toast({ title: "Category required", description: "Select an inventory category." });
      return;
    }
    if (!compDefaultItemId) {
      toast({ title: "Default item required", description: "Select the default item." });
      return;
    }
    if (!Number.isFinite(qty) || qty <= 0) {
      toast({ title: "Quantity required", description: "Must be > 0." });
      return;
    }

    const defaultItem = inventory.find(i => i.id === compDefaultItemId);

    const component: RecipeComponent = {
      id: uid("comp"),
      type: "ingredient",
      name,
      inventoryCategoryId: compCatId,
      defaultInventoryItemId: compDefaultItemId,
      qty,
      unit: defaultItem?.unit ?? "each"
    };

    const updatedComponents = [...selectedRecipe.components, component];
    updateRecipe(selectedRecipe.id, { components: updatedComponents });

    setCompName("");
    setCompCatId("");
    setCompDefaultItemId("");
    setCompQty("");
    setIsAddCompOpen(false);
    
    toast({ title: "Component added", description: "Inventory will deduct based on selection." });
  }

  function removeComponent(compId: string) {
    if (!selectedRecipe) return;
    updateRecipe(selectedRecipe.id, {
      components: selectedRecipe.components.filter(c => c.id !== compId)
    });
  }

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
      <AppShell title="Recipes">
        <header className="relative overflow-hidden rounded-3xl border bg-card shadow-soft grain">
            <div className="p-6 sm:p-8">
              <p className="text-sm font-medium text-muted-foreground" data-testid="text-tagline">
                Back Office
              </p>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div className="min-w-0">
                  <h1 className="mt-2 font-serif text-3xl tracking-[-0.02em] sm:text-4xl" data-testid="text-title">
                    Recipes
                  </h1>
                  <p className="mt-2 max-w-2xl text-sm text-muted-foreground" data-testid="text-subtitle">
                    Define ingredients and options.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <HelpDialog
                    title="Recipes"
                    summary="Recipes define what is used."
                    steps={["Create recipe", "Add components (Category + Default Item)", "Link to Menu"]}
                    testid="button-help-recipes"
                  />
                </div>
              </div>

              <Separator className="my-6" />

              <div className="grid gap-6 lg:grid-cols-12">
                {/* List Column */}
                <Card className="border bg-card shadow-soft lg:col-span-4 h-fit">
                  <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
                    <CardTitle className="font-serif text-lg">Recipes</CardTitle>
                    <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
                      <DialogTrigger asChild>
                        <Button size="sm" className="rounded-xl h-8" data-testid="button-open-create-recipe">
                          <Plus className="h-4 w-4 mr-1" /> New
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Create Recipe</DialogTitle>
                        </DialogHeader>
                        <div className="grid gap-4 py-4">
                          <div className="grid gap-2">
                            <Label htmlFor="name">Recipe Name</Label>
                            <Input
                              id="name"
                              value={createName}
                              onChange={(e) => setCreateName(e.target.value)}
                              placeholder="e.g. Latte 16oz"
                              data-testid="input-create-recipe-name"
                            />
                          </div>
                        </div>
                        <DialogFooter>
                          <Button onClick={handleCreateRecipe} className="rounded-xl" data-testid="button-confirm-create-recipe">Create</Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-col gap-2 max-h-[500px] overflow-y-auto pr-1">
                      {recipes.map((r) => (
                        <Button
                          key={r.id}
                          variant={selectedRecipeId === r.id ? "default" : "secondary"}
                          className="justify-between rounded-xl h-auto py-3 px-4 text-left whitespace-normal"
                          onClick={() => setSelectedRecipeId(r.id)}
                          data-testid={`select-recipe-${r.id}`}
                        >
                          <span className="font-medium">{r.name}</span>
                          <span className="text-xs opacity-70 ml-2 shrink-0">{r.components.length} parts</span>
                        </Button>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                {/* Editor Column */}
                <Card className="border bg-card shadow-soft lg:col-span-8 min-h-[500px]">
                  {selectedRecipe ? (
                    <>
                      <CardHeader className="pb-3 border-b bg-muted/20">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                          <div>
                            <CardTitle className="font-serif text-2xl" data-testid="text-selected-recipe-name">{selectedRecipe.name}</CardTitle>
                            <p className="text-xs text-muted-foreground mt-1">ID: {selectedRecipe.id}</p>
                          </div>
                          
                          <Dialog open={isAddCompOpen} onOpenChange={setIsAddCompOpen}>
                            <DialogTrigger asChild>
                              <Button className="rounded-xl" data-testid="button-open-add-component">
                                <Plus className="h-4 w-4 mr-2" /> Add Component
                              </Button>
                            </DialogTrigger>
                            <DialogContent className="sm:max-w-[425px]">
                              <DialogHeader>
                                <DialogTitle>Add Recipe Component</DialogTitle>
                              </DialogHeader>
                              <div className="grid gap-4 py-4">
                                <div className="grid gap-2">
                                  <Label>Slot Name</Label>
                                  <Input 
                                    value={compName} 
                                    onChange={e => setCompName(e.target.value)} 
                                    placeholder="e.g. Milk Choice"
                                    data-testid="input-comp-name"
                                  />
                                  <p className="text-[11px] text-muted-foreground">Label shown when customizing.</p>
                                </div>
                                
                                <div className="grid gap-2">
                                  <Label>Category (Options Pool)</Label>
                                  <Select value={compCatId} onValueChange={setCompCatId}>
                                    <SelectTrigger data-testid="select-comp-category">
                                      <SelectValue placeholder="Select inventory category" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {inventoryCategories.map(c => (
                                        <SelectItem key={c.id} value={c.id} data-testid={`option-comp-cat-${c.id}`}>{c.name}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>

                                <div className="grid gap-2">
                                  <Label>Default Item</Label>
                                  <Select value={compDefaultItemId} onValueChange={setCompDefaultItemId} disabled={!compCatId}>
                                    <SelectTrigger data-testid="select-comp-default">
                                      <SelectValue placeholder={compCatId ? "Select default item" : "Choose category first"} />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {availableItems.map(i => (
                                        <SelectItem key={i.id} value={i.id} data-testid={`option-comp-item-${i.id}`}>{i.name} ({i.unit})</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>

                                <div className="grid gap-2">
                                  <Label>Quantity</Label>
                                  <Input 
                                    type="number" 
                                    value={compQty} 
                                    onChange={e => setCompQty(e.target.value)}
                                    placeholder="e.g. 200"
                                    data-testid="input-comp-qty"
                                  />
                                </div>
                              </div>
                              <DialogFooter>
                                <Button onClick={handleAddComponent} className="rounded-xl" data-testid="button-confirm-add-component">Add Component</Button>
                              </DialogFooter>
                            </DialogContent>
                          </Dialog>
                        </div>
                      </CardHeader>
                      <CardContent className="pt-6">
                        <div className="rounded-2xl border overflow-hidden">
                          <Table>
                            <TableHeader>
                              <TableRow className="bg-muted/50">
                                <TableHead>Slot Name</TableHead>
                                <TableHead>Category (Pool)</TableHead>
                                <TableHead>Default Selection</TableHead>
                                <TableHead className="text-right">Qty</TableHead>
                                <TableHead className="w-[80px]"></TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {selectedRecipe.components.length > 0 ? (
                                selectedRecipe.components.map(c => {
                                  const cat = inventoryCategories.find(cat => cat.id === c.inventoryCategoryId);
                                  const item = inventory.find(i => i.id === c.defaultInventoryItemId);
                                  
                                  return (
                                    <TableRow key={c.id} data-testid={`row-comp-${c.id}`}>
                                      <TableCell className="font-medium">{c.name}</TableCell>
                                      <TableCell>{cat?.name ?? "Unknown"}</TableCell>
                                      <TableCell className="text-muted-foreground">{item?.name ?? "Unknown"}</TableCell>
                                      <TableCell className="text-right">{c.qty} {c.unit}</TableCell>
                                      <TableCell>
                                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive/70 hover:text-destructive" onClick={() => removeComponent(c.id)}>
                                          <Trash2 className="h-4 w-4" />
                                        </Button>
                                      </TableCell>
                                    </TableRow>
                                  );
                                })
                              ) : (
                                <TableRow>
                                  <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">
                                    No components defined yet.
                                  </TableCell>
                                </TableRow>
                              )}
                            </TableBody>
                          </Table>
                        </div>
                        <p className="mt-4 text-xs text-muted-foreground">
                          Note: In the POS, users can swap the default item for any other item in the same category.
                        </p>
                      </CardContent>
                    </>
                  ) : (
                    <div className="flex h-full flex-col items-center justify-center p-8 text-center text-muted-foreground">
                      <Soup className="h-12 w-12 opacity-20 mb-4" />
                      <p>Select or create a recipe to start editing.</p>
                    </div>
                  )}
                </Card>
              </div>
            </div>
        </header>
      </AppShell>
    </motion.div>
  );
}
