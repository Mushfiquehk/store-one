import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Plus, Soup, Trash2, GripVertical, Search } from "lucide-react";
import AppShell from "@/components/app-shell";
import HelpDialog from "@/components/help-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { useStore, type Recipe, type RecipeComponent } from "@/lib/store";
import { DndContext, useDraggable, useDroppable, DragOverlay, type DragEndEvent, type DragStartEvent, useSensor, useSensors, PointerSensor } from "@dnd-kit/core";
import { createPortal } from "react-dom";

function uid(prefix: string) {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now()}`;
}

// Draggable Ingredient Card
function DraggableIngredient({ item, categoryName }: { item: any, categoryName: string }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `source-${item.id}`,
    data: { item }
  });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`p-3 rounded-xl border bg-card shadow-sm cursor-grab hover:border-primary/50 transition-colors flex flex-col gap-1 touch-none ${isDragging ? 'opacity-50' : ''}`}
    >
      <div className="flex justify-between items-start">
        <span className="font-medium text-sm leading-tight">{item.name}</span>
        <GripVertical className="h-4 w-4 text-muted-foreground/50" />
      </div>
      <div className="flex justify-between text-[10px] text-muted-foreground">
        <span>{categoryName}</span>
        <span>{item.unit}</span>
      </div>
    </div>
  );
}

// Droppable Recipe Area
function DroppableRecipeArea({ children }: { children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({
    id: 'recipe-drop-zone',
  });

  return (
    <div
      ref={setNodeRef}
      className={`grid grid-cols-2 gap-3 p-4 rounded-xl border-2 border-dashed min-h-[300px] content-start transition-colors ${isOver ? 'border-primary bg-primary/5' : 'border-border/50'}`}
    >
      {children}
    </div>
  );
}

export default function RecipesPage({ isTab = false }: { isTab?: boolean }) {
  const { toast } = useToast();
  const { recipes, inventory, inventoryCategories, addRecipe, updateRecipe } = useStore();

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

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
    toast({ title: "Recipe created", description: "Drag ingredients to add components." });
  }

  // --- Component Dialog State ---
  const [isCompDialogOpen, setIsCompDialogOpen] = useState(false);
  const [activeCompId, setActiveCompId] = useState<string | null>(null); // null = new, string = edit
  
  // Form State
  const [compName, setCompName] = useState("");
  const [compCatId, setCompCatId] = useState("");
  const [compDefaultItemId, setCompDefaultItemId] = useState("");
  const [compQty, setCompQty] = useState("");

  // Search State for Ingredients Palette
  const [searchTerm, setSearchTerm] = useState("");

  // Filter items based on selected category (for manual selection in dialog)
  const availableItemsForDialog = useMemo(() => 
    inventory.filter(i => i.categoryId === compCatId)
  , [inventory, compCatId]);

  // Filter items for Palette
  const filteredInventory = useMemo(() => {
    if (!searchTerm) return inventory;
    const lower = searchTerm.toLowerCase();
    return inventory.filter(i => i.name.toLowerCase().includes(lower) || i.sku.toLowerCase().includes(lower));
  }, [inventory, searchTerm]);

  // Drag State
  const [draggedItem, setDraggedItem] = useState<any>(null);

  function handleDragStart(event: DragStartEvent) {
    if (event.active.data.current?.item) {
      setDraggedItem(event.active.data.current.item);
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    setDraggedItem(null);
    const { over, active } = event;
    
    // Check if dropped on the recipe zone
    if (over && over.id === 'recipe-drop-zone') {
       const item = active.data.current?.item;
       if (item) {
         // Prepare dialog for new component
         setActiveCompId(null);
         setCompName(item.name); // Default slot name to item name
         setCompCatId(item.categoryId);
         setCompDefaultItemId(item.id);
         setCompQty("");
         setIsCompDialogOpen(true);
       }
    }
  }

  function openEditComponent(comp: RecipeComponent) {
    setActiveCompId(comp.id);
    setCompName(comp.name);
    setCompCatId(comp.inventoryCategoryId || "");
    setCompDefaultItemId(comp.defaultInventoryItemId || "");
    setCompQty(String(comp.qty || ""));
    setIsCompDialogOpen(true);
  }

  function handleSaveComponent() {
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

    if (activeCompId) {
      // Edit existing
      const updatedComponents = selectedRecipe.components.map(c => {
        if (c.id !== activeCompId) return c;
        return {
          ...c,
          name,
          inventoryCategoryId: compCatId,
          defaultInventoryItemId: compDefaultItemId,
          qty,
          unit: defaultItem?.unit ?? "each"
        };
      });
      updateRecipe(selectedRecipe.id, { components: updatedComponents });
      toast({ title: "Component updated" });
    } else {
      // Add new
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
      toast({ title: "Component added" });
    }

    setIsCompDialogOpen(false);
  }

  function removeComponent(compId: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (!selectedRecipe) return;
    updateRecipe(selectedRecipe.id, {
      components: selectedRecipe.components.filter(c => c.id !== compId)
    });
  }

  const Content = (
    <div className="grid gap-6 lg:grid-cols-12">
      {/* List Column */}
      <Card className="border bg-card shadow-soft lg:col-span-3 h-fit max-h-[calc(100vh-300px)] flex flex-col">
        <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0 px-4 pt-4">
          <CardTitle className="font-serif text-lg">Recipes</CardTitle>
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="ghost" className="h-8 w-8 p-0" data-testid="button-open-create-recipe">
                <Plus className="h-4 w-4" />
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
        <CardContent className="p-2 flex-1 overflow-y-auto">
          <div className="flex flex-col gap-1">
            {recipes.map((r) => (
              <Button
                key={r.id}
                variant={selectedRecipeId === r.id ? "secondary" : "ghost"}
                className={`justify-between rounded-lg h-auto py-2.5 px-3 text-left whitespace-normal ${selectedRecipeId === r.id ? 'bg-secondary font-medium shadow-sm' : ''}`}
                onClick={() => setSelectedRecipeId(r.id)}
                data-testid={`select-recipe-${r.id}`}
              >
                <span className="truncate">{r.name}</span>
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Editor Column */}
      <Card className="border bg-card shadow-soft lg:col-span-9 h-full min-h-[500px] flex flex-col overflow-hidden">
        {selectedRecipe ? (
          <div className="flex flex-col h-full">
            <div className="px-6 py-4 border-b bg-muted/20 flex justify-between items-center">
              <div>
                 <h2 className="font-serif text-2xl" data-testid="text-selected-recipe-name">{selectedRecipe.name}</h2>
                 <p className="text-xs text-muted-foreground mt-1">Drag ingredients here to add components</p>
              </div>
            </div>
            
            <div className="flex-1 grid grid-cols-1 md:grid-cols-12 h-full overflow-hidden">
              {/* Left: Recipe Components (Drop Zone) */}
              <div className="md:col-span-8 p-6 overflow-y-auto bg-background/50">
                 <DroppableRecipeArea>
                    {selectedRecipe.components.length > 0 ? (
                       selectedRecipe.components.map(c => {
                          const cat = inventoryCategories.find(cat => cat.id === c.inventoryCategoryId);
                          const item = inventory.find(i => i.id === c.defaultInventoryItemId);
                          return (
                            <div 
                              key={c.id} 
                              className="p-4 rounded-xl border bg-card shadow-sm hover:shadow-md hover:border-primary/30 transition-all cursor-pointer group relative"
                              onClick={() => openEditComponent(c)}
                            >
                              <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                 <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:bg-destructive/10" onClick={(e) => removeComponent(c.id, e)}>
                                   <Trash2 className="h-3 w-3" />
                                 </Button>
                              </div>
                              
                              <p className="font-semibold text-sm mb-1">{c.name}</p>
                              
                              <div className="text-xs space-y-1 text-muted-foreground">
                                 <div className="flex justify-between">
                                   <span>Default:</span>
                                   <span className="font-medium text-foreground">{item?.name}</span>
                                 </div>
                                 <div className="flex justify-between">
                                   <span>Category:</span>
                                   <span>{cat?.name}</span>
                                 </div>
                                 <div className="flex justify-between pt-1 border-t border-dashed mt-1">
                                   <span>Qty:</span>
                                   <span className="font-medium text-primary">{c.qty} {c.unit}</span>
                                 </div>
                              </div>
                            </div>
                          );
                       })
                    ) : (
                      <div className="col-span-2 flex flex-col items-center justify-center h-40 text-muted-foreground border-2 border-dashed rounded-xl border-muted-foreground/20">
                        <Soup className="h-8 w-8 mb-2 opacity-20" />
                        <p>Drop ingredients here</p>
                      </div>
                    )}
                 </DroppableRecipeArea>
              </div>

              {/* Right: Ingredients Palette (Source) */}
              <div className="md:col-span-4 border-l bg-muted/10 flex flex-col h-full overflow-hidden">
                 <div className="p-3 border-b">
                   <div className="relative">
                     <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                     <Input 
                       placeholder="Search ingredients..." 
                       className="pl-8 h-9 rounded-xl bg-background" 
                       value={searchTerm}
                       onChange={e => setSearchTerm(e.target.value)}
                     />
                   </div>
                 </div>
                 
                 <ScrollArea className="flex-1 p-3">
                   <div className="space-y-4">
                      {inventoryCategories.map(cat => {
                         const items = filteredInventory.filter(i => i.categoryId === cat.id);
                         if (items.length === 0) return null;
                         
                         return (
                           <div key={cat.id}>
                             <h4 className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider pl-1">{cat.name}</h4>
                             <div className="grid gap-2">
                                {items.map(item => (
                                  <DraggableIngredient key={item.id} item={item} categoryName={cat.name} />
                                ))}
                             </div>
                           </div>
                         );
                      })}
                   </div>
                 </ScrollArea>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex h-full flex-col items-center justify-center p-8 text-center text-muted-foreground">
            <Soup className="h-12 w-12 opacity-20 mb-4" />
            <p>Select or create a recipe to start editing.</p>
          </div>
        )}
      </Card>
    </div>
  );

  if (isTab) {
    return (
      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        {Content}
        <Dialog open={isCompDialogOpen} onOpenChange={setIsCompDialogOpen}>
            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>{activeCompId ? "Edit Component" : "Add Component"}</DialogTitle>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label>Slot Name</Label>
                  <Input 
                    value={compName} 
                    onChange={e => setCompName(e.target.value)} 
                    placeholder="e.g. Milk Choice"
                  />
                  <p className="text-[11px] text-muted-foreground">Label shown when customizing.</p>
                </div>
                
                <div className="grid gap-2">
                  <Label>Category (Options Pool)</Label>
                  <Select value={compCatId} onValueChange={setCompCatId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select inventory category" />
                    </SelectTrigger>
                    <SelectContent>
                      {inventoryCategories.map(c => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-2">
                  <Label>Default Item</Label>
                  <Select value={compDefaultItemId} onValueChange={setCompDefaultItemId} disabled={!compCatId}>
                    <SelectTrigger>
                      <SelectValue placeholder={compCatId ? "Select default item" : "Choose category first"} />
                    </SelectTrigger>
                    <SelectContent>
                      {availableItemsForDialog.map(i => (
                        <SelectItem key={i.id} value={i.id}>{i.name} ({i.unit})</SelectItem>
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
                  />
                </div>
              </div>
              <DialogFooter>
                <Button onClick={handleSaveComponent} className="rounded-xl">Save</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Drag Overlay */}
          {createPortal(
             <DragOverlay>
               {draggedItem ? (
                 <div className="p-3 rounded-xl border bg-card shadow-xl cursor-grabbing w-48 opacity-90 rotate-3">
                   <div className="flex justify-between items-start">
                     <span className="font-medium text-sm leading-tight">{draggedItem.name}</span>
                   </div>
                 </div>
               ) : null}
             </DragOverlay>,
             document.body
          )}
      </DndContext>
    );
  }

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
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
                      steps={["Create recipe", "Drag ingredients from the right panel", "Set quantity and slot name"]}
                      testid="button-help-recipes"
                    />
                  </div>
                </div>

                <Separator className="my-6" />

                {Content}
              </div>
          </header>

          {/* Component Edit Dialog */}
          <Dialog open={isCompDialogOpen} onOpenChange={setIsCompDialogOpen}>
            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>{activeCompId ? "Edit Component" : "Add Component"}</DialogTitle>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label>Slot Name</Label>
                  <Input 
                    value={compName} 
                    onChange={e => setCompName(e.target.value)} 
                    placeholder="e.g. Milk Choice"
                  />
                  <p className="text-[11px] text-muted-foreground">Label shown when customizing.</p>
                </div>
                
                <div className="grid gap-2">
                  <Label>Category (Options Pool)</Label>
                  <Select value={compCatId} onValueChange={setCompCatId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select inventory category" />
                    </SelectTrigger>
                    <SelectContent>
                      {inventoryCategories.map(c => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-2">
                  <Label>Default Item</Label>
                  <Select value={compDefaultItemId} onValueChange={setCompDefaultItemId} disabled={!compCatId}>
                    <SelectTrigger>
                      <SelectValue placeholder={compCatId ? "Select default item" : "Choose category first"} />
                    </SelectTrigger>
                    <SelectContent>
                      {availableItemsForDialog.map(i => (
                        <SelectItem key={i.id} value={i.id}>{i.name} ({i.unit})</SelectItem>
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
                  />
                </div>
              </div>
              <DialogFooter>
                <Button onClick={handleSaveComponent} className="rounded-xl">Save</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Drag Overlay */}
          {createPortal(
             <DragOverlay>
               {draggedItem ? (
                 <div className="p-3 rounded-xl border bg-card shadow-xl cursor-grabbing w-48 opacity-90 rotate-3">
                   <div className="flex justify-between items-start">
                     <span className="font-medium text-sm leading-tight">{draggedItem.name}</span>
                   </div>
                 </div>
               ) : null}
             </DragOverlay>,
             document.body
          )}
        </AppShell>
      </motion.div>
    </DndContext>
  );
}
