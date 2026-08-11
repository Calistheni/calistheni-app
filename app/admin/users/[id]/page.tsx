import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { BackButton } from "@/components/navigation/BackButton";
import { AdminUserInsight } from "@/components/admin/AdminUserInsight";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { getAdminUserInsight } from "@/lib/admin-user-insights";

export const metadata: Metadata = { title: "User insight", robots: { index: false, follow: false } };
export default async function AdminUserInsightPage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdminAuthenticated())) redirect("/admin/login");
  const insight = await getAdminUserInsight((await params).id);
  if (!insight) notFound();
  return <main className="mx-auto w-full max-w-6xl space-y-5 p-4 pb-24 sm:p-6 lg:p-8"><BackButton fallbackHref="/admin/users" label="Users" /><AdminUserInsight insight={insight} /></main>;
}
