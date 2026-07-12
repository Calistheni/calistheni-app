import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { BackButton } from "@/components/navigation/BackButton";
import { FollowButton } from "@/components/social/FollowButton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = {
  title: "Find Users",
  robots: {
    index: false,
    follow: false,
  },
};

type UsersPageProps = {
  searchParams: Promise<{
    q?: string;
  }>;
};

export default async function UsersPage({ searchParams }: UsersPageProps) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const { q } = await searchParams;
  const query = (q ?? "").trim();
  const canSearch = query.length >= 2;
  const users = canSearch
    ? await prisma.user.findMany({
        where: {
          id: {
            not: session.user.id,
          },
          OR: [
            {
              name: {
                contains: query,
                mode: "insensitive",
              },
            },
            {
              email: {
                contains: query,
                mode: "insensitive",
              },
            },
          ],
        },
        orderBy: [
          {
            name: "asc",
          },
          {
            email: "asc",
          },
        ],
        take: 30,
        select: {
          id: true,
          name: true,
          image: true,
          _count: {
            select: {
              followers: true,
            },
          },
        },
      })
    : [];
  const follows = users.length
    ? await prisma.userFollow.findMany({
        where: {
          followerId: session.user.id,
          followingId: {
            in: users.map((user) => user.id),
          },
        },
        select: {
          followingId: true,
        },
      })
    : [];
  const followingIds = new Set(follows.map((follow) => follow.followingId));

  return (
    <main className="mx-auto w-full max-w-4xl p-4 sm:p-6 lg:p-8">
      <BackButton fallbackHref="/feed" />
      <div className="mb-6 space-y-2">
        <h1 className="text-3xl font-bold">Find Users</h1>
        <p className="text-sm text-muted-foreground">
          Search for athletes, open their public profile, and follow them to see
          their public workouts in your feed.
        </p>
      </div>

      <Card className="mb-6">
        <CardContent className="p-4 sm:p-6">
          <form action="/users" className="flex flex-col gap-3 sm:flex-row">
            <div className="flex-1 space-y-2">
              <label htmlFor="user-search" className="text-sm font-medium">
                Search users
              </label>
              <Input
                id="user-search"
                name="q"
                type="search"
                defaultValue={query}
                placeholder="Search by name or email"
              />
            </div>
            <div className="flex items-end gap-2">
              <Button type="submit">Search</Button>
              {query ? (
                <Button asChild variant="outline">
                  <Link href="/users">Clear</Link>
                </Button>
              ) : null}
            </div>
          </form>
        </CardContent>
      </Card>

      {!query ? (
        <Card>
          <CardContent className="space-y-2 p-6 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">
              Find athletes to follow
            </p>
            <p>
              Type at least two characters to search profiles and start filling
              your workout feed.
            </p>
          </CardContent>
        </Card>
      ) : !canSearch ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            Keep typing. Search needs at least two characters.
          </CardContent>
        </Card>
      ) : users.length === 0 ? (
        <Card>
          <CardContent className="space-y-2 p-6 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">
              No users found for {query}.
            </p>
            <p>Try a different spelling or a shorter search.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {users.map((user) => (
            <Card key={user.id}>
              <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <Link
                  href={`/users/${user.id}`}
                  className="flex min-w-0 items-center gap-3 rounded-md outline-none transition hover:opacity-80 focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  {user.image ? (
                    <Image
                      src={user.image}
                      alt=""
                      width={56}
                      height={56}
                      unoptimized
                      className="h-14 w-14 rounded-full bg-muted object-cover"
                    />
                  ) : (
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-muted text-lg font-bold">
                      {(user.name ?? "U").slice(0, 1)}
                    </div>
                  )}
                  <div className="min-w-0">
                    <h2 className="truncate text-lg font-semibold">
                      {user.name ?? "Calistheni athlete"}
                    </h2>
                    <Badge variant="outline">
                      {user._count.followers} followers
                    </Badge>
                  </div>
                </Link>

                <div className="flex flex-wrap gap-2 sm:justify-end">
                  <Button asChild variant="outline">
                    <Link href={`/users/${user.id}`}>View Profile</Link>
                  </Button>
                  <FollowButton
                    userId={user.id}
                    initialFollowing={followingIds.has(user.id)}
                  />
                </div>
              </CardHeader>
            </Card>
          ))}
        </div>
      )}
    </main>
  );
}
