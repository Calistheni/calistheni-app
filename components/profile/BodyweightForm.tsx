"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type BodyweightFormProps = {
  initialBodyweightKg: number | null;
};

async function getApiErrorMessage(response: Response) {
  try {
    const payload = (await response.json()) as { error?: string };

    return payload.error || "Unable to save bodyweight.";
  } catch {
    return "Unable to save bodyweight.";
  }
}

export function BodyweightForm({
  initialBodyweightKg,
}: BodyweightFormProps) {
  const router = useRouter();
  const [bodyweightKg, setBodyweightKg] = useState(
    initialBodyweightKg?.toString() ?? ""
  );
  const [isSaving, setIsSaving] = useState(false);

  async function saveBodyweight() {
    const trimmedBodyweight = bodyweightKg.trim();
    const nextBodyweightKg =
      trimmedBodyweight.length === 0 ? null : Number(trimmedBodyweight);

    if (
      nextBodyweightKg !== null &&
      (!Number.isFinite(nextBodyweightKg) ||
        nextBodyweightKg < 20 ||
        nextBodyweightKg > 300)
    ) {
      toast.error("Bodyweight must be between 20 and 300 kg.");
      return;
    }

    setIsSaving(true);

    try {
      const response = await fetch("/api/user/profile", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          bodyweightKg: nextBodyweightKg,
        }),
      });

      if (!response.ok) {
        throw new Error(await getApiErrorMessage(response));
      }

      const payload = (await response.json()) as {
        bodyweightKg: number | null;
      };
      setBodyweightKg(payload.bodyweightKg?.toString() ?? "");
      toast.success("Bodyweight saved.");
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to save bodyweight."
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <div className="space-y-2">
        <label htmlFor="profile-bodyweight" className="text-sm font-medium">
          Bodyweight
        </label>
        <Input
          id="profile-bodyweight"
          type="number"
          min="20"
          max="300"
          step="0.1"
          value={bodyweightKg}
          onChange={(event) => setBodyweightKg(event.target.value)}
          placeholder="80"
          aria-describedby="profile-bodyweight-help"
        />
        <p id="profile-bodyweight-help" className="text-xs text-muted-foreground">
          Used for bodyweight and weighted-bodyweight workout volume.
        </p>
      </div>
      <Button type="button" onClick={() => void saveBodyweight()} disabled={isSaving}>
        {isSaving ? "Saving..." : "Save Bodyweight"}
      </Button>
    </div>
  );
}
