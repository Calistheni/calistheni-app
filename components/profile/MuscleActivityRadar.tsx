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

export type MuscleActivityPoint = {
  muscle: string;
  sets: number;
};

type MuscleActivityRadarProps = {
  data: MuscleActivityPoint[];
};

const chartConfig = {
  sets: {
    label: "Completed Sets",
    color: "var(--chart-1)",
  },
} satisfies ChartConfig;

export function MuscleActivityRadar({ data }: MuscleActivityRadarProps) {
  const sorted = [...data].sort((a, b) => b.sets - a.sets);
  const totalSets = data.reduce((sum, item) => sum + item.sets, 0);
  const mostTrained = sorted[0] ?? null;
  const leastTrained =
    [...data].sort((a, b) => a.sets - b.sets || a.muscle.localeCompare(b.muscle))[0] ??
    null;

  return (
    <Card className="mb-6">
      <CardHeader className="items-center pb-4 text-center">
        <CardTitle>Muscle Activity</CardTitle>
        <CardDescription>
          Completed sets by muscle group over the last 30 days.
        </CardDescription>
      </CardHeader>
      <CardContent className="pb-0">
        <ChartContainer
          config={chartConfig}
          className="mx-auto aspect-square max-h-[280px]"
        >
          <RadarChart data={data}>
            <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
            <PolarAngleAxis dataKey="muscle" />
            <PolarGrid />
            <Radar
              dataKey="sets"
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
            Most trained: {mostTrained.muscle} ({mostTrained.sets} sets)
            <TrendingUp className="h-4 w-4" />
          </div>
          {leastTrained ? (
            <div className="flex items-center gap-2 leading-none text-muted-foreground">
              Least trained: {leastTrained.muscle} ({leastTrained.sets} sets)
            </div>
          ) : null}
        </CardFooter>
      ) : null}
    </Card>
  );
}
