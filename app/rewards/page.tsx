import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@/auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = {
  title: "Rewards",
  description:
    "Preview the future Calistheni Pro rewards program and Calis Points.",
  alternates: {
    canonical: "/rewards",
  },
};

export default async function RewardsPage() {
  const session = await auth();
  const [user, rewards] = await Promise.all([
    session?.user?.id
      ? prisma.user.findUnique({
          where: {
            id: session.user.id,
          },
          select: {
            rewardPoints: true,
          },
        })
      : null,
    prisma.reward.findMany({
      where: {
        active: true,
      },
      orderBy: [{ pointsCost: "asc" }, { title: "asc" }],
      take: 6,
    }),
  ]);
  const rewardPoints = user?.rewardPoints ?? 0;

  return (
    <main className="mx-auto w-full max-w-6xl p-4 sm:p-6 lg:p-8">
      <section className="mb-6 rounded-3xl border bg-card p-6 sm:p-8">
        <Badge className="mb-4" variant="secondary">
          Coming Soon
        </Badge>
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-center">
          <div className="space-y-4">
            <h1 className="text-3xl font-bold sm:text-4xl">
              Calis Points are warming up.
            </h1>
            <p className="max-w-2xl text-sm text-muted-foreground sm:text-base">
              Rewards will eventually let Pro members earn points from approved
              community contributions and training milestones. Voucher
              redemption is not live yet, but the foundation is ready.
            </p>
            {session?.user ? (
              <p className="rounded-xl border bg-muted/30 p-4 text-sm text-muted-foreground">
                Become a Pro member to start earning Calis Points.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                <Button asChild>
                  <Link href="/login">Login to View Points</Link>
                </Button>
                <Button asChild variant="outline">
                  <Link href="/">Explore Parks</Link>
                </Button>
              </div>
            )}
          </div>

          <Card>
            <CardContent className="p-6">
              <p className="text-sm text-muted-foreground">Current points</p>
              <p className="mt-2 text-4xl font-bold">
                {rewardPoints.toLocaleString()}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Points are visible now, but earning rules are not active yet.
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Card>
          <CardHeader>
            <h2 className="text-2xl font-bold">Rewards Preview</h2>
            <p className="text-sm text-muted-foreground">
              Demo rewards are placeholders for launch planning.
            </p>
          </CardHeader>
          <CardContent>
            {rewards.length === 0 ? (
              <p className="rounded-xl border p-4 text-sm text-muted-foreground">
                Rewards are being prepared. Check back soon.
              </p>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {rewards.map((reward) => (
                  <div key={reward.id} className="rounded-xl border p-4">
                    {reward.imageUrl ? (
                      <div
                        aria-label={reward.title}
                        className="mb-3 aspect-video rounded-lg bg-muted bg-cover bg-center"
                        role="img"
                        style={{
                          backgroundImage: `url("${reward.imageUrl}")`,
                        }}
                      />
                    ) : null}
                    <div className="space-y-2">
                      <Badge variant="outline">{reward.partnerName}</Badge>
                      <h3 className="font-semibold">{reward.title}</h3>
                      <p className="text-sm text-muted-foreground">
                        {reward.description}
                      </p>
                      <p className="text-sm font-medium">
                        {reward.pointsCost.toLocaleString()} points
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="text-2xl font-bold">Pro Benefits</h2>
            <p className="text-sm text-muted-foreground">
              Future rewards are planned for Pro members only.
            </p>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>Earn Calis Points from eligible activity once rules launch.</p>
            <p>Unlock partner reward access when redemption goes live.</p>
            <p>Support better park data, workouts, and community tooling.</p>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
