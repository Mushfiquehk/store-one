import { useState } from "react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { Database, ArrowRight, CheckCircle2, RefreshCw } from "lucide-react";
import AppShell from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { seedDemoData } from "@/lib/seed-data";

export default function DemoPage() {
  const { toast } = useToast();
  const [seeding, setSeeding] = useState(false);
  const [seeded, setSeeded] = useState(false);

  async function handleSeed() {
    setSeeding(true);
    try {
      await seedDemoData();
      setSeeded(true);
      toast({
        title: "Demo data seeded",
        description: "Sample products, inventory, and modifiers have been loaded.",
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
                Seed Demo Data
              </CardTitle>
              <CardDescription className="mt-2" data-testid="text-demo-description">
                Populate the POS with sample products to explore the system. This includes
                simple retail items, multi-variant products, prepared items with modifiers,
                and full inventory tracking with bill-of-materials.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col items-center gap-4 pt-4 pb-6">
              <ul className="text-sm text-muted-foreground space-y-1.5 w-full">
                <li className="flex items-start gap-2">
                  <span className="text-primary mt-0.5">•</span>
                  <span>Water Bottle &amp; Candy Bar — simple retail items</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary mt-0.5">•</span>
                  <span>T-Shirt — multi-variant (S / M / L / XL)</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary mt-0.5">•</span>
                  <span>Cappuccino — 3 sizes with milk modifiers &amp; BOM</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary mt-0.5">•</span>
                  <span>Club Sandwich — bread choice modifier &amp; ingredient tracking</span>
                </li>
              </ul>

              <Button
                className="w-full rounded-2xl h-12 text-lg shadow-lg hover-lift mt-2"
                onClick={handleSeed}
                disabled={seeding}
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
                    Re-seed Demo Data
                  </>
                ) : (
                  "Seed Demo Data"
                )}
              </Button>

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
