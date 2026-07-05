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

    return payload.error || "Unable to update follow status.";
  } catch {
    return "Unable to update follow status.";
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
    setIsPending(true);

    try {
      const response = await fetch(`/api/users/${userId}/follow`, {
        method: isFollowing ? "DELETE" : "POST",
      });

      if (!response.ok) {
        throw new Error(await getErrorMessage(response));
      }

      const payload = (await response.json()) as { following: boolean };
      setIsFollowing(payload.following);
      toast.success(payload.following ? "Following user." : "Unfollowed user.");
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to update follow status."
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
      onClick={() => void toggleFollow()}
    >
      {isPending ? "Saving..." : isFollowing ? "Following" : "Follow"}
    </Button>
  );
}
