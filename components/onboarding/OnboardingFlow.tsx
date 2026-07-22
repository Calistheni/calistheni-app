"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { DateOfBirthPicker } from "@/components/profile/DateOfBirthPicker";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { calculateAge, validateDateOfBirth } from "@/lib/date-of-birth";

type TrainingStyle = "CALISTHENICS" | "GYM" | "BOTH";
type PrimaryGoal = "FIND_PARKS" | "TRACK_WORKOUTS" | "BOTH";

type OnboardingFlowProps = {
  initialBodyweightKg: number | null;
  initialDateOfBirth: string | null;
  initialTrainingStyle: TrainingStyle | null;
  initialPrimaryGoal: PrimaryGoal | null;
};

const TRAINING_STYLE_OPTIONS: Array<{
  value: TrainingStyle;
  label: string;
  description: string;
}> = [
  {
    value: "CALISTHENICS",
    label: "Calisthenics",
    description: "Mostly bodyweight training and outdoor park sessions.",
  },
  {
    value: "GYM",
    label: "Gym",
    description: "Mostly equipment, machines, dumbbells, and barbells.",
  },
  {
    value: "BOTH",
    label: "Both",
    description: "A mix of calisthenics parks and gym workouts.",
  },
];

const PRIMARY_GOAL_OPTIONS: Array<{
  value: PrimaryGoal;
  label: string;
  description: string;
}> = [
  {
    value: "FIND_PARKS",
    label: "Find parks",
    description: "Discover places to train wherever you are.",
  },
  {
    value: "TRACK_WORKOUTS",
    label: "Track workouts",
    description: "Log sessions and watch your progress build.",
  },
  {
    value: "BOTH",
    label: "Both",
    description: "Use Calistheni for parks and training progress.",
  },
];

const TOTAL_STEPS = 5;

function getErrorMessage(error: unknown) {
  return error instanceof Error && error.message
    ? error.message
    : "We couldn't finish onboarding. Please try again.";
}

export function OnboardingFlow({
  initialBodyweightKg,
  initialDateOfBirth,
  initialTrainingStyle,
  initialPrimaryGoal,
}: OnboardingFlowProps) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [bodyweightKg, setBodyweightKg] = useState(
    initialBodyweightKg?.toString() ?? ""
  );
  const [dateOfBirth, setDateOfBirth] = useState(initialDateOfBirth ?? "");
  const [dateOfBirthError, setDateOfBirthError] = useState<string | null>(null);
  const [bodyweightError, setBodyweightError] = useState<string | null>(null);
  const [trainingStyle, setTrainingStyle] = useState<TrainingStyle | null>(
    initialTrainingStyle
  );
  const [primaryGoal, setPrimaryGoal] = useState<PrimaryGoal | null>(
    initialPrimaryGoal
  );
  const [isSaving, setIsSaving] = useState(false);
  const progress = (step / TOTAL_STEPS) * 100;

  function validatePersonalDetails() {
    const dateResult = validateDateOfBirth(dateOfBirth);
    const nextDateError = dateResult.success ? null : dateResult.error;
    let nextBodyweightError: string | null = null;

    if (bodyweightKg.trim()) {
      const parsedBodyweight = Number(bodyweightKg);

      if (
        !Number.isFinite(parsedBodyweight) ||
        parsedBodyweight < 20 ||
        parsedBodyweight > 300
      ) {
        nextBodyweightError = "Bodyweight must be between 20 and 300 kg.";
      }
    }

    setDateOfBirthError(nextDateError);
    setBodyweightError(nextBodyweightError);
    const error = nextDateError ?? nextBodyweightError;
    if (error) toast.error(error);
    return error === null;
  }

  function goNext() {
    if (step === 2 && !validatePersonalDetails()) return;

    if (step === 3 && !trainingStyle) {
      toast.error("Choose your training style to continue.");
      return;
    }

    if (step === 4 && !primaryGoal) {
      toast.error("Choose your primary goal to continue.");
      return;
    }

    setStep((current) => Math.min(current + 1, TOTAL_STEPS));
  }

  async function finishOnboarding() {
    if (!validatePersonalDetails()) {
      setStep(2);
      return;
    }

    setIsSaving(true);

    try {
      const parsedBodyweight = bodyweightKg.trim()
        ? Number(bodyweightKg)
        : null;
      const response = await fetch("/api/user/profile", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          bodyweightKg: parsedBodyweight,
          dateOfBirth: dateOfBirth || null,
          trainingStyle,
          primaryGoal,
          onboardingCompleted: true,
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          error?: string;
          fieldErrors?: { dateOfBirth?: string[]; bodyweightKg?: string[] };
        } | null;

        setDateOfBirthError(payload?.fieldErrors?.dateOfBirth?.[0] ?? null);
        setBodyweightError(payload?.fieldErrors?.bodyweightKg?.[0] ?? null);

        throw new Error(payload?.error || "Unable to save onboarding.");
      }

      toast.success("Welcome to Calistheni.");
      router.push("/home");
      router.refresh();
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Card className="w-full max-w-xl">
      <CardHeader className="space-y-3">
        <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
          <span>Step {step} of {TOTAL_STEPS}</span>
          <span>{Math.round(progress)}%</span>
        </div>
        <Progress value={progress} />
      </CardHeader>

      <CardContent className="space-y-6">
        {step === 1 ? (
          <section className="space-y-4">
            <div className="space-y-2">
              <p className="text-sm font-medium text-muted-foreground">
                Welcome
              </p>
              <h1 className="text-3xl font-bold">Welcome to Calistheni</h1>
              <p className="text-sm text-muted-foreground">
                Find places to train, log your workouts, and track progress
                across calisthenics parks and gym sessions.
              </p>
            </div>
          </section>
        ) : null}

        {step === 2 ? (
          <section className="space-y-4">
            <div className="space-y-2">
              <h1 className="text-2xl font-bold">Personal details</h1>
              <p className="text-sm text-muted-foreground">
                These details improve training insights. You can skip them for
                now and update them privately from your profile later.
              </p>
            </div>
            <div className="space-y-2">
              <label
                htmlFor="onboarding-date-of-birth"
                className="text-sm font-medium"
              >
                Date of birth
              </label>
              <DateOfBirthPicker
                id="onboarding-date-of-birth"
                value={dateOfBirth}
                onChange={(value) => {
                  setDateOfBirth(value ?? "");
                  setDateOfBirthError(null);
                }}
                error={dateOfBirthError}
                ariaDescribedBy={
                  dateOfBirthError
                    ? "onboarding-date-of-birth-help onboarding-date-of-birth-error"
                    : "onboarding-date-of-birth-help"
                }
              />
              <p
                id="onboarding-date-of-birth-help"
                className="text-xs text-muted-foreground"
              >
                Used to calculate your age. This is private and can be changed
                later.
              </p>
              {dateOfBirthError ? (
                <p
                  id="onboarding-date-of-birth-error"
                  className="text-xs text-destructive"
                  role="alert"
                >
                  {dateOfBirthError}
                </p>
              ) : null}
            </div>
            <div className="space-y-2">
              <label
                htmlFor="onboarding-bodyweight"
                className="text-sm font-medium"
              >
                Bodyweight in kg
              </label>
              <Input
                id="onboarding-bodyweight"
                inputMode="decimal"
                min={20}
                max={300}
                placeholder="80"
                value={bodyweightKg}
                onChange={(event) => {
                  setBodyweightKg(event.target.value);
                  setBodyweightError(null);
                }}
                aria-invalid={Boolean(bodyweightError)}
                aria-describedby={
                  bodyweightError
                    ? "onboarding-bodyweight-help onboarding-bodyweight-error"
                    : "onboarding-bodyweight-help"
                }
              />
              <p
                id="onboarding-bodyweight-help"
                className="text-xs text-muted-foreground"
              >
                Used for bodyweight and weighted-bodyweight workout volume.
              </p>
              {bodyweightError ? (
                <p
                  id="onboarding-bodyweight-error"
                  className="text-xs text-destructive"
                  role="alert"
                >
                  {bodyweightError}
                </p>
              ) : null}
            </div>
          </section>
        ) : null}

        {step === 3 ? (
          <section className="space-y-4">
            <div className="space-y-2">
              <h1 className="text-2xl font-bold">Training style</h1>
              <p className="text-sm text-muted-foreground">
                Pick the style that best fits how you train right now.
              </p>
            </div>
            <div className="grid gap-3">
              {TRAINING_STYLE_OPTIONS.map((option) => (
                <Button
                  key={option.value}
                  type="button"
                  variant={trainingStyle === option.value ? "default" : "outline"}
                  className="h-auto justify-start whitespace-normal p-4 text-left"
                  onClick={() => setTrainingStyle(option.value)}
                >
                  <span>
                    <span className="block font-semibold">{option.label}</span>
                    <span className="block text-xs opacity-80">
                      {option.description}
                    </span>
                  </span>
                </Button>
              ))}
            </div>
          </section>
        ) : null}

        {step === 4 ? (
          <section className="space-y-4">
            <div className="space-y-2">
              <h1 className="text-2xl font-bold">Primary goal</h1>
              <p className="text-sm text-muted-foreground">
                Tell us what you want Calistheni to help with first.
              </p>
            </div>
            <div className="grid gap-3">
              {PRIMARY_GOAL_OPTIONS.map((option) => (
                <Button
                  key={option.value}
                  type="button"
                  variant={primaryGoal === option.value ? "default" : "outline"}
                  className="h-auto justify-start whitespace-normal p-4 text-left"
                  onClick={() => setPrimaryGoal(option.value)}
                >
                  <span>
                    <span className="block font-semibold">{option.label}</span>
                    <span className="block text-xs opacity-80">
                      {option.description}
                    </span>
                  </span>
                </Button>
              ))}
            </div>
          </section>
        ) : null}

        {step === 5 ? (
          <section className="space-y-4">
            <div className="space-y-2">
              <h1 className="text-2xl font-bold">You&apos;re ready</h1>
              <p className="text-sm text-muted-foreground">
                Your setup is quick and flexible. You can update these details
                later from your profile.
              </p>
            </div>
            <div className="space-y-2 rounded-lg border bg-muted/40 p-4 text-sm">
              <p>
                <span className="font-medium">Age:</span>{" "}
                {calculateAge(dateOfBirth) ?? "Skipped"}
              </p>
              <p>
                <span className="font-medium">Bodyweight:</span>{" "}
                {bodyweightKg.trim() ? `${bodyweightKg} kg` : "Skipped"}
              </p>
              <p>
                <span className="font-medium">Training style:</span>{" "}
                {TRAINING_STYLE_OPTIONS.find((item) => item.value === trainingStyle)
                  ?.label ?? "Not selected"}
              </p>
              <p>
                <span className="font-medium">Primary goal:</span>{" "}
                {PRIMARY_GOAL_OPTIONS.find((item) => item.value === primaryGoal)
                  ?.label ?? "Not selected"}
              </p>
            </div>
          </section>
        ) : null}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
          <Button
            type="button"
            variant="outline"
            onClick={() => setStep((current) => Math.max(current - 1, 1))}
            disabled={step === 1 || isSaving}
          >
            Previous
          </Button>
          {step < TOTAL_STEPS ? (
            <div className="flex flex-col gap-2 sm:flex-row">
              {step === 2 ? (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setDateOfBirth("");
                    setDateOfBirthError(null);
                    setBodyweightKg("");
                    setBodyweightError(null);
                    setStep(3);
                  }}
                >
                  Skip
                </Button>
              ) : null}
              <Button type="button" onClick={goNext}>
                Continue
              </Button>
            </div>
          ) : (
            <Button type="button" onClick={finishOnboarding} disabled={isSaving}>
              {isSaving ? "Saving..." : "Continue to Home"}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
