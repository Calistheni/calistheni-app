import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ModerationQueue } from "@/components/admin/ModerationQueue";
import { BackButton } from "@/components/navigation/BackButton";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { getAdminModerationReports } from "@/lib/moderation-admin";

export const metadata: Metadata = { title: "Moderation", robots: { index: false, follow: false } };

export default async function AdminModerationPage() {
  if (!(await isAdminAuthenticated())) redirect("/admin/login");
  return <main className="mx-auto w-full max-w-4xl space-y-5 p-4 pb-24 sm:p-6"><BackButton fallbackHref="/admin" label="Admin" /><div><h1 className="text-3xl font-bold">Community Moderation</h1><p className="text-sm text-muted-foreground">Review confidential user reports, hide violating content, and apply account restrictions.</p></div><ModerationQueue initialReports={await getAdminModerationReports()} /></main>;
}
