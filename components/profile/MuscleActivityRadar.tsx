"use client";

import { TrendingUp } from "lucide-react";
import { PolarAngleAxis, PolarGrid, Radar, RadarChart } from "recharts";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { MuscleWorkloadPoint } from "@/lib/muscle-activity";

export type MuscleActivityPoint = MuscleWorkloadPoint;

type MuscleActivityRadarProps = {
  data: MuscleActivityPoint[];
};

const chartConfig = {
  workloadSets: {
    label: "Workload sets",
    color: "#2563eb",
  },
} satisfies ChartConfig;

export function MuscleActivityRadar({ data }: MuscleActivityRadarProps) {
  const sorted = [...data].sort((a, b) => b.sets - a.sets);
  const totalSets = data.reduce((sum, item) => sum + item.workloadSets, 0);
  const mostTrained = sorted[0] ?? null;
  const leastTrained =
    [...data].sort((a, b) => a.sets - b.sets || a.muscle.localeCompare(b.muscle))[0] ??
    null;

  return (
    <Card className="mb-6">
      <CardHeader className="items-center pb-4 text-center">
        <CardTitle>Muscle workload · Last 30 days</CardTitle>
        <CardDescription>
          Primary sets count as 1. Secondary contributions count as 0.5.
        </CardDescription>
      </CardHeader>
      <CardContent className="pb-0">
        <ChartContainer
          config={chartConfig}
          className="mx-auto aspect-square w-full max-w-[440px]"
        >
          <RadarChart
            data={data}
            outerRadius="70%"
            margin={{ top: 24, right: 42, bottom: 24, left: 42 }}
          >
            <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
            <PolarAngleAxis
              dataKey="muscle"
              tick={{ fontSize: 11 }}
            />
            <PolarGrid />
            <Radar
              dataKey="workloadSets"
              dot={{
                r: 3,
                fill: "var(--color-sets)",
                fillOpacity: 1,
              }}
              fill="var(--color-sets)"
              fillOpacity={0.6}
            />
          </RadarChart>
        </ChartContainer>
      </CardContent>
      <div className="sr-only">
        <h3>Accessible muscle workload summary</h3>
        <ul>
          {data.map((item) => (
            <li key={item.muscle}>
              {item.muscle}: {item.primarySets} primary sets,{" "}
              {item.secondaryContributions} secondary contributions,{" "}
              {item.workloadSets} workload sets.
            </li>
          ))}
        </ul>
      </div>
      {totalSets === 0 ? (
        <CardFooter className="flex-col gap-2 text-sm">
          <div className="leading-none font-medium">
            No completed sets in the last 30 days yet.
          </div>
          <div className="leading-none text-muted-foreground">
            Log workouts to fill out your muscle activity map.
          </div>
        </CardFooter>
      ) : mostTrained ? (
        <CardFooter className="flex-col gap-2 text-sm">
          <div className="flex items-center gap-2 leading-none font-medium">
            Most trained: {mostTrained.muscle} ({mostTrained.workloadSets} workload sets)
            <TrendingUp className="h-4 w-4" />
          </div>
          {leastTrained ? (
            <div className="flex items-center gap-2 leading-none text-muted-foreground">
              Least trained: {leastTrained.muscle} ({leastTrained.workloadSets} workload sets)
            </div>
          ) : null}
        </CardFooter>
      ) : null}
    </Card>
  );
}
