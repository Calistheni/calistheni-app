"use client";

import { Heart, MessageCircle, Share2, Copy } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { WorkoutComments } from "./WorkoutComments";

export function WorkoutSocialActions({ workoutId, initialLikeCount, initialLiked, canCopy }: { workoutId: number; initialLikeCount: number; initialLiked: boolean; canCopy: boolean }) {
  const router = useRouter();
  const [liked, setLiked] = useState(initialLiked);
  const [likeCount, setLikeCount] = useState(initialLikeCount);
  const [pending, setPending] = useState(false);
  const [copying, setCopying] = useState(false);

  async function toggleLike() {
    if (pending) return;
    const before = liked;
    setPending(true); setLiked(!before); setLikeCount((count) => Math.max(0, count + (before ? -1 : 1)));
    try {
      const response = await fetch(`/api/workouts/${workoutId}/like`, { method: before ? "DELETE" : "POST" });
      const data = await response.json() as { likeCount?: number; likedByCurrentUser?: boolean; error?: string };
      if (!response.ok) throw new Error(data.error ?? "Unable to update like.");
      setLiked(Boolean(data.likedByCurrentUser)); setLikeCount(data.likeCount ?? 0);
    } catch (error) {
      setLiked(before); setLikeCount((count) => Math.max(0, count + (before ? 1 : -1)));
      toast.error(error instanceof Error ? error.message : "Unable to update like.");
    } finally { setPending(false); }
  }

  async function copyWorkout() {
    if (copying) return;
    setCopying(true);
    try {
      const response = await fetch(`/api/workouts/${workoutId}/copy`, { method: "POST" });
      const data = await response.json() as { workoutId?: number; error?: string };
      if (!response.ok || !data.workoutId) throw new Error(data.error ?? "Unable to copy workout.");
      toast.success("Workout copied. You can edit it before starting.");
      router.push(`/workouts/${data.workoutId}/edit`);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Unable to copy workout."); }
    finally { setCopying(false); }
  }

  return <div className="flex flex-wrap items-center gap-1 border-t pt-3" onClick={(event) => event.stopPropagation()}>
    <Button type="button" variant="ghost" size="sm" aria-label={liked ? "Unlike workout" : "Like workout"} aria-pressed={liked} disabled={pending} onClick={() => void toggleLike()}>
      <Heart className={liked ? "fill-current text-red-500" : ""} /> {likeCount}
    </Button>
    <WorkoutComments workoutId={workoutId} trigger={<Button type="button" variant="ghost" size="sm" aria-label="View and add comments"><MessageCircle /> Comment</Button>} />
    <Button type="button" variant="ghost" size="sm" aria-label="Sharing is coming soon" onClick={() => toast.message("Sharing is coming soon.")}><Share2 /> Share</Button>
    {canCopy ? <Button type="button" variant="ghost" size="sm" disabled={copying} onClick={() => void copyWorkout()}><Copy /> {copying ? "Copying..." : "Copy workout"}</Button> : null}
  </div>;
}
