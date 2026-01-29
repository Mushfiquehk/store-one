import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertCircle, ArrowLeft } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen app-shell flex items-center justify-center p-6" data-testid="page-not-found">
      <Card className="w-full max-w-md border bg-card shadow-soft grain">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 font-serif" data-testid="text-404-title">
            <AlertCircle className="h-5 w-5 text-destructive" />
            Page not found
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground" data-testid="text-404-body">
            That page doesn’t exist. Head back to the storefront.
          </p>
          <Link href="/" data-testid="link-home">
            <Button className="w-full rounded-2xl" data-testid="button-back-home">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to CornerPOS
            </Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
