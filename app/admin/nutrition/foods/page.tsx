import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { NutritionContributionsAdmin } from "@/components/admin/NutritionContributionsAdmin";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { getFoodContributionHistory } from "@/lib/nutrition/admin-food-contributions";

export const metadata: Metadata = { title: "Food Contributions", robots: { index: false, follow: false } };
export default async function AdminNutritionFoodsPage() {
  if (!(await isAdminAuthenticated())) redirect("/admin/login");
  const initialHistory = await getFoodContributionHistory();
  return <main className="mx-auto max-w-4xl space-y-6 px-4 py-8"><div><h1 className="text-2xl font-bold">Food contributions</h1><p className="text-sm text-muted-foreground">Review community-submitted foods and moderation history.</p></div><NutritionContributionsAdmin initialHistory={initialHistory} /></main>;
}
