import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { FileChartColumn } from "lucide-react";
import { auth } from "@/auth";
import { BackButton } from "@/components/navigation/BackButton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { prisma } from "@/lib/prisma";
import { formatWeekRange } from "@/lib/progress";
import { generatePreviousWeeklyReport } from "@/lib/weekly-progress-reports";
export const metadata: Metadata = { title: "Weekly Reports", robots: { index: false, follow: false } };
export default async function ReportsPage() { const session = await auth(); if (!session?.user) redirect("/login"); await generatePreviousWeeklyReport(session.user.id); const reports = await prisma.weeklyProgressReport.findMany({ where: { userId: session.user.id }, orderBy: { weekStart: "desc" } }); return <main className="mx-auto w-full max-w-3xl p-4 pb-24 sm:p-6"><BackButton fallbackHref="/profile" /><div className="mb-6"><h1 className="flex items-center gap-2 text-3xl font-bold"><FileChartColumn className="text-primary" />Weekly Reports</h1><p className="text-sm text-muted-foreground">Private snapshots of each completed Monday–Sunday week.</p></div>{reports.length === 0 ? <Card><CardContent className="p-6 text-sm text-muted-foreground">No weekly reports yet. Complete a week of activity and your first report will appear here.</CardContent></Card> : <div className="grid gap-3">{reports.map((report) => { const data = report.snapshot as { workoutsCompleted?: number; activeTrainingDays?: number; personalRecords?: number }; return <Link key={report.id} href={`/profile/reports/${report.id}`} className="rounded-xl focus-visible:ring-3 focus-visible:ring-ring/50"><Card className="transition hover:border-primary/40"><CardHeader><div className="flex justify-between gap-3"><h2 className="font-semibold">{formatWeekRange(report.weekStart, report.weekEnd)}</h2>{!report.viewedAt ? <span className="text-xs text-primary">New</span> : null}</div></CardHeader><CardContent className="text-sm text-muted-foreground">{data.workoutsCompleted ?? 0} workouts · {data.activeTrainingDays ?? 0} active days · {data.personalRecords ?? 0} PRs</CardContent></Card></Link>; })}</div>}</main>; }
