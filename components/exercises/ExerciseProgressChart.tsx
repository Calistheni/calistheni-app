"use client";

import * as React from "react";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  EXERCISE_RECORD_CHART_COLOR,
  formatExerciseRecordMetricValue,
  type ExerciseRecordMetricDefinition,
  type ExerciseWorkoutPerformance,
} from "@/lib/exercise-record-metrics";

export type ExerciseProgressMetric = ExerciseRecordMetricDefinition & {
  bestValue: number;
};

type ExerciseProgressChartProps = {
  data: ExerciseWorkoutPerformance[];
  metrics: ExerciseProgressMetric[];
};

export function ExerciseProgressChart({
  data,
  metrics,
}: ExerciseProgressChartProps) {
  const [activeChart, setActiveChart] = React.useState(metrics[0]?.key ?? null);
  const activeMetric =
    metrics.find((metric) => metric.key === activeChart) ?? metrics[0];
  const chartData = React.useMemo(
    () =>
      activeMetric
        ? data.map((point) => ({
            date: point.startedAt,
            workoutId: point.workoutId,
            workoutTitle: point.workoutTitle,
            value: point.values[activeMetric.key],
          }))
        : [],
    [activeMetric, data]
  );
  const availablePoints = chartData.filter(
    (point) => point.value !== null
  ).length;
  const chartConfig = React.useMemo(
    () =>
      ({
        value: {
          label: activeMetric?.label ?? "Performance",
          color: EXERCISE_RECORD_CHART_COLOR,
        },
      }) satisfies ChartConfig,
    [activeMetric]
  );

  if (!activeMetric) {
    return null;
  }

  return (
    <Card className="py-4 sm:py-0">
      <CardHeader className="flex flex-col items-stretch border-b p-0!">
        <div className="flex flex-col justify-center gap-1 px-4 pb-3 sm:px-6">
          <CardTitle>Progress over time</CardTitle>
          <CardDescription>
            One point per completed workout. Select a metric without leaving
            this exercise page.
          </CardDescription>
        </div>
        <div
          className="flex gap-1 overflow-x-auto border-t p-2"
          role="group"
          aria-label="Progress chart metric"
        >
          {metrics.map((metric) => (
            <button
              key={metric.key}
              aria-pressed={activeMetric.key === metric.key}
              className="min-w-32 flex-1 rounded-lg border border-transparent px-3 py-2 text-left transition hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 aria-pressed:border-primary/30 aria-pressed:bg-accent aria-pressed:text-accent-foreground"
              onClick={() => setActiveChart(metric.key)}
              type="button"
            >
              <span className="block text-xs text-muted-foreground">
                {metric.shortLabel}
              </span>
              <span className="mt-1 block text-base font-bold leading-none">
                {formatExerciseRecordMetricValue(metric, metric.bestValue)}
              </span>
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="px-2 sm:p-6">
        <p className="sr-only" aria-live="polite">
          Showing {activeMetric.label}. Best value: {" "}
          {formatExerciseRecordMetricValue(
            activeMetric,
            activeMetric.bestValue
          )}.
        </p>
        {availablePoints === 0 ? (
          <div className="flex h-[250px] items-center justify-center rounded-xl border text-center text-sm text-muted-foreground">
            No completed data is available for this metric yet.
          </div>
        ) : (
          <ChartContainer
            config={chartConfig}
            className="aspect-auto h-[280px] w-full"
          >
            <LineChart
              accessibilityLayer
              data={chartData}
              margin={{ left: 8, right: 16, top: 12 }}
            >
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="date"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                minTickGap={32}
                tickFormatter={(value) =>
                  new Date(value).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                  })
                }
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                width={42}
                tickFormatter={(value) => Number(value).toLocaleString()}
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    className="w-[190px]"
                    color={EXERCISE_RECORD_CHART_COLOR}
                    labelFormatter={(_, payload) => {
                      const rawDate = payload[0]?.payload?.date;
                      return new Date(String(rawDate ?? "")).toLocaleString(
                        "en-US",
                        {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                        }
                      );
                    }}
                    formatter={(value) => (
                      <div className="flex w-full items-center justify-between gap-3">
                        <span className="text-muted-foreground">
                          {activeMetric.shortLabel}
                        </span>
                        <span className="font-mono font-medium tabular-nums">
                          {formatExerciseRecordMetricValue(
                            activeMetric,
                            Number(value)
                          )}
                        </span>
                      </div>
                    )}
                  />
                }
              />
              <Line
                dataKey="value"
                name={activeMetric.label}
                type="monotone"
                stroke={EXERCISE_RECORD_CHART_COLOR}
                strokeWidth={2.5}
                connectNulls={false}
                dot={
                  availablePoints === 1
                    ? {
                        fill: EXERCISE_RECORD_CHART_COLOR,
                        stroke: "var(--background)",
                        strokeWidth: 2,
                        r: 4,
                      }
                    : false
                }
                activeDot={{
                  fill: EXERCISE_RECORD_CHART_COLOR,
                  stroke: "var(--background)",
                  strokeWidth: 2,
                  r: 5,
                }}
              />
            </LineChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
