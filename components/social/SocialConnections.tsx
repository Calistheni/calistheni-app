"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { FollowButton } from "@/components/social/FollowButton";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";

type ConnectionType = "followers" | "following";
type ConnectionUser = {
  id: string;
  name: string | null;
  image: string | null;
  isCurrentUser: boolean;
  isFollowedByCurrentUser: boolean;
};

export function SocialConnections({
  profileUserId,
  viewerUserId,
  initialFollowerCount,
  initialFollowingCount,
}: {
  profileUserId: string;
  viewerUserId: string | null;
  initialFollowerCount: number;
  initialFollowingCount: number;
}) {
  const [followerCount, setFollowerCount] = useState(initialFollowerCount);
  const [followingCount, setFollowingCount] = useState(initialFollowingCount);
  const [activeType, setActiveType] = useState<ConnectionType | null>(null);
  const [users, setUsers] = useState<ConnectionUser[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (type: ConnectionType, nextCursor?: string) => {
      setIsLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({ type });
        if (nextCursor) params.set("cursor", nextCursor);
        const response = await fetch(
          `/api/users/${profileUserId}/connections?${params}`
        );
        if (!response.ok) throw new Error("Unable to load this list.");
        const payload = (await response.json()) as {
          users: ConnectionUser[];
          nextCursor: string | null;
        };
        setUsers((current) =>
          nextCursor ? [...current, ...payload.users] : payload.users
        );
        setCursor(payload.nextCursor);
      } catch {
        setError("We couldn't load this list. Please try again.");
      } finally {
        setIsLoading(false);
      }
    },
    [profileUserId]
  );

  useEffect(() => {
    function onFollowChanged(event: Event) {
      const detail = (
        event as CustomEvent<{
          userId: string;
          previousFollowing: boolean;
          following: boolean;
          followerCount?: number;
          followingCount?: number;
          optimistic?: boolean;
        }>
      ).detail;

      if (detail.userId === profileUserId) {
        setFollowerCount((count) =>
          detail.followerCount ?? Math.max(0, count + (detail.following ? 1 : -1))
        );
      }
      if (
        viewerUserId === profileUserId &&
        detail.optimistic &&
        detail.previousFollowing !== detail.following
      ) {
        setFollowingCount((count) =>
          Math.max(0, count + (detail.following ? 1 : -1))
        );
      }
    }

    window.addEventListener("calistheni:follow-changed", onFollowChanged);
    return () =>
      window.removeEventListener("calistheni:follow-changed", onFollowChanged);
  }, [profileUserId, viewerUserId]);

  function open(type: ConnectionType) {
    setActiveType(type);
    setUsers([]);
    setCursor(null);
    void load(type);
  }

  const title = activeType === "followers" ? "Followers" : "Following";

  return (
    <Dialog
      open={activeType !== null}
      onOpenChange={(openState) => {
        if (!openState) setActiveType(null);
      }}
    >
      <div className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
        <DialogTrigger asChild>
          <button
            type="button"
            className="min-h-11 rounded-md px-2 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => open("followers")}
          >
            <strong className="text-foreground">{followerCount}</strong>{" "}
            Followers
          </button>
        </DialogTrigger>
        <span aria-hidden="true">·</span>
        <DialogTrigger asChild>
          <button
            type="button"
            className="min-h-11 rounded-md px-2 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => open("following")}
          >
            <strong className="text-foreground">{followingCount}</strong>{" "}
            Following
          </button>
        </DialogTrigger>
      </div>
      <DialogContent className="bottom-0 top-auto max-h-[80dvh] max-w-none translate-y-0 overflow-y-auto rounded-b-none rounded-t-2xl sm:top-1/2 sm:max-w-lg sm:-translate-y-1/2 sm:rounded-xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {activeType === "followers"
              ? "People who follow this athlete."
              : "People this athlete follows."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2" aria-live="polite">
          {isLoading && users.length === 0
            ? Array.from({ length: 3 }, (_, index) => (
                <Skeleton key={index} className="h-16 w-full" />
              ))
            : null}
          {error ? (
            <div className="rounded-lg border p-4 text-sm">
              <p>{error}</p>
              {activeType ? (
                <Button
                  type="button"
                  className="mt-3"
                  variant="outline"
                  onClick={() => void load(activeType)}
                >
                  Try again
                </Button>
              ) : null}
            </div>
          ) : null}
          {!isLoading && !error && users.length === 0 ? (
            <p className="rounded-lg border p-4 text-sm text-muted-foreground">
              {activeType === "followers"
                ? "No followers yet."
                : "Not following anyone yet."}
            </p>
          ) : null}
          {users.map((user) => (
            <div
              key={user.id}
              className="flex items-center gap-3 rounded-lg border p-3"
            >
              <Link
                href={`/users/${user.id}`}
                className="flex min-w-0 flex-1 items-center gap-3 rounded-md"
                onClick={() => setActiveType(null)}
              >
                {user.image ? (
                  <Image
                    src={user.image}
                    alt=""
                    width={44}
                    height={44}
                    unoptimized
                    className="size-11 rounded-full bg-muted object-cover"
                  />
                ) : (
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-muted font-semibold">
                    {(user.name ?? "U").slice(0, 1)}
                  </span>
                )}
                <span className="truncate font-medium">
                  {user.name ?? "Calistheni athlete"}
                  {user.isCurrentUser ? " (You)" : ""}
                </span>
              </Link>
              {viewerUserId && !user.isCurrentUser ? (
                <FollowButton
                  userId={user.id}
                  initialFollowing={user.isFollowedByCurrentUser}
                />
              ) : null}
            </div>
          ))}
          {cursor && activeType ? (
            <Button
              type="button"
              variant="outline"
              className="w-full"
              disabled={isLoading}
              onClick={() => void load(activeType, cursor)}
            >
              {isLoading ? "Loading..." : "Load more"}
            </Button>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
