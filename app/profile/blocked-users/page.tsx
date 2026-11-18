import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { BackButton } from "@/components/navigation/BackButton";
import { BlockedUsersList } from "@/components/profile/BlockedUsersList";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "@/lib/server-session";

export const metadata: Metadata = { title: "Blocked Users", robots: { index: false, follow: false } };

export default async function BlockedUsersPage() {
  const session = await getServerSession();
  if (!session?.user?.id) redirect("/login");
  const blocks = await prisma.userBlock.findMany({
    where: { blockerId: session.user.id },
    orderBy: { createdAt: "desc" },
    select: { blocked: { select: { id: true, name: true, username: true } } },
  });
  return <main className="mx-auto w-full max-w-2xl p-4 pb-24 sm:p-6"><BackButton fallbackHref="/profile" /><h1 className="text-3xl font-bold">Blocked Users</h1><p className="mb-6 mt-2 text-sm text-muted-foreground">Blocked users cannot follow you or interact with your public workouts, and you will not see each other in community surfaces.</p><BlockedUsersList initialUsers={blocks.map(({ blocked }) => ({ id: blocked.id, label: blocked.name ?? blocked.username ?? "Calistheni athlete" }))} /></main>;
}
