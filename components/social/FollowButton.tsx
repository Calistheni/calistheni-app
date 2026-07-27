"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

type FollowButtonProps = {
  userId: string;
  initialFollowing: boolean;
};

async function getErrorMessage(response: Response) {
  try {
    const payload = (await response.json()) as { error?: string };

    return payload.error || "We couldn't update that follow. Please try again.";
  } catch {
    return "We couldn't update that follow. Please try again.";
  }
}

export function FollowButton({
  userId,
  initialFollowing,
}: FollowButtonProps) {
  const router = useRouter();
  const [isFollowing, setIsFollowing] = useState(initialFollowing);
  const [isPending, setIsPending] = useState(false);

  async function toggleFollow() {
    if (isPending) return;
    const previousFollowing = isFollowing;
    const nextFollowing = !previousFollowing;
    setIsFollowing(nextFollowing);
    setIsPending(true);
    window.dispatchEvent(
      new CustomEvent("calistheni:follow-changed", {
        detail: {
          userId,
          previousFollowing,
          following: nextFollowing,
          optimistic: true,
        },
      })
    );

    try {
      const response = await fetch(`/api/users/${userId}/follow`, {
        method: previousFollowing ? "DELETE" : "POST",
      });

      if (!response.ok) {
        throw new Error(await getErrorMessage(response));
      }

      const payload = (await response.json()) as {
        following: boolean;
        followerCount: number;
        followingCount: number;
      };
      setIsFollowing(payload.following);
      window.dispatchEvent(
        new CustomEvent("calistheni:follow-changed", {
          detail: { userId, previousFollowing, ...payload },
        })
      );
      toast.success(payload.following ? "Following user." : "Unfollowed user.");
      router.refresh();
    } catch (error) {
      setIsFollowing(previousFollowing);
      window.dispatchEvent(
        new CustomEvent("calistheni:follow-changed", {
          detail: {
            userId,
            previousFollowing: nextFollowing,
            following: previousFollowing,
            optimistic: true,
          },
        })
      );
      toast.error(
        error instanceof Error
          ? error.message
          : "We couldn't update that follow. Please try again."
      );
    } finally {
      setIsPending(false);
    }
  }

  return (
    <Button
      type="button"
      variant={isFollowing ? "outline" : "default"}
      disabled={isPending}
      aria-pressed={isFollowing}
      onClick={() => void toggleFollow()}
    >
      {isPending ? "Saving..." : isFollowing ? "Following" : "Follow"}
    </Button>
  );
}
