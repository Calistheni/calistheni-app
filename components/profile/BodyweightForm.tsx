"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { DateOfBirthPicker } from "@/components/profile/DateOfBirthPicker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { calculateAge, validateDateOfBirth } from "@/lib/date-of-birth";
import { displayWeightInputValue, displayWeightToKg, type MeasurementSystem, weightUnit } from "@/lib/measurement-units";

type BodyweightFormProps = {
  initialBodyweightKg: number | null;
  initialDateOfBirth: string | null;
  initialRpeTrackingEnabled: boolean;
  initialMeasurementSystem: MeasurementSystem;
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
  initialMeasurementSystem,
}: BodyweightFormProps) {
  const router = useRouter();
  const [measurementSystem, setMeasurementSystem] = useState<MeasurementSystem>(initialMeasurementSystem);
  const [bodyweightInput, setBodyweightInput] = useState(displayWeightInputValue(initialBodyweightKg, initialMeasurementSystem));
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

    const trimmedBodyweight = bodyweightInput.trim();
    const nextBodyweightKg =
      trimmedBodyweight.length === 0 ? null : displayWeightToKg(Number(trimmedBodyweight), measurementSystem);

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
          measurementSystem,
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
        measurementSystem: MeasurementSystem;
        dateOfBirth: string | null;
        rpeTrackingEnabled: boolean;
      };
      setMeasurementSystem(payload.measurementSystem);
      setBodyweightInput(displayWeightInputValue(payload.bodyweightKg, payload.measurementSystem));
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
        <p className="text-sm font-medium">Measurement units</p>
        <div className="grid grid-cols-2 gap-2" role="group" aria-label="Measurement units">
          {(["METRIC", "IMPERIAL"] as const).map((system) => (
            <Button key={system} type="button" variant={measurementSystem === system ? "default" : "outline"} disabled={isSaving} onClick={() => {
              if (measurementSystem === system) return;
              const canonical = bodyweightInput.trim() ? displayWeightToKg(Number(bodyweightInput), measurementSystem) : null;
              setMeasurementSystem(system);
              setBodyweightInput(displayWeightInputValue(canonical, system));
            }}>
              {system === "METRIC" ? "Metric · kg · km" : "Imperial · lb · mi"}
            </Button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">This changes display and entry units only; workout history remains canonical.</p>
      </div>

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
          min={measurementSystem === "IMPERIAL" ? "44" : "20"}
          max={measurementSystem === "IMPERIAL" ? "661" : "300"}
          step="0.1"
          value={bodyweightInput}
          onChange={(event) => {
            setBodyweightInput(event.target.value);
            setBodyweightError(null);
          }}
          disabled={isSaving}
          placeholder={measurementSystem === "IMPERIAL" ? "176" : "80"}
          aria-label={`Bodyweight in ${weightUnit(measurementSystem) === "lb" ? "pounds" : "kilograms"}`}
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
          Used for bodyweight and weighted-bodyweight workout volume. Entered in {weightUnit(measurementSystem)} and stored canonically in kg.
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
