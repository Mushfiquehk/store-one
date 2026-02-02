import { motion } from "framer-motion";
import { ArrowRight, ClipboardList, LayoutGrid, Package, Soup } from "lucide-react";
import { Link } from "wouter";
import AppShell from "@/components/app-shell";
import HelpDialog from "@/components/help-dialog";
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
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div className="min-w-0">
                  <h1 className="mt-2 font-serif text-3xl tracking-[-0.02em] sm:text-4xl" data-testid="text-title">
                    Setup
                  </h1>
                  <p className="mt-2 max-w-2xl text-sm text-muted-foreground" data-testid="text-subtitle">
                    Quick checklist.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <HelpDialog
                    title="Setup"
                    summary="Set up once. Use POS daily."
                    steps={["Add inventory", "Create recipes", "Create menu", "Link recipes", "Open POS"]}
                    testid="button-help-setup"
                  />
                </div>
              </div>

              <Separator className="my-6" />

              <div className="grid gap-4">
                <StepCard
                  n={1}
                  title="Inventory"
                  body="Add items you count."
                  icon={<Package className="h-4 w-4" />}
                  href="/inventory"
                  cta="Open"
                  testid="stepcard-inventory"
                />
                <StepCard
                  n={2}
                  title="Recipes"
                  body="Set ingredients per sale."
                  icon={<Soup className="h-4 w-4" />}
                  href="/recipes"
                  cta="Open"
                  testid="stepcard-recipes"
                />
                <StepCard
                  n={3}
                  title="Menu"
                  body="Add items customers buy."
                  icon={<ClipboardList className="h-4 w-4" />}
                  href="/menu"
                  cta="Open"
                  testid="stepcard-menu"
                />
                <StepCard
                  n={4}
                  title="Link recipes"
                  body="Connect Menu \u2192 Recipe."
                  icon={<ArrowRight className="h-4 w-4" />}
                  href="/menu"
                  cta="Open"
                  testid="stepcard-link"
                />
                <StepCard
                  n={5}
                  title="POS"
                  body="Ring sales. Inventory deducts."
                  icon={<LayoutGrid className="h-4 w-4" />}
                  href="/"
                  cta="Open"
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
                Demo only.
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
