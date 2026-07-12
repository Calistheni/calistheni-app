"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { CreatableExerciseTrackingType } from "@/lib/exercises";
import { createExerciseSlug } from "@/lib/exercise-slug";

type ExerciseFormProps = {
  mode: "admin-create" | "custom-create" | "custom-edit";
  exerciseId?: string;
  muscleOptions?: string[];
  initialValues?: {
    name: string;
    muscle: string;
    trackingType: CreatableExerciseTrackingType;
    bodyweightLoadFactor: number | null;
  };
};

const TRACKING_TYPES: Array<{
  value: CreatableExerciseTrackingType;
  label: string;
}> = [
  { value: "BODYWEIGHT_REPS", label: "Bodyweight reps" },
  { value: "WEIGHTED_BODYWEIGHT", label: "Weighted bodyweight" },
  { value: "EXTERNAL_WEIGHT", label: "External weight" },
  { value: "DURATION", label: "Duration" },
];

async function getResponseError(response: Response) {
  const text = await response.text();
  try {
    const payload = JSON.parse(text) as { error?: string };
    return payload.error || "Something went wrong. Please try again.";
  } catch {
    return text || "Something went wrong. Please try again.";
  }
}

export function ExerciseForm({
  mode,
  exerciseId,
  muscleOptions = [],
  initialValues,
}: ExerciseFormProps) {
  const router = useRouter();
  const [name, setName] = useState(initialValues?.name ?? "");
  const [muscle, setMuscle] = useState(initialValues?.muscle ?? "");
  const [trackingType, setTrackingType] =
    useState<CreatableExerciseTrackingType>(
      initialValues?.trackingType ?? "EXTERNAL_WEIGHT"
    );
  const [bodyweightLoadFactor, setBodyweightLoadFactor] = useState(
    initialValues?.bodyweightLoadFactor?.toString() ?? ""
  );
  const [thumbnailUrl, setThumbnailUrl] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const isAdmin = mode === "admin-create";
  const usesBodyweight =
    trackingType === "BODYWEIGHT_REPS" ||
    trackingType === "WEIGHTED_BODYWEIGHT";
  const suggestedSlug = createExerciseSlug(name) || "exercise-slug";
  const suggestedThumbnailUrl = `https://assets.calistheni.app/exercise-assets/${suggestedSlug}/thumbnail.jpg`;
  const suggestedVideoUrl = `https://assets.calistheni.app/exercise-assets/${suggestedSlug}/video.mp4`;

  async function submit() {
    if (name.trim().length < 2 || muscle.trim().length < 2) {
      toast.error("Enter an exercise name and muscle group.");
      return;
    }
    if (isAdmin && !thumbnailUrl.trim()) {
      toast.error("A thumbnail URL is required for global exercises.");
      return;
    }

    setIsSaving(true);
    try {
      const commonPayload = {
        name: name.trim(),
        muscle: muscle.trim(),
        trackingType,
        bodyweightLoadFactor:
          usesBodyweight && bodyweightLoadFactor.trim()
            ? Number(bodyweightLoadFactor)
            : null,
      };

      let response: Response;
      if (isAdmin) {
        response = await fetch("/api/admin/exercises", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...commonPayload,
            thumbnailUrl: thumbnailUrl.trim(),
            videoUrl: videoUrl.trim() || null,
          }),
        });
      } else {
        response = await fetch(
          mode === "custom-edit"
            ? `/api/user/exercises/${exerciseId}`
            : "/api/user/exercises",
          {
            method: mode === "custom-edit" ? "PATCH" : "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(commonPayload),
          }
        );
      }

      if (!response.ok) throw new Error(await getResponseError(response));
      toast.success(
        isAdmin
          ? "Global exercise created."
          : mode === "custom-edit"
            ? "Custom exercise updated."
            : "Custom exercise created."
      );
      router.push(isAdmin ? "/admin/exercises" : "/exercises");
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "We couldn't save this exercise. Please try again."
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <h1 className="text-2xl font-bold">
          {isAdmin
            ? "Add Global Exercise"
            : mode === "custom-edit"
              ? "Edit Custom Exercise"
              : "Create Custom Exercise"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {isAdmin
            ? "This exercise will be available to every Calistheni user."
            : "Custom exercises are private and visible only to you."}
        </p>
      </CardHeader>
      <CardContent className="grid gap-5">
        <div className="space-y-2">
          <label htmlFor="exercise-name" className="text-sm font-medium">
            Name
          </label>
          <Input
            id="exercise-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={120}
            required
          />
        </div>
        <div className="space-y-2">
          <label htmlFor="exercise-muscle" className="text-sm font-medium">
            Muscle group
          </label>
          {isAdmin ? (
            <Select value={muscle} onValueChange={setMuscle}>
              <SelectTrigger id="exercise-muscle" className="w-full">
                <SelectValue placeholder="Select a muscle group" />
              </SelectTrigger>
              <SelectContent>
                {muscleOptions.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Input
              id="exercise-muscle"
              value={muscle}
              onChange={(event) => setMuscle(event.target.value)}
              maxLength={80}
              required
            />
          )}
        </div>
        <div className="space-y-2">
          <label htmlFor="exercise-tracking" className="text-sm font-medium">
            Tracking type
          </label>
          <Select
            value={trackingType}
            onValueChange={(value) =>
              setTrackingType(value as CreatableExerciseTrackingType)
            }
          >
            <SelectTrigger id="exercise-tracking" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TRACKING_TYPES.map((type) => (
                <SelectItem key={type.value} value={type.value}>
                  {type.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {usesBodyweight ? (
          <div className="space-y-2">
            <label htmlFor="exercise-load" className="text-sm font-medium">
              Bodyweight load factor
            </label>
            <Input
              id="exercise-load"
              type="number"
              inputMode="decimal"
              min="0.01"
              max="5"
              step="0.05"
              value={bodyweightLoadFactor}
              onChange={(event) => setBodyweightLoadFactor(event.target.value)}
              placeholder="1"
            />
            <p className="text-xs text-muted-foreground">
              Defaults to 1 when left empty.
            </p>
          </div>
        ) : null}
        {isAdmin ? (
          <>
            <div className="space-y-2">
              <label htmlFor="exercise-thumbnail" className="text-sm font-medium">
                Thumbnail URL
              </label>
              <Input
                id="exercise-thumbnail"
                type="url"
                value={thumbnailUrl}
                onChange={(event) => setThumbnailUrl(event.target.value)}
                placeholder={suggestedThumbnailUrl}
                required
              />
              <p className="text-xs text-muted-foreground">
                Upload the file to calistheni-assets first, then paste its
                public URL. Expected path: exercise-assets/&lt;slug&gt;/thumbnail.jpg
              </p>
            </div>
            <div className="space-y-2">
              <label htmlFor="exercise-video" className="text-sm font-medium">
                Demo video URL (optional)
              </label>
              <Input
                id="exercise-video"
                type="url"
                value={videoUrl}
                onChange={(event) => setVideoUrl(event.target.value)}
                placeholder={suggestedVideoUrl}
              />
              <p className="text-xs text-muted-foreground">
                Upload manually in Cloudflare or use Wrangler. The app does not
                write exercise media to R2.
              </p>
            </div>
            <div className="space-y-2 rounded-lg border bg-muted/40 p-4 text-sm">
              <p className="font-medium">Wrangler upload commands</p>
              <p className="text-xs text-muted-foreground">
                Run these after replacing the local file paths, then paste the
                matching public URLs above.
              </p>
              <code className="block overflow-x-auto rounded bg-background p-2 text-xs">
                npx wrangler r2 object put
                {` calistheni-assets/exercise-assets/${suggestedSlug}/thumbnail.jpg --file ./thumbnail.jpg --content-type image/jpeg --remote`}
              </code>
              <code className="block overflow-x-auto rounded bg-background p-2 text-xs">
                npx wrangler r2 object put
                {` calistheni-assets/exercise-assets/${suggestedSlug}/video.mp4 --file ./video.mp4 --content-type video/mp4 --remote`}
              </code>
            </div>
          </>
        ) : null}
        <Button type="button" size="lg" onClick={() => void submit()} disabled={isSaving}>
          {isSaving ? "Saving..." : mode === "custom-edit" ? "Save Changes" : "Create Exercise"}
        </Button>
      </CardContent>
    </Card>
  );
}
