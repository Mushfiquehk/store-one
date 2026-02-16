import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import AppShell from "@/components/app-shell";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ClipboardList, Soup, Package } from "lucide-react";

// Import existing pages as components
// We'll need to modify them slightly to be used as components or just render them here
import MenuPageContent from "./menu";
import RecipesPageContent from "./recipes";
import InventoryPageContent from "./inventory";

export default function ProductsPage() {
  const [activeTab, setActiveTab] = useState("menu");

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
      <AppShell title="Products">
        <div className="flex flex-col gap-6">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <div className="flex items-center justify-between mb-6">
               <TabsList className="bg-card border shadow-sm rounded-xl h-12 p-1 w-fit">
                <TabsTrigger value="menu" className="rounded-lg h-full px-4">
                  <ClipboardList className="h-4 w-4 mr-2" /> Menu
                </TabsTrigger>
                <TabsTrigger value="recipes" className="rounded-lg h-full px-4">
                  <Soup className="h-4 w-4 mr-2" /> Recipes
                </TabsTrigger>
                <TabsTrigger value="inventory" className="rounded-lg h-full px-4">
                  <Package className="h-4 w-4 mr-2" /> Ingredients
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="menu" className="mt-0 space-y-6">
               <MenuPageContent isTab={true} />
            </TabsContent>
            
            <TabsContent value="recipes" className="mt-0 space-y-6">
               <RecipesPageContent isTab={true} />
            </TabsContent>

            <TabsContent value="inventory" className="mt-0 space-y-6">
               <InventoryPageContent isTab={true} />
            </TabsContent>
          </Tabs>
        </div>
      </AppShell>
    </motion.div>
  );
}
