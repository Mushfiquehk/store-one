import { useState } from "react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { Database, ArrowRight, CheckCircle2, RefreshCw, Trash2 } from "lucide-react";
import AppShell from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { seedDemoData, clearDemoData } from "@/lib/seed-data";

export default function DemoPage() {
  const { toast } = useToast();
  const [seeding, setSeeding] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [seeded, setSeeded] = useState(false);

  async function handleSeed() {
    setSeeding(true);
    try {
      await seedDemoData();
      setSeeded(true);
      toast({
        title: "Demo data seeded",
        description: "Coffee shop products, ingredients, employees, and 15 days of orders loaded.",
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "An unexpected error occurred.";
      toast({
        title: "Seeding failed",
        description: message,
        variant: "destructive",
      });
    } finally {
      setSeeding(false);
    }
  }

  async function handleClear() {
    setClearing(true);
    try {
      await clearDemoData();
      setSeeded(false);
      toast({
        title: "Demo data cleared",
        description: "All demo records have been removed. User-created data is untouched.",
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "An unexpected error occurred.";
      toast({
        title: "Clear failed",
        description: message,
        variant: "destructive",
      });
    } finally {
      setClearing(false);
    }
  }

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
      <AppShell title="Demo">
        <div className="max-w-lg mx-auto mt-12">
          <Card className="border bg-card shadow-soft">
            <CardHeader className="text-center pb-2">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                <Database className="h-6 w-6 text-primary" />
              </div>
              <CardTitle className="font-serif text-2xl" data-testid="text-demo-title">
                Demo Data
              </CardTitle>
              <CardDescription className="mt-2" data-testid="text-demo-description">
                Populate the POS with a full coffee shop setup to explore every feature.
                Includes espresso drinks, specialty lattes, bakery items, sandwiches,
                retail products, and 15 days of order history.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col items-center gap-4 pt-4 pb-6">
              <ul className="text-sm text-muted-foreground space-y-1.5 w-full">
                <li className="flex items-start gap-2">
                  <span className="text-primary mt-0.5">•</span>
                  <span>Espresso drinks (Latte, Cappuccino, Americano, Mocha) — S/M/L with sub-recipe chaining</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary mt-0.5">•</span>
                  <span>Specialty (Matcha Latte, Chai Latte, Hot Chocolate) — milk modifiers &amp; BOM scaling</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary mt-0.5">•</span>
                  <span>Cold drinks (Iced Latte, Cold Brew) — optional splash-of-milk modifier</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary mt-0.5">•</span>
                  <span>Bakery (Muffin, Cookie, Croissant, Bagels) — ingredient recipes</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary mt-0.5">•</span>
                  <span>Sandwiches (Turkey Club, Ham &amp; Swiss, Avocado Toast) — bread choice modifier</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary mt-0.5">•</span>
                  <span>Retail (Bottled Water, Coffee Beans 12oz/1lb, Travel Mug) — direct inventory</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary mt-0.5">•</span>
                  <span>36 ingredients with low-stock thresholds &amp; purchase prices</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary mt-0.5">•</span>
                  <span>4 employees with 15 days of time punches</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary mt-0.5">•</span>
                  <span>~350 orders across 15 days with varied products &amp; modifiers</span>
                </li>
              </ul>

              <div className="flex gap-3 w-full mt-2">
                <Button
                  className="flex-1 rounded-2xl h-12 text-lg shadow-lg hover-lift"
                  onClick={handleSeed}
                  disabled={seeding || clearing}
                  data-testid="button-seed-demo"
                >
                  {seeding ? (
                    <>
                      <RefreshCw className="h-5 w-5 mr-2 animate-spin" />
                      Seeding…
                    </>
                  ) : seeded ? (
                    <>
                      <CheckCircle2 className="h-5 w-5 mr-2" />
                      Re-seed
                    </>
                  ) : (
                    "Seed Demo Data"
                  )}
                </Button>
                <Button
                  variant="outline"
                  className="rounded-2xl h-12 px-5"
                  onClick={handleClear}
                  disabled={seeding || clearing}
                  data-testid="button-clear-demo"
                >
                  {clearing ? (
                    <RefreshCw className="h-5 w-5 animate-spin" />
                  ) : (
                    <>
                      <Trash2 className="h-4 w-4 mr-2" />
                      Clear
                    </>
                  )}
                </Button>
              </div>

              {seeded && (
                <Link href="/">
                  <Button variant="outline" className="w-full rounded-2xl h-10 gap-2" data-testid="link-go-to-pos">
                    Go to POS
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
              )}
            </CardContent>
          </Card>
        </div>
      </AppShell>
    </motion.div>
  );
}
