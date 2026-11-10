import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { getAuthEmailOutboxStatus } from "@/lib/auth/email-outbox";
import { isAdminAuthenticated } from "@/lib/admin-auth";

export const metadata: Metadata = {
  title: "Authentication Email Outbox",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

function formatTimestamp(value: string | null) {
  if (!value) return "None";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(value)) + " UTC";
}

export default async function AuthenticationEmailOutboxPage() {
  if (!(await isAdminAuthenticated())) redirect("/admin/login");
  const status = await getAuthEmailOutboxStatus();
  const healthStyle = status.health === "CRITICAL"
    ? "border-destructive/50 text-destructive"
    : status.health === "WARNING"
      ? "border-amber-500/50 text-amber-700 dark:text-amber-300"
      : "border-emerald-600/40 text-emerald-700 dark:text-emerald-300";
  const metrics = [
    ["Pending", status.pending],
    ["Awaiting retry", status.retrying],
    ["Permanent failures", status.permanentlyFailed],
    ["Active worker leases", status.activeLeases],
    ["Expired leases", status.expiredLeases],
  ] as const;

  return (
    <main className="mx-auto w-full max-w-5xl space-y-6 p-4 sm:p-6 lg:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Authentication email outbox</h1>
          <p className="mt-1 text-sm text-muted-foreground">Aggregate queue health only. Recipient addresses and action tokens are not displayed.</p>
        </div>
        <Button asChild variant="outline"><Link href="/admin">Back to admin</Link></Button>
      </div>

      <Card className={healthStyle}>
        <CardHeader><div className="flex items-center gap-3"><h2 className="text-lg font-semibold">Queue status</h2><Badge variant={status.health === "HEALTHY" ? "secondary" : "destructive"}>{status.health}</Badge></div></CardHeader>
        <CardContent className="grid gap-4 text-sm sm:grid-cols-2">
          <p>Oldest pending item: <span className="font-medium">{formatTimestamp(status.oldestPendingAt)}</span></p>
          <p>Age of oldest pending item: <span className="font-medium">{status.oldestPendingAgeSeconds === null ? "—" : `${Math.floor(status.oldestPendingAgeSeconds / 60)} minutes`}</span></p>
        </CardContent>
      </Card>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3" aria-label="Authentication email queue metrics">
        {metrics.map(([label, value]) => <Card key={label}><CardContent className="p-4"><p className="min-h-10 text-xs text-muted-foreground">{label}</p><p className="text-2xl font-semibold tabular-nums">{value.toLocaleString()}</p></CardContent></Card>)}
      </section>

      <Card>
        <CardHeader><h2 className="text-lg font-semibold">Operator response</h2></CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>Check the scheduled function logs for worker invocation failures. Permanent delivery failures require checking the selected server-side email provider and the safe failure category before any manual recovery.</p>
          <p>Do not requeue consumed or expired actions, and do not copy tokens or recipient addresses into logs or support messages.</p>
          <p>This dashboard is not a proactive alert. Configure Vercel runtime-log alerting or another approved operator notification path before relying on unattended production processing.</p>
        </CardContent>
      </Card>
    </main>
  );
}
