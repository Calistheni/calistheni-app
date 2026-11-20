"use client";

import * as React from "react";
import { LockKeyhole } from "lucide-react";
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
import { EXERCISE_RECORD_CHART_COLOR } from "@/lib/exercise-record-metrics";

export type ProgressChartMetric = {
  key: string;
  label: string;
  shortLabel: string;
  summary: string;
  formatValue: (value: number) => string;
  locked?: boolean;
  lockDescription?: string;
};
export type ProgressChartPoint = {
  date: string;
  value: number | null;
  title?: string;
};

function formatProgressDate(value: string) {
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function ProgressChart({
  title,
  description,
  metrics,
  pointsByMetric,
  emptyText,
  onLockedMetric,
}: {
  title: string;
  description: string;
  metrics: ProgressChartMetric[];
  pointsByMetric: Record<string, ProgressChartPoint[]>;
  emptyText: (metric: ProgressChartMetric) => string;
  onLockedMetric?: () => void;
}) {
  const firstUnlocked = metrics.find((metric) => !metric.locked) ?? metrics[0];
  const [activeKey, setActiveKey] = React.useState(firstUnlocked?.key ?? "");
  const activeMetric =
    metrics.find((metric) => metric.key === activeKey) ?? firstUnlocked;
  const chartData = activeMetric?.locked
    ? []
    : pointsByMetric[activeMetric?.key ?? ""] ?? [];
  const chartConfig = React.useMemo(
    () =>
      ({
        value: {
          label: activeMetric?.label ?? "Progress",
          color: EXERCISE_RECORD_CHART_COLOR,
        },
      } satisfies ChartConfig),
    [activeMetric]
  );
  if (!activeMetric) return null;
  return (
    <Card className="py-4 sm:py-0">
      <CardHeader className="flex flex-col items-stretch border-b p-0!">
        <div className="flex flex-col justify-center gap-1 px-4 pb-3 sm:px-6">
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
        <div
          className="flex gap-1 overflow-x-auto border-t p-2"
          role="group"
          aria-label={`${title} metric`}
        >
          {metrics.map((metric) => (
            <button
              key={metric.key}
              aria-pressed={activeMetric.key === metric.key}
              className="min-w-32 flex-1 rounded-lg border border-transparent px-3 py-2 text-left transition hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 aria-pressed:border-primary/30 aria-pressed:bg-accent aria-pressed:text-accent-foreground disabled:cursor-not-allowed"
              onClick={() => {
                if (metric.locked) {
                  onLockedMetric?.();
                  return;
                }
                setActiveKey(metric.key);
              }}
              type="button"
            >
              <span className="flex items-center gap-1 text-xs">
                {metric.locked ? <LockKeyhole className="size-3" aria-hidden="true" /> : null}
                {metric.shortLabel}
              </span>
              <span className="mt-1 block text-base font-bold leading-none">
                {metric.locked ? "Pro" : metric.summary}
              </span>
              {metric.locked ? (
                <span className="mt-1 block text-[11px]">
                  {metric.lockDescription ?? "Upgrade to Pro to track"}
                </span>
              ) : null}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="px-2 sm:p-6">
        <p className="sr-only" aria-live="polite">
          Showing {activeMetric.label}.
        </p>
        {activeMetric.locked ? (
          <div className="flex h-[250px] items-center justify-center rounded-xl border p-6 text-center text-sm text-muted-foreground">
            {activeMetric.lockDescription ??
              "Upgrade to Pro to track this measurement."}
          </div>
        ) : !chartData.length ? (
          <div className="flex h-[250px] items-center justify-center rounded-xl border p-6 text-center text-sm text-muted-foreground">
            {emptyText(activeMetric)}
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
                // type="category"
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
                    labelFormatter={(_, payload) =>
                      formatProgressDate(String(payload[0]?.payload?.date ?? ""))
                    }
                    formatter={(value) => (
                      <div className="flex w-full items-center justify-between gap-3">
                        <span className="text-muted-foreground">
                          {activeMetric.shortLabel}
                        </span>
                        <span className="font-mono font-medium tabular-nums">
                          {activeMetric.formatValue(Number(value))}
                        </span>
                      </div>
                    )}
                  />
                }
              />
              <Line
                dataKey="value"
                name={activeMetric.label}
                isAnimationActive="auto"
                type="monotone"
                stroke={EXERCISE_RECORD_CHART_COLOR}
                strokeWidth={2.5}
                connectNulls={false}
                dot={
                  chartData.length === 1
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
        {chartData.length > 0 && (
          <details className="mx-2 mt-3 rounded-lg border sm:mx-0">
            <summary className="cursor-pointer rounded-lg px-3 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-ring">
              View {activeMetric.label.toLowerCase()} data
            </summary>
            <table className="w-full text-left text-sm">
              <caption className="sr-only">{activeMetric.label} history</caption>
              <thead>
                <tr className="border-t">
                  <th scope="col" className="px-3 py-2">Date</th>
                  <th scope="col" className="px-3 py-2">{activeMetric.label}</th>
                </tr>
              </thead>
              <tbody>
                {chartData.map((point, index) => (
                  <tr key={`${point.date}-${index}`} className="border-t">
                    <td className="px-3 py-2">
                      <time dateTime={point.date}>{formatProgressDate(point.date)}</time>
                    </td>
                    <td className="px-3 py-2 tabular-nums">
                      {point.value === null ? "No value" : activeMetric.formatValue(point.value)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        )}
      </CardContent>
    </Card>
  );
}
