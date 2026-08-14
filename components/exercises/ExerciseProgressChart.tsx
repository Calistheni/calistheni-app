"use client";

import * as React from "react";
import { ProgressChart } from "@/components/charts/ProgressChart";
import {
  formatExerciseRecordMetricValue,
  type ExerciseRecordMetricDefinition,
  type ExerciseWorkoutPerformance,
} from "@/lib/exercise-record-metrics";

export type ExerciseProgressMetric = ExerciseRecordMetricDefinition & {
  bestValue: number;
};
export function ExerciseProgressChart({
  data,
  metrics,
}: {
  data: ExerciseWorkoutPerformance[];
  metrics: ExerciseProgressMetric[];
}) {
  const pointsByMetric = React.useMemo(
    () =>
      Object.fromEntries(
        metrics.map((metric) => [
          metric.key,
          data.flatMap((point) =>
            point.values[metric.key] == null
              ? []
              : [
                  {
                    date: point.startedAt,
                    value: point.values[metric.key],
                    title: point.workoutTitle ?? undefined,
                  },
                ]
          ),
        ])
      ),
    [data, metrics]
  );
  return (
    <ProgressChart
      title="Progress over time"
      description="One point per completed workout. Select a metric without leaving this exercise page."
      metrics={metrics.map((metric) => ({
        key: metric.key,
        label: metric.label,
        shortLabel: metric.shortLabel,
        summary: formatExerciseRecordMetricValue(metric, metric.bestValue),
      }))}
      pointsByMetric={pointsByMetric}
      emptyText={() => "No completed data is available for this metric yet."}
    />
  );
}
