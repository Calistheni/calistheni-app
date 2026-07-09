"use client";

import * as React from "react";
import { CartesianGrid, Line, LineChart, XAxis } from "recharts";
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

export type ExerciseProgressChartPoint = {
  date: string;
  label: string;
  volume: number;
  bestSet: number;
  reps: number;
  duration: number;
  weight: number;
};

type MetricKey = "volume" | "bestSet" | "reps" | "duration" | "weight";

type ExerciseProgressChartProps = {
  data: ExerciseProgressChartPoint[];
  enabledMetrics: MetricKey[];
};

const chartConfig = {
  volume: {
    label: "Volume",
    color: "var(--chart-1)",
  },
  bestSet: {
    label: "Best Set",
    color: "var(--chart-2)",
  },
  reps: {
    label: "Reps",
    color: "var(--chart-3)",
  },
  duration: {
    label: "Duration",
    color: "var(--chart-4)",
  },
  weight: {
    label: "Weight",
    color: "var(--chart-5)",
  },
} satisfies ChartConfig;

export function ExerciseProgressChart({
  data,
  enabledMetrics,
}: ExerciseProgressChartProps) {
  const metrics = React.useMemo<MetricKey[]>(
    () => (enabledMetrics.length > 0 ? enabledMetrics : ["volume"]),
    [enabledMetrics]
  );
  const [activeChart, setActiveChart] = React.useState<MetricKey>(metrics[0]);
  const activeMetric = metrics.includes(activeChart) ? activeChart : metrics[0];

  const totals = React.useMemo(
    () =>
      metrics.reduce(
        (acc, metric) => ({
          ...acc,
          [metric]: data.reduce((sum, point) => sum + point[metric], 0),
        }),
        {} as Record<MetricKey, number>
      ),
    [data, metrics]
  );

  return (
    <Card className="py-4 sm:py-0">
      <CardHeader className="flex flex-col items-stretch border-b p-0! sm:flex-row">
        <div className="flex flex-1 flex-col justify-center gap-1 px-6 pb-3 sm:pb-0">
          <CardTitle>Progress Over Time</CardTitle>
          <CardDescription>
            Choose the stat you want to inspect across your logged sessions.
          </CardDescription>
        </div>
        <div className="grid grid-cols-2 sm:flex">
          {metrics.map((key) => (
            <button
              key={key}
              data-active={activeMetric === key}
              className="flex flex-1 flex-col justify-center gap-1 border-t px-4 py-3 text-left transition hover:bg-muted/30 data-[active=true]:bg-muted/50 sm:border-l sm:border-t-0 sm:px-6 sm:py-5"
              onClick={() => setActiveChart(key)}
              type="button"
            >
              <span className="text-xs text-muted-foreground">
                {chartConfig[key].label}
              </span>
              <span className="text-lg font-bold leading-none sm:text-2xl">
                {Math.round(totals[key] ?? 0).toLocaleString()}
              </span>
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="px-2 sm:p-6">
        {data.length <= 1 ? (
          <div className="flex h-[250px] items-center justify-center rounded-xl border text-center text-sm text-muted-foreground">
            Log more sessions to see a trend.
          </div>
        ) : (
          <ChartContainer
            config={chartConfig}
            className="aspect-auto h-[250px] w-full"
          >
            <LineChart
              accessibilityLayer
              data={data}
              margin={{
                left: 12,
                right: 12,
              }}
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
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    className="w-[160px]"
                    labelFormatter={(value) =>
                      new Date(String(value ?? "")).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })
                    }
                  />
                }
              />
              <Line
                dataKey={activeMetric}
                type="monotone"
                stroke={`var(--color-${activeMetric})`}
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
