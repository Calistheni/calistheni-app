"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Activity, LoaderCircle, Pencil, Target } from "lucide-react";
import {
  Label as RechartsLabel,
  PolarAngleAxis,
  PolarRadiusAxis,
  RadialBar,
  RadialBarChart,
} from "recharts";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ChartContainer, type ChartConfig } from "@/components/ui/chart";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  calculateCardioGoalMetrics,
  getWeeklyCardioProgressCopy,
  parseWeeklyCardioGoalMinutes,
  type CardioActivityContribution,
  type WeeklyCardioProgress,
} from "@/lib/cardio";
import { CALISTHENI_CHART_BLUE } from "@/lib/chart-colors";

const chartConfig = {
  progress: {
    label: "Cardio progress",
    color: CALISTHENI_CHART_BLUE,
  },
} satisfies ChartConfig;

const GOAL_PRESETS = [60, 90, 150, 300] as const;

function formatMinutes(value: number) {
  return value.toLocaleString(undefined, {
    maximumFractionDigits: 1,
  });
}

function GoalForm({
  draftGoal,
  error,
  isSaving,
  inputId,
  onCancel,
  onChange,
  onSave,
}: {
  draftGoal: string;
  error: string | null;
  isSaving: boolean;
  inputId: string;
  onCancel: () => void;
  onChange: (value: string) => void;
  onSave: () => void;
}) {
  return (
    <>
      <div className="grid gap-3 px-4 py-2 sm:px-0">
        <Label htmlFor={inputId}>Weekly cardio goal</Label>

        <div className="relative">
          <Input
            id={inputId}
            type="number"
            min={10}
            max={2000}
            step={1}
            inputMode="numeric"
            value={draftGoal}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? `${inputId}-error` : undefined}
            className="h-11 pr-16"
            onChange={(event) => onChange(event.target.value)}
          />

          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground">
            min
          </span>
        </div>

        {error ? (
          <p id={`${inputId}-error`} className="text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <div className="grid grid-cols-4 gap-2" aria-label="Suggested goals">
          {GOAL_PRESETS.map((preset) => (
            <Button
              key={preset}
              type="button"
              variant={draftGoal === String(preset) ? "default" : "outline"}
              className="h-11 px-1"
              aria-pressed={draftGoal === String(preset)}
              onClick={() => onChange(String(preset))}
            >
              {preset}
            </Button>
          ))}
        </div>
      </div>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button
          type="button"
          variant="outline"
          disabled={isSaving}
          onClick={onCancel}
        >
          Cancel
        </Button>

        <Button type="button" disabled={isSaving} onClick={onSave}>
          {isSaving ? (
            <LoaderCircle className="animate-spin" aria-hidden="true" />
          ) : null}

          {isSaving ? "Saving…" : "Save goal"}
        </Button>
      </div>
    </>
  );
}

function ActivityBreakdown({
  activities,
  totalMinutes,
}: {
  activities: CardioActivityContribution[];
  totalMinutes: number;
}) {
  return (
    <div className="grid max-h-[55dvh] gap-3 overflow-y-auto px-4 pb-2 sm:max-h-[60vh] sm:px-0">
      {activities.length === 0 ? (
        <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
          No cardio recorded this week.
        </p>
      ) : (
        activities.map((activity) => (
          <div
            key={`${activity.workoutId}:${activity.exerciseId}`}
            className="flex items-start justify-between gap-4 rounded-lg border p-3"
          >
            <div className="min-w-0">
              <Link
                href={`/workouts/${activity.workoutId}`}
                className="font-medium hover:text-primary hover:underline"
              >
                {activity.exerciseName}
              </Link>

              <p className="mt-1 text-xs text-muted-foreground">
                {new Intl.DateTimeFormat(undefined, {
                  weekday: "long",
                  month: "short",
                  day: "numeric",
                  timeZone: "UTC",
                }).format(new Date(activity.completedAt))}

                {activity.workoutTitle ? ` · ${activity.workoutTitle}` : ""}
              </p>
            </div>

            <span className="shrink-0 font-medium tabular-nums">
              {formatMinutes(activity.durationSeconds / 60)} min
            </span>
          </div>
        ))
      )}

      <div className="flex items-center justify-between border-t pt-3 font-medium">
        <span>Total</span>

        <span className="tabular-nums">{formatMinutes(totalMinutes)} min</span>
      </div>
    </div>
  );
}

function GoalEditor({
  configured,
  draftGoal,
  error,
  isSaving,
  onChange,
  onSave,
}: {
  configured: boolean;
  draftGoal: string;
  error: string | null;
  isSaving: boolean;
  onChange: (value: string) => void;
  onSave: () => Promise<boolean>;
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  const label = configured ? "Edit cardio goal" : "Set goal";

  function close() {
    setDrawerOpen(false);
    setDialogOpen(false);
  }

  async function saveAndClose() {
    if (await onSave()) {
      close();
    }
  }

  return (
    <>
      <div className="md:hidden">
        <Drawer open={drawerOpen} onOpenChange={setDrawerOpen}>
          <DrawerTrigger asChild>
            <Button
              variant={configured ? "ghost" : "default"}
              size={configured ? "icon-sm" : "sm"}
              aria-label={label}
            >
              {configured ? (
                <Pencil aria-hidden="true" />
              ) : (
                <Target aria-hidden="true" />
              )}

              {configured ? null : "Set goal"}
            </Button>
          </DrawerTrigger>

          <DrawerContent className="pb-[env(safe-area-inset-bottom)]">
            <DrawerHeader>
              <DrawerTitle>Weekly cardio goal</DrawerTitle>

              <DrawerDescription>
                Choose how many cardio minutes you want to complete each week.
              </DrawerDescription>
            </DrawerHeader>

            <div className="px-4">
              <GoalForm
                draftGoal={draftGoal}
                error={error}
                isSaving={isSaving}
                inputId="mobile-cardio-goal"
                onCancel={close}
                onChange={onChange}
                onSave={() => {
                  void saveAndClose();
                }}
              />
            </div>

            <DrawerFooter />
          </DrawerContent>
        </Drawer>
      </div>

      <div className="hidden md:block">
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button
              variant={configured ? "ghost" : "default"}
              size={configured ? "icon-sm" : "sm"}
              aria-label={label}
            >
              {configured ? (
                <Pencil aria-hidden="true" />
              ) : (
                <Target aria-hidden="true" />
              )}

              {configured ? null : "Set goal"}
            </Button>
          </DialogTrigger>

          <DialogContent>
            <DialogHeader>
              <DialogTitle>Weekly cardio goal</DialogTitle>

              <DialogDescription>
                Choose how many cardio minutes you want to complete each week.
              </DialogDescription>
            </DialogHeader>

            <GoalForm
              draftGoal={draftGoal}
              error={error}
              isSaving={isSaving}
              inputId="desktop-cardio-goal"
              onCancel={close}
              onChange={onChange}
              onSave={() => {
                void saveAndClose();
              }}
            />
          </DialogContent>
        </Dialog>
      </div>
    </>
  );
}

function ActivityViewer({
  activities,
  totalMinutes,
}: {
  activities: CardioActivityContribution[];
  totalMinutes: number;
}) {
  return (
    <>
      <div className="md:hidden">
        <Drawer>
          <DrawerTrigger asChild>
            <Button variant="outline" size="sm">
              <Activity aria-hidden="true" />
              View activity
            </Button>
          </DrawerTrigger>

          <DrawerContent className="pb-[env(safe-area-inset-bottom)]">
            <DrawerHeader>
              <DrawerTitle>Cardio activity · This week</DrawerTitle>

              <DrawerDescription>
                Completed cardio durations contributing to your weekly total.
              </DrawerDescription>
            </DrawerHeader>

            <ActivityBreakdown
              activities={activities}
              totalMinutes={totalMinutes}
            />

            <DrawerFooter />
          </DrawerContent>
        </Drawer>
      </div>

      <div className="hidden md:block">
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm">
              <Activity aria-hidden="true" />
              View activity
            </Button>
          </DialogTrigger>

          <DialogContent>
            <DialogHeader>
              <DialogTitle>Cardio activity · This week</DialogTitle>

              <DialogDescription>
                Completed cardio durations contributing to your weekly total.
              </DialogDescription>
            </DialogHeader>

            <ActivityBreakdown
              activities={activities}
              totalMinutes={totalMinutes}
            />
          </DialogContent>
        </Dialog>
      </div>
    </>
  );
}

export function CardioGoalCard({
  initialProgress,
}: {
  initialProgress: WeeklyCardioProgress | null;
}) {
  const [savedGoal, setSavedGoal] = useState(
    initialProgress?.goalMinutes ?? null
  );

  const [draftGoal, setDraftGoal] = useState(
    String(initialProgress?.goalMinutes ?? 150)
  );

  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const goalMetrics = useMemo(
    () =>
      calculateCardioGoalMetrics(
        initialProgress?.completedSeconds ?? 0,
        savedGoal
      ),
    [initialProgress?.completedSeconds, savedGoal]
  );

  if (!initialProgress) {
    return (
      <Card className="h-full">
        <CardHeader>
          <CardTitle>Weekly cardio goal</CardTitle>

          <CardDescription>
            Cardio progress is temporarily unavailable.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            Your muscle workload is still available. Try loading cardio progress
            again shortly.
          </p>
        </CardContent>
      </Card>
    );
  }

  async function saveGoal() {
    const parsedGoal = parseWeeklyCardioGoalMinutes(draftGoal);

    if (parsedGoal === null) {
      setError("Enter a whole number between 10 and 2,000 minutes.");
      return false;
    }

    setError(null);
    setIsSaving(true);

    try {
      const response = await fetch("/api/user/cardio-goal", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          goalMinutes: parsedGoal,
        }),
      });

      const payload = (await response.json()) as {
        code?: string;
        error?: string;
        goalMinutes?: number;
      };

      if (!response.ok || payload.goalMinutes === undefined) {
        throw new Error(payload.error ?? "Unable to save your cardio goal.");
      }

      setSavedGoal(payload.goalMinutes);
      setDraftGoal(String(payload.goalMinutes));

      toast.success("Cardio goal saved.");

      return true;
    } catch (saveError) {
      const message =
        saveError instanceof Error
          ? saveError.message
          : "Unable to save your cardio goal.";

      setError(message);
      toast.error(message);

      return false;
    } finally {
      setIsSaving(false);
    }
  }

  const configured = savedGoal !== null;

  const progressForCopy = {
    ...initialProgress,
    ...goalMetrics,
    goalMinutes: savedGoal,
  };

  const progressCopy = getWeeklyCardioProgressCopy(progressForCopy);

  const accessibleText = configured
    ? `Weekly cardio goal. ${formatMinutes(
        goalMetrics.completedMinutes
      )} of ${savedGoal} minutes completed, ${
        goalMetrics.progressPercent
      } percent. ${progressCopy}`
    : `Weekly cardio goal. ${formatMinutes(
        goalMetrics.completedMinutes
      )} cardio minutes completed this week. Set a goal to track progress.`;

  const progressPercent = configured
    ? Math.max(0, Math.min(goalMetrics.progressPercent, 100))
    : 0;

  const chartData = [
    {
      metric: "cardio",
      progress: progressPercent,
      fill: "var(--color-progress)",
    },
  ];

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>Weekly cardio goal</CardTitle>

        <CardDescription>
          Track your cardio minutes for this week.
        </CardDescription>

        <CardAction>
          <GoalEditor
            configured={configured}
            draftGoal={draftGoal}
            error={error}
            isSaving={isSaving}
            onChange={(value) => {
              setDraftGoal(value);
              setError(null);
            }}
            onSave={saveGoal}
          />
        </CardAction>
      </CardHeader>

      <CardContent className="flex flex-1 flex-col items-center">
        <ChartContainer
          config={chartConfig}
          className="mx-auto aspect-square h-[250px] max-h-[250px] w-full max-w-[280px]"
          role="img"
          aria-label={accessibleText}
        >
          <RadialBarChart
            data={chartData}
            startAngle={90}
            endAngle={-270}
            innerRadius={78}
            outerRadius={105}
          >
            <PolarAngleAxis
              type="number"
              dataKey="progress"
              domain={[0, 100]}
              tick={false}
              axisLine={false}
            />

            <RadialBar
              dataKey="progress"
              fill="var(--color-progress)"
              background={{
                fill: "var(--border)",
              }}
              cornerRadius={999}
              isAnimationActive={false}
            />

            <PolarRadiusAxis tick={false} tickLine={false} axisLine={false}>
              <RechartsLabel
                content={({ viewBox }) => {
                  if (!viewBox || !("cx" in viewBox) || !("cy" in viewBox)) {
                    return null;
                  }

                  const centerX = viewBox.cx ?? 0;
                  const centerY = viewBox.cy ?? 0;

                  return (
                    <text
                      x={centerX}
                      y={centerY}
                      textAnchor="middle"
                      dominantBaseline="middle"
                    >
                      <tspan
                        x={centerX}
                        y={centerY - 4}
                        className="fill-foreground text-3xl font-bold tabular-nums"
                      >
                        {formatMinutes(goalMetrics.completedMinutes)}
                      </tspan>

                      <tspan
                        x={centerX}
                        y={centerY + 24}
                        className="fill-muted-foreground text-xs"
                      >
                        {configured ? `of ${savedGoal} min` : "Set a goal"}
                      </tspan>
                    </text>
                  );
                }}
              />
            </PolarRadiusAxis>
          </RadialBarChart>
        </ChartContainer>

        <p className="sr-only">{accessibleText}</p>

        <div className="mt-1 text-center">
          <p className="font-medium">{progressCopy}</p>

          <p className="mt-1 text-xs text-muted-foreground">
            {initialProgress.sessions} cardio{" "}
            {initialProgress.sessions === 1 ? "session" : "sessions"} ·{" "}
            {initialProgress.activeDays} active{" "}
            {initialProgress.activeDays === 1 ? "day" : "days"}
          </p>
        </div>
      </CardContent>

      <CardFooter className="justify-center">
        <ActivityViewer
          activities={initialProgress.activities}
          totalMinutes={goalMetrics.completedMinutes}
        />
      </CardFooter>
    </Card>
  );
}
