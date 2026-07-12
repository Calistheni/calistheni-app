"use client";

import imageCompression from "browser-image-compression";
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
  const [thumbnail, setThumbnail] = useState<File | null>(null);
  const [video, setVideo] = useState<File | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const isAdmin = mode === "admin-create";
  const usesBodyweight =
    trackingType === "BODYWEIGHT_REPS" ||
    trackingType === "WEIGHTED_BODYWEIGHT";

  async function createUpload(kind: "thumbnail" | "video", file: File) {
    const response = await fetch("/api/admin/exercises/uploads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        kind,
        contentType: file.type,
        size: file.size,
      }),
    });
    if (!response.ok) throw new Error(await getResponseError(response));
    return (await response.json()) as {
      uploadUrl: string;
      slug: string;
      key: string;
      publicUrl: string;
    };
  }

  async function uploadFile(uploadUrl: string, file: File) {
    let response: Response;
    try {
      response = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
    } catch {
      throw new Error(
        "The video could not reach R2. Check the assets bucket CORS policy and try again."
      );
    }
    if (!response.ok) {
      throw new Error("The video upload failed. Please try again.");
    }
  }

  async function uploadThumbnail(file: File) {
    const formData = new FormData();
    formData.set("name", name.trim());
    formData.set("file", file);
    const response = await fetch("/api/admin/exercises/uploads", {
      method: "POST",
      body: formData,
    });
    if (!response.ok) throw new Error(await getResponseError(response));
    return (await response.json()) as {
      slug: string;
      key: string;
      publicUrl: string;
    };
  }

  async function submit() {
    if (name.trim().length < 2 || muscle.trim().length < 2) {
      toast.error("Enter an exercise name and muscle group.");
      return;
    }
    if (isAdmin && !thumbnail) {
      toast.error("A thumbnail is required for global exercises.");
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
      if (isAdmin && thumbnail) {
        const compressedThumbnail = await imageCompression(thumbnail, {
          maxSizeMB: 1.5,
          maxWidthOrHeight: 1600,
          useWebWorker: true,
          fileType: "image/webp",
        });
        const thumbnailUpload = await uploadThumbnail(compressedThumbnail);

        let videoUpload: Awaited<ReturnType<typeof createUpload>> | null = null;
        if (video) {
          videoUpload = await createUpload("video", video);
          if (videoUpload.slug !== thumbnailUpload.slug) {
            throw new Error("The exercise name changed during upload. Try again.");
          }
          await uploadFile(videoUpload.uploadUrl, video);
        }

        response = await fetch("/api/admin/exercises", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...commonPayload,
            slug: thumbnailUpload.slug,
            thumbnailKey: thumbnailUpload.key,
            thumbnailUrl: thumbnailUpload.publicUrl,
            videoKey: videoUpload?.key ?? null,
            videoUrl: videoUpload?.publicUrl ?? null,
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
                Thumbnail
              </label>
              <Input
                id="exercise-thumbnail"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(event) =>
                  setThumbnail(event.target.files?.[0] ?? null)
                }
                required
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="exercise-video" className="text-sm font-medium">
                Demo video (optional)
              </label>
              <Input
                id="exercise-video"
                type="file"
                accept="video/mp4,video/webm,video/quicktime"
                onChange={(event) => setVideo(event.target.files?.[0] ?? null)}
              />
              <p className="text-xs text-muted-foreground">
                MP4, WebM, or QuickTime up to 150 MB. Uploads directly to R2.
              </p>
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
