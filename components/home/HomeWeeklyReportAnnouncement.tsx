import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { generatePreviousWeeklyReport } from "@/lib/weekly-progress-reports";

/** Optional report generation stays off Home's critical server-render path. */
export async function HomeWeeklyReportAnnouncement({
  userId,
}: {
  userId: string;
}) {
  const generated = await generatePreviousWeeklyReport(userId);
  if (!generated.created || generated.report.announcementDismissedAt)
    return null;

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-semibold">Your weekly report is ready</p>
          <p className="text-sm text-muted-foreground">
            A private snapshot of your completed week is saved in Progress.
          </p>
        </div>
        <Button asChild>
          <Link href={`/profile/reports/${generated.report.id}`}>
            View report
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
