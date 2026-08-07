import { redirect } from "next/navigation"; import { auth } from "@/auth"; import { NutritionTracker } from "@/components/nutrition/NutritionTracker";
export default async function NutritionPage() { if (!(await auth())?.user) redirect("/login"); return <main className="mx-auto w-full max-w-3xl p-4 pb-24 sm:p-6"><NutritionTracker /></main>; }
