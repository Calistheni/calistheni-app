import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { NutritionTracker } from "@/components/nutrition/NutritionTracker";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function NutritionPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  return (
    <main className="mx-auto w-full max-w-3xl p-4 pb-24 sm:p-6">
      <NutritionTracker />
    </main>
  );
}
