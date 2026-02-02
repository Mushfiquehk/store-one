import { motion } from "framer-motion";
import { ArrowRight, ClipboardList, LayoutGrid, Package, Soup } from "lucide-react";
import { Link } from "wouter";
import AppShell from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

export default function OnboardingPage() {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
      <AppShell title="Start">
        <header className="relative overflow-hidden rounded-3xl border bg-card shadow-soft grain">
            <div className="p-6 sm:p-10">
              <p className="text-sm font-medium text-muted-foreground" data-testid="text-tagline">
                Getting started
              </p>
              <h1 className="mt-2 font-serif text-3xl tracking-[-0.02em] sm:text-4xl" data-testid="text-title">
                Set up your shop in 5 steps
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground" data-testid="text-subtitle">
                This app is designed for mom-and-pop shops: minimal setup, clear steps, and fast daily use.
              </p>

              <Separator className="my-6" />

              <div className="grid gap-4">
                <StepCard
                  n={1}
                  title="Add your inventory items"
                  body="Start with the real things you count (cups, beans, milk, napkins). Keep IDs simple." 
                  icon={<Package className="h-4 w-4" />}
                  href="/inventory"
                  cta="Go to Inventory"
                  testid="stepcard-inventory"
                />
                <StepCard
                  n={2}
                  title="Create recipes using inventory"
                  body="A recipe is what gets used when you sell one menu item (e.g., latte uses beans + milk + cup)." 
                  icon={<Soup className="h-4 w-4" />}
                  href="/recipes"
                  cta="Go to Recipes"
                  testid="stepcard-recipes"
                />
                <StepCard
                  n={3}
                  title="Add menu items"
                  body="Create what customers buy (coffee, latte, muffin) and set price and category." 
                  icon={<ClipboardList className="h-4 w-4" />}
                  href="/menu"
                  cta="Go to Menu"
                  testid="stepcard-menu"
                />
                <StepCard
                  n={4}
                  title="Link recipes to menu items"
                  body="Linking is what makes inventory deduct automatically when you record a sale." 
                  icon={<ArrowRight className="h-4 w-4" />}
                  href="/menu"
                  cta="Link recipes"
                  testid="stepcard-link"
                />
                <StepCard
                  n={5}
                  title="Record a sale"
                  body="Use the POS page daily. It will block sales if a recipe is missing or inventory is too low." 
                  icon={<LayoutGrid className="h-4 w-4" />}
                  href="/pos"
                  cta="Open POS"
                  testid="stepcard-pos"
                />
              </div>

              <div className="mt-6 flex flex-col gap-2 sm:flex-row">
                <Link href="/pos" data-testid="link-start-pos">
                  <Button className="rounded-2xl" data-testid="button-start-pos">
                    Start at POS
                  </Button>
                </Link>
                <Link href="/reports" data-testid="link-open-reports">
                  <Button variant="secondary" className="rounded-2xl" data-testid="button-open-reports">
                    Reports + Export
                  </Button>
                </Link>
              </div>

              <p className="mt-4 text-xs text-muted-foreground" data-testid="text-prototype-note">
                Prototype: each page currently uses local demo data. Next step is to centralize the shared data model.
              </p>
            </div>
        </header>
      </AppShell>
    </motion.div>
  );
}

function StepCard({
  n,
  title,
  body,
  icon,
  href,
  cta,
  testid,
}: {
  n: number;
  title: string;
  body: string;
  icon: React.ReactNode;
  href: string;
  cta: string;
  testid: string;
}) {
  return (
    <Card className="border bg-background/60 shadow-sm hover-lift" data-testid={testid}>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between gap-3" data-testid={`${testid}-title`}>
          <span className="flex items-center gap-2 font-serif">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary" data-testid={`${testid}-n`}>
              {n}
            </span>
            {title}
          </span>
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 text-primary" data-testid={`${testid}-icon`}>
            {icon}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground" data-testid={`${testid}-body`}>
          {body}
        </p>
        <div className="mt-3">
          <Link href={href} data-testid={`${testid}-link`}>
            <Button variant="secondary" className="rounded-2xl" data-testid={`${testid}-button`}>
              {cta}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
