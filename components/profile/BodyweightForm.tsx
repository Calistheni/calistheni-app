"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { DateOfBirthPicker } from "@/components/profile/DateOfBirthPicker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { calculateAge, validateDateOfBirth } from "@/lib/date-of-birth";

type BodyweightFormProps = {
  initialBodyweightKg: number | null;
  initialDateOfBirth: string | null;
  initialRpeTrackingEnabled: boolean;
};

async function getApiError(response: Response) {
  try {
    const payload = (await response.json()) as {
      error?: string;
      fieldErrors?: { dateOfBirth?: string[]; bodyweightKg?: string[] };
    };

    return {
      message: payload.error || "Unable to save personal details.",
      fieldErrors: payload.fieldErrors,
    };
  } catch {
    return { message: "Unable to save personal details." };
  }
}

export function BodyweightForm({
  initialBodyweightKg,
  initialDateOfBirth,
  initialRpeTrackingEnabled,
}: BodyweightFormProps) {
  const router = useRouter();
  const [bodyweightKg, setBodyweightKg] = useState(
    initialBodyweightKg?.toString() ?? ""
  );
  const [dateOfBirth, setDateOfBirth] = useState(initialDateOfBirth ?? "");
  const [dateOfBirthError, setDateOfBirthError] = useState<string | null>(null);
  const [bodyweightError, setBodyweightError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [rpeTrackingEnabled, setRpeTrackingEnabled] = useState(
    initialRpeTrackingEnabled
  );
  const currentAge = calculateAge(dateOfBirth);

  async function savePersonalDetails() {
    const dateResult = validateDateOfBirth(dateOfBirth);
    if (!dateResult.success) {
      setDateOfBirthError(dateResult.error);
      toast.error(dateResult.error);
      return;
    }

    const trimmedBodyweight = bodyweightKg.trim();
    const nextBodyweightKg =
      trimmedBodyweight.length === 0 ? null : Number(trimmedBodyweight);

    if (
      nextBodyweightKg !== null &&
      (!Number.isFinite(nextBodyweightKg) ||
        nextBodyweightKg < 20 ||
        nextBodyweightKg > 300)
    ) {
      const message = "Bodyweight must be between 20 and 300 kg.";
      setBodyweightError(message);
      toast.error(message);
      return;
    }

    setDateOfBirthError(null);
    setBodyweightError(null);
    setIsSaving(true);

    try {
      const response = await fetch("/api/user/profile", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          bodyweightKg: nextBodyweightKg,
          dateOfBirth: dateResult.dateOnly,
          rpeTrackingEnabled,
        }),
      });

      if (!response.ok) {
        const apiError = await getApiError(response);
        setDateOfBirthError(apiError.fieldErrors?.dateOfBirth?.[0] ?? null);
        setBodyweightError(apiError.fieldErrors?.bodyweightKg?.[0] ?? null);
        throw new Error(apiError.message);
      }

      const payload = (await response.json()) as {
        bodyweightKg: number | null;
        dateOfBirth: string | null;
        rpeTrackingEnabled: boolean;
      };
      setBodyweightKg(payload.bodyweightKg?.toString() ?? "");
      setDateOfBirth(payload.dateOfBirth ?? "");
      setRpeTrackingEnabled(payload.rpeTrackingEnabled);
      toast.success("Personal details saved.");
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to save personal details."
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <label htmlFor="profile-date-of-birth" className="text-sm font-medium">
          Date of birth
        </label>
        <DateOfBirthPicker
          id="profile-date-of-birth"
          value={dateOfBirth}
          onChange={(value) => {
            setDateOfBirth(value ?? "");
            setDateOfBirthError(null);
          }}
          disabled={isSaving}
          error={dateOfBirthError}
          ariaDescribedBy={
            dateOfBirthError
              ? "profile-date-of-birth-help profile-date-of-birth-error"
              : "profile-date-of-birth-help"
          }
        />
        <p
          id="profile-date-of-birth-help"
          className="text-xs text-muted-foreground"
        >
          Used to calculate your age
          {currentAge === null ? "." : ` (${currentAge}).`} This is private and
          is not shown on your public profile.
        </p>
        {dateOfBirthError ? (
          <p
            id="profile-date-of-birth-error"
            className="text-xs text-destructive"
            role="alert"
          >
            {dateOfBirthError}
          </p>
        ) : null}
      </div>

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
          onChange={(event) => {
            setBodyweightKg(event.target.value);
            setBodyweightError(null);
          }}
          disabled={isSaving}
          placeholder="80"
          aria-invalid={Boolean(bodyweightError)}
          aria-describedby={
            bodyweightError
              ? "profile-bodyweight-help profile-bodyweight-error"
              : "profile-bodyweight-help"
          }
        />
        <p
          id="profile-bodyweight-help"
          className="text-xs text-muted-foreground"
        >
          Used for bodyweight and weighted-bodyweight workout volume.
        </p>
        {bodyweightError ? (
          <p
            id="profile-bodyweight-error"
            className="text-xs text-destructive"
            role="alert"
          >
            {bodyweightError}
          </p>
        ) : null}
      </div>

      <div className="flex items-start justify-between gap-4 rounded-lg border p-3">
        <div className="space-y-1">
          <label htmlFor="profile-rpe-tracking" className="text-sm font-medium">
            RPE Tracking
          </label>
          <p className="text-xs text-muted-foreground">
            Show an optional effort rating for completed workout sets.
          </p>
        </div>
        <Switch
          id="profile-rpe-tracking"
          checked={rpeTrackingEnabled}
          onCheckedChange={setRpeTrackingEnabled}
          disabled={isSaving}
          aria-label="Enable RPE tracking"
        />
      </div>
      <Button
        type="button"
        onClick={() => void savePersonalDetails()}
        disabled={isSaving}
      >
        {isSaving ? "Saving..." : "Save personal details"}
      </Button>
    </div>
  );
}
