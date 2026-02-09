import { motion } from "framer-motion";
import AppShell from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useStore } from "@/lib/store";
import { useState } from "react";
import { Settings, Percent } from "lucide-react";

export default function SettingsPage() {
  const [taxRate, setTaxRate] = useState(8.25);

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
                    />
                    <Percent className="absolute right-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </AppShell>
    </motion.div>
  );
}
