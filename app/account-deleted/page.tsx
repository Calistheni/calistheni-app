import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export default function AccountDeletedPage() {
  return (
    <main className="mx-auto flex min-h-[70vh] w-full max-w-xl items-center px-4 py-12">
      <Card className="w-full">
        <CardHeader className="items-center text-center">
          <CheckCircle2 className="size-12 text-emerald-600" aria-hidden="true" />
          <h1 className="text-2xl font-bold">Account deactivated</h1>
        </CardHeader>
        <CardContent className="space-y-4 text-center text-sm text-muted-foreground">
          <p>Your Calistheni account is deactivated and you have been signed out. Personal-data cleanup may continue for up to 30 days; this page does not mean that cleanup is already complete.</p>
          <p>Your website or Apple subscriptions are not cancelled automatically. Manage them in the relevant billing settings to avoid future charges.</p>
          <Button asChild><Link href="/">Return to Calistheni</Link></Button>
        </CardContent>
      </Card>
    </main>
  );
}
