import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { FoodContributionStatus, FoodType } from "@/lib/generated/prisma/client";
import { NutritionContributionsAdmin } from "@/components/admin/NutritionContributionsAdmin";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Pending Food Contributions", robots: { index: false, follow: false } };
export default async function AdminNutritionFoodsPage() {
  if (!(await isAdminAuthenticated())) redirect("/admin/login");
  const foods = await prisma.food.findMany({ where: { type: FoodType.USER_CREATED, contributionStatus: FoodContributionStatus.PENDING }, include: { aliases: { select: { name: true } }, servings: { select: { name: true, grams: true } }, sourceRecords: { orderBy: { createdAt: "desc" }, take: 1 }, createdByUser: { select: { name: true, email: true } } }, orderBy: { createdAt: "asc" } });
  return <main className="mx-auto max-w-3xl space-y-6 px-4 py-8"><div><h1 className="text-2xl font-bold">Pending food contributions</h1><p className="text-sm text-muted-foreground">AI-assisted community foods stay private until approved.</p></div><NutritionContributionsAdmin initialFoods={foods as never} /></main>;
}
