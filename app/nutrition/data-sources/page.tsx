import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";

export default async function NutritionDataSourcesPage() {
  if (!(await auth())?.user) redirect("/login");

  return <main className="mx-auto w-full max-w-2xl space-y-6 p-4 pb-24 sm:p-6">
    <div>
      <Link href="/nutrition/foods" className="text-sm text-muted-foreground underline underline-offset-4">Back to food database</Link>
      <h1 className="mt-3 text-3xl font-bold">Nutrition data sources</h1>
    </div>
    <section className="space-y-2 text-sm text-muted-foreground">
      <h2 className="text-lg font-semibold text-foreground">USDA FoodData Central</h2>
      <p>Generic and branded nutrition records may include data from USDA FoodData Central. USDA data remains subject to its published data terms and source guidance.</p>
    </section>
    <section className="space-y-2 text-sm text-muted-foreground">
      <h2 className="text-lg font-semibold text-foreground">Fineli</h2>
      <p>Generic-food data may include Fineli data from the Finnish Institute for Health and Welfare (THL), licensed under CC BY 4.0. Fineli and THL do not endorse Calistheni.</p>
      <a href="https://fineli.fi/fineli/en/avoin-data" target="_blank" rel="noreferrer" className="underline underline-offset-4">Fineli open-data terms</a>
    </section>
    <section className="space-y-2 text-sm text-muted-foreground">
      <h2 className="text-lg font-semibold text-foreground">Open Food Facts</h2>
      <p>Some packaged-food information comes from Open Food Facts, a community-maintained database. Check product packaging when accuracy is important, especially for allergens and ingredients.</p>
    </section>
    <p className="text-xs text-muted-foreground">Food records retain their original source internally for imports, revisions, freshness checks, and audit history.</p>
  </main>;
}
