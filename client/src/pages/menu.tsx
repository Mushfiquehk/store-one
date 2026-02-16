import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ClipboardList, Link2, Plus, Soup, Check, ChevronsUpDown, Info, Filter, ArrowUpRight } from "lucide-react";
import AppShell from "@/components/app-shell";
import HelpDialog from "@/components/help-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useStore, type MenuItem } from "@/lib/store";

function formatMoney(cents: number) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

function uid(prefix: string) {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now()}`;
}

export default function MenuPage({ isTab = false }: { isTab?: boolean }) {
  const { toast } = useToast();
  const { menu, recipes, menuCategories, inventory, addMenuItem, updateMenuItem } = useStore();

  const [draftName, setDraftName] = useState("");
  const [draftCategory, setDraftCategory] = useState(menuCategories[0]?.id ?? "");
  const [draftPrice, setDraftPrice] = useState("");
  const [draftTaxable, setDraftTaxable] = useState(true);
  const [draftRecipeId, setDraftRecipeId] = useState<string | null>(null);
  const [openRecipe, setOpenRecipe] = useState(false);

  const [selectedMenuId, setSelectedMenuId] = useState<string | null>(null);
  const [filterCategory, setFilterCategory] = useState<string>("all");
  
  // Ensure selectedMenu is valid (store might update)
  const selectedMenu = useMemo(() => 
    menu.find((m) => m.id === selectedMenuId) ?? null
  , [menu, selectedMenuId]);

  // If selectedMenu becomes null (deleted/filtered), clear selection
  if (selectedMenuId && !selectedMenu && menu.length > 0) {
      setSelectedMenuId(null);
  }
  
  // Default selection if none
  if (!selectedMenuId && menu.length > 0) {
      setSelectedMenuId(menu[0].id);
  }

  const filteredMenu = useMemo(() => {
    if (filterCategory === "all") return menu;
    return menu.filter(m => m.categoryIds.includes(filterCategory));
  }, [menu, filterCategory]);

  function handleAddItem() {
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
      categoryIds: [draftCategory],
      priceCents: Math.round(price * 100),
      taxable: draftTaxable,
      recipeId: draftRecipeId,
    };

    addMenuItem(item);
    setSelectedMenuId(item.id);

    setDraftName("");
    setDraftPrice("");
    setDraftRecipeId(null);

    toast({ title: "Menu updated", description: `Added “${name}”` + (draftRecipeId ? " linked to recipe." : ".") });
  }

  // Calculate Recipe Cost Helper
  const getRecipeCost = (recipeId?: string | null) => {
    if (!recipeId) return 0;
    const recipe = recipes.find(r => r.id === recipeId);
    if (!recipe) return 0;

    let totalCost = 0;
    recipe.components.forEach(comp => {
      // Find the cost of the default item
      const item = inventory.find(i => i.id === comp.defaultInventoryItemId);
      if (item && comp.qty) {
        // Simple calculation: unit cost * qty
        // In real app, check unit conversion (e.g. g vs kg, but here we assume matching or normalized base units for simplicity in mockup)
        totalCost += (item.unitCostCents * comp.qty);
      }
    });
    return totalCost;
  };

  const Content = (
    <div className="grid gap-6 lg:grid-cols-12">
      <Card className="border bg-card shadow-soft lg:col-span-12">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 font-serif" data-testid="text-menu-admin-title">
            <ClipboardList className="h-5 w-5" />
            Create a menu item
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mt-4 grid gap-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
                <Select value={draftCategory} onValueChange={setDraftCategory}>
                  <SelectTrigger className="mt-1 rounded-2xl" id="menuCategory" data-testid="select-menu-category">
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {menuCategories.map((c) => (
                      <SelectItem key={c.id} value={c.id} data-testid={`option-menucat-${c.id}`}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                  <div className="flex items-center gap-2">
                    <Label className="text-xs text-muted-foreground" htmlFor="menuRecipe">
                      Recipe (Optional)
                    </Label>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger>
                          <Info className="h-3 w-3 text-muted-foreground" />
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="max-w-xs text-xs">Linking a recipe allows automatic inventory deduction when this item is sold.</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  <Popover open={openRecipe} onOpenChange={setOpenRecipe}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={openRecipe}
                      className="mt-1 w-full justify-between rounded-2xl font-normal"
                    >
                      {draftRecipeId
                        ? recipes.find((r) => r.id === draftRecipeId)?.name
                        : "Select recipe..."}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[200px] p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Search recipe..." />
                      <CommandList>
                        <CommandEmpty>No recipe found.</CommandEmpty>
                        <CommandGroup>
                          <CommandItem
                            value="none"
                            onSelect={() => {
                              setDraftRecipeId(null);
                              setOpenRecipe(false);
                            }}
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                !draftRecipeId ? "opacity-100" : "opacity-0"
                              )}
                            />
                            None
                          </CommandItem>
                          {recipes.map((recipe) => (
                            <CommandItem
                              key={recipe.id}
                              value={recipe.name}
                              onSelect={() => {
                                setDraftRecipeId(recipe.id === draftRecipeId ? null : recipe.id);
                                setOpenRecipe(false);
                              }}
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  draftRecipeId === recipe.id ? "opacity-100" : "opacity-0"
                                )}
                              />
                              {recipe.name}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
              <div className="flex gap-2">
                  <div className="flex-1">
                    <Label className="text-xs text-muted-foreground" htmlFor="menuPrice">
                      Price
                    </Label>
                    <Input
                      id="menuPrice"
                      value={draftPrice}
                      onChange={(e) => setDraftPrice(e.target.value)}
                      className="mt-1 rounded-2xl"
                      inputMode="decimal"
                      placeholder="4.50"
                      data-testid="input-menu-price"
                    />
                  </div>
                  <div className="flex items-end pb-1">
                    <Button
                      variant={draftTaxable ? "default" : "outline"}
                      size="sm"
                      className="rounded-xl h-9"
                      onClick={() => setDraftTaxable((v) => !v)}
                      title="Toggle Taxable"
                    >
                      {draftTaxable ? "Taxable" : "No Tax"}
                    </Button>
                  </div>
              </div>
            </div>

            <div className="flex justify-end">
              <Button className="rounded-2xl px-6" onClick={handleAddItem} data-testid="button-add-menu-item">
                <Plus className="mr-2 h-4 w-4" />
                Add Item
              </Button>
            </div>

            <Separator />

            {/* Filter */}
            <div className="flex justify-between items-center px-1">
               <h3 className="text-sm font-medium text-muted-foreground">Menu Items</h3>
               <div className="flex items-center gap-2">
                  <Filter className="h-4 w-4 text-muted-foreground" />
                  <Select value={filterCategory} onValueChange={setFilterCategory}>
                    <SelectTrigger className="w-[180px] h-9 rounded-xl">
                      <SelectValue placeholder="All Categories" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Categories</SelectItem>
                      {menuCategories.map(c => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
               </div>
            </div>

            <div className="rounded-2xl border bg-background/40">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[30%]">Item</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Recipe</TableHead>
                    <TableHead className="text-right">Price</TableHead>
                    <TableHead className="text-right">Cost</TableHead>
                    <TableHead className="text-right">Cost %</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredMenu.map((m) => {
                    const selected = m.id === selectedMenuId;
                    const hasRecipe = Boolean(m.recipeId);
                    const recipeName = m.recipeId ? recipes.find(r => r.id === m.recipeId)?.name : null;
                    const costCents = getRecipeCost(m.recipeId);
                    const costPercent = m.priceCents > 0 ? (costCents / m.priceCents) * 100 : 0;

                    return (
                      <TableRow
                        key={m.id}
                        className={selected ? "bg-primary/5" : undefined}
                        onClick={() => setSelectedMenuId(m.id)}
                        data-testid={`row-menu-${m.id}`}
                      >
                        <TableCell className="font-medium" data-testid={`text-menu-row-name-${m.id}`}>
                            <span className="truncate">{m.name}</span>
                        </TableCell>
                        <TableCell className="text-muted-foreground" data-testid={`text-menu-row-category-${m.id}`}>
                          {menuCategories.find(c => c.id === m.categoryIds[0])?.name ?? "Uncategorized"}
                        </TableCell>
                        <TableCell>
                            {hasRecipe ? (
                              <div className="flex items-center gap-1.5 text-xs text-primary font-medium">
                                  <Soup className="h-3.5 w-3.5" />
                                  {recipeName ?? "Unknown Recipe"}
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground italic">No recipe</span>
                            )}
                        </TableCell>
                        <TableCell className="text-right" data-testid={`text-menu-row-price-${m.id}`}>
                          {formatMoney(m.priceCents)}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground text-xs font-mono">
                          {hasRecipe ? formatMoney(costCents) : "-"}
                        </TableCell>
                        <TableCell className="text-right">
                          {hasRecipe ? (
                             <span className={cn(
                               "inline-flex items-center px-2 py-0.5 rounded text-xs font-medium",
                               costPercent > 30 ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" : 
                               costPercent < 20 ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" :
                               "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-400"
                             )}>
                                {costPercent.toFixed(1)}%
                             </span>
                          ) : "-"}
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
    </div>
  );

  if (isTab) return Content;

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

              {Content}
            </div>
        </header>
      </AppShell>
    </motion.div>
  );
}
