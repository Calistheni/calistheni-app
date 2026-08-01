import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { NutritionFoodSearch } from "@/components/nutrition/NutritionFoodSearch";
export default async function NutritionFoodsPage() {
  if (!(await auth())?.user) redirect("/login");

  return <main className="mx-auto w-full max-w-4xl p-4 pb-24 sm:p-6">
    <h1 className="text-3xl font-bold">Food database</h1>
    <p className="mt-1 text-sm text-muted-foreground">Search saved foods and additional food results when needed.</p>
    <NutritionFoodSearch />
    <p className="mt-8 text-center text-xs text-muted-foreground"><Link className="underline underline-offset-4" href="/nutrition/data-sources">Nutrition data sources and terms</Link></p>
  </main>;
}
