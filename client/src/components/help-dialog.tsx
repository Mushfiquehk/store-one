import { HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export default function HelpDialog({
  title,
  summary,
  steps,
  testid,
}: {
  title: string;
  summary?: string;
  steps: string[];
  testid: string;
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="secondary" className="rounded-2xl bg-background/60" data-testid={testid}>
          <HelpCircle className="mr-2 h-4 w-4" />
          Help
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle data-testid={`${testid}-title`}>{title}</DialogTitle>
          {summary ? <DialogDescription data-testid={`${testid}-summary`}>{summary}</DialogDescription> : null}
        </DialogHeader>

        <div className="rounded-2xl border bg-background/50 p-4">
          <ol className="grid gap-2 text-sm" data-testid={`${testid}-steps`}>
            {steps.map((s, idx) => (
              <li key={idx} className="flex gap-3" data-testid={`${testid}-step-${idx + 1}`}>
                <span className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
                  {idx + 1}
                </span>
                <span className="text-muted-foreground">{s}</span>
              </li>
            ))}
          </ol>
        </div>
      </DialogContent>
    </Dialog>
  );
}
