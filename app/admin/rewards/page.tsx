import type { Metadata } from "next";
import { redirect } from "next/navigation";
import {
  RewardsAdminClient,
  type AdminReward,
} from "@/components/admin/rewards/RewardsAdminClient";
import { BackButton } from "@/components/navigation/BackButton";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = {
  title: "Admin Rewards",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function AdminRewardsPage() {
  if (!(await isAdminAuthenticated())) {
    redirect("/admin/login");
  }

  const rewards = await prisma.reward.findMany({
    orderBy: [{ active: "desc" }, { pointsCost: "asc" }, { title: "asc" }],
  });

  return (
    <main className="mx-auto w-full max-w-7xl p-4 sm:p-6 lg:p-8">
      <BackButton fallbackHref="/admin" />
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Rewards</h1>
        <p className="text-sm text-muted-foreground">
          Prepare demo rewards for the future Calistheni Pro program.
        </p>
      </div>

      <RewardsAdminClient rewards={rewards as AdminReward[]} />
    </main>
  );
}
