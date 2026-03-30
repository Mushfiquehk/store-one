import { useState } from "react";
import { motion } from "framer-motion";
import AppShell from "@/components/app-shell";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ClipboardList, Fuel, Package, SlidersHorizontal } from "lucide-react";

import MenuPageContent from "./menu";
import RecipesPageContent from "./recipes";
import InventoryPageContent from "./inventory";
import ModifiersPageContent from "./modifiers";

export default function ProductsPage({ embedded = false }: { embedded?: boolean }) {
  const [activeTab, setActiveTab] = useState("menu");

  const content = (
    <div className="flex flex-col gap-6">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <div className="flex items-center justify-between mb-6">
           <TabsList className="bg-card border shadow-sm rounded-xl h-12 p-1 w-fit">
            <TabsTrigger value="menu" className="rounded-lg h-full px-4">
              <ClipboardList className="h-4 w-4 mr-2" /> Station Menu
            </TabsTrigger>
            <TabsTrigger value="modifiers" className="rounded-lg h-full px-4" data-testid="tab-modifiers">
              <SlidersHorizontal className="h-4 w-4 mr-2" /> Modifiers
            </TabsTrigger>
            <TabsTrigger value="recipes" className="rounded-lg h-full px-4">
              <Fuel className="h-4 w-4 mr-2" /> Bill of Materials
            </TabsTrigger>
            <TabsTrigger value="inventory" className="rounded-lg h-full px-4">
              <Package className="h-4 w-4 mr-2" /> Bulk Inventory
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="menu" className="mt-0 space-y-6">
           <MenuPageContent isTab={true} />
        </TabsContent>

        <TabsContent value="modifiers" className="mt-0 space-y-6">
           <ModifiersPageContent isTab={true} />
        </TabsContent>

        <TabsContent value="recipes" className="mt-0 space-y-6">
           <RecipesPageContent isTab={true} />
        </TabsContent>

        <TabsContent value="inventory" className="mt-0 space-y-6">
           <InventoryPageContent isTab={true} />
        </TabsContent>
      </Tabs>
    </div>
  );

  if (embedded) return content;

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
      <AppShell title="Products">
        {content}
      </AppShell>
    </motion.div>
  );
}
