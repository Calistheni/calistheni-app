import { redirect } from "next/navigation";
import { NutritionTracker } from "@/components/nutrition/NutritionTracker";
import { getServerSession } from "@/lib/server-session";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function NutritionPage() {
  const session = await getServerSession();
  if (!session?.user?.id) redirect("/login");

  return (
    <main className="mx-auto w-full max-w-3xl p-4 pb-24 sm:p-6">
      <NutritionTracker />
    </main>
  );
}
