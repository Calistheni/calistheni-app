"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import { TrendingUp } from "lucide-react";
import {
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart,
  usePlotArea,
} from "recharts";

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ChartContainer, type ChartConfig } from "@/components/ui/chart";
import { CALISTHENI_CHART_BLUE } from "@/lib/chart-colors";
import type { MuscleWorkloadPoint } from "@/lib/muscle-activity";
import {
  formatRadarWorkloadValue,
  getAdjacentRadarSectorIndex,
  getRadarMuscleAriaLabel,
  getRadarSectorGeometry,
  getRadarSectorIndex,
} from "@/lib/radar-sector-interaction";

export type MuscleActivityPoint = MuscleWorkloadPoint;

type MuscleActivityRadarProps = {
  data: MuscleActivityPoint[];
};

const chartConfig = {
  workloadScore: {
    label: "Workload score",
    color: CALISTHENI_CHART_BLUE,
  },
} satisfies ChartConfig;

type MuscleAxisTickProps = {
  index?: number;
  payload?: { value?: unknown };
  textAnchor?: "start" | "middle" | "end" | "inherit";
  x?: number | string;
  y?: number | string;
};

function normalizeMuscleName(value: string) {
  return value.trim().toLowerCase();
}

function ActiveRadarSector({
  activeIndex,
  count,
}: {
  activeIndex: number | null;
  count: number;
}) {
  const plotArea = usePlotArea();

  const geometry =
    activeIndex !== null && plotArea
      ? getRadarSectorGeometry({
          plotArea: {
            left: plotArea.x,
            top: plotArea.y,
            width: plotArea.width,
            height: plotArea.height,
          },
          index: activeIndex,
          count,
        })
      : null;

  if (!geometry) {
    return null;
  }

  return (
    <g aria-hidden="true" pointerEvents="none">
      <path
        d={geometry.path}
        fill="var(--color-workloadScore)"
        fillOpacity={0.08}
      />

      <line
        x1={geometry.cx}
        y1={geometry.cy}
        x2={geometry.axisEnd.x}
        y2={geometry.axisEnd.y}
        stroke="var(--color-workloadScore)"
        strokeOpacity={0.8}
        strokeWidth={2}
      />
    </g>
  );
}

function TooltipMetricRow({
  label,
  value,
  indicator = false,
}: {
  label: string;
  value: number;
  indicator?: boolean;
}) {
  return (
    <div className="flex min-w-40 items-center justify-between gap-4">
      <div className="flex min-w-0 items-center gap-2">
        {indicator ? (
          <span
            aria-hidden="true"
            className="size-2 shrink-0 rounded-[2px] bg-primary"
          />
        ) : null}

        <span className="whitespace-nowrap text-muted-foreground">{label}</span>
      </div>

      <span className="shrink-0 font-medium tabular-nums text-foreground">
        {formatRadarWorkloadValue(value)}
      </span>
    </div>
  );
}

function MuscleWorkloadTooltip({
  point,
  placement,
}: {
  point: MuscleActivityPoint;
  placement: "left" | "right";
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={`pointer-events-none absolute top-1/2 z-20 max-w-[calc(100%-1rem)] -translate-y-1/2 rounded-lg border bg-background/95 px-3 py-2 text-xs shadow-xl backdrop-blur-sm ${
        placement === "left" ? "left-2" : "right-2"
      }`}
    >
      <p className="mb-2 font-medium text-foreground">{point.muscle}</p>

      <div className="grid gap-1.5">
        <TooltipMetricRow label="Direct sets" value={point.directSets} />

        <TooltipMetricRow label="Assisting sets" value={point.assistingSets} />

        <TooltipMetricRow
          label="Assisting workload"
          value={point.assistingWorkload}
        />

        <TooltipMetricRow
          indicator
          label="Workload score"
          value={point.workloadScore}
        />
      </div>
    </div>
  );
}

export function MuscleActivityRadar({ data }: MuscleActivityRadarProps) {
  /*
   * Glutes are deliberately excluded from this top-level radar.
   * They may still exist in exercise details and underlying muscle data,
   * but they no longer render as a chart axis or affect the chart footer.
   */
  const chartData = useMemo(
    () =>
      data.filter((point) => normalizeMuscleName(point.muscle) !== "glutes"),
    [data]
  );

  const sorted = useMemo(
    () =>
      [...chartData].sort(
        (a, b) =>
          b.workloadScore - a.workloadScore || a.muscle.localeCompare(b.muscle)
      ),
    [chartData]
  );

  const totalWorkloadScore = useMemo(
    () => chartData.reduce((sum, item) => sum + item.workloadScore, 0),
    [chartData]
  );

  const mostTrained = sorted[0] ?? null;

  const leastTrained = useMemo(
    () =>
      [...chartData].sort(
        (a, b) =>
          a.workloadScore - b.workloadScore || a.muscle.localeCompare(b.muscle)
      )[0] ?? null,
    [chartData]
  );

  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const chartRootRef = useRef<HTMLDivElement>(null);
  const chartRectRef = useRef<DOMRect | null>(null);

  const touchStartRef = useRef<{
    pointerId: number;
    x: number;
    y: number;
  } | null>(null);

  const activePoint =
    activeIndex === null ? null : chartData[activeIndex] ?? null;

  useEffect(() => {
    setActiveIndex((current) => {
      if (current === null || current < chartData.length) {
        return current;
      }

      return null;
    });
  }, [chartData.length]);

  const syncChartRect = useCallback(() => {
    if (chartRootRef.current) {
      chartRectRef.current = chartRootRef.current.getBoundingClientRect();
    }
  }, []);

  useEffect(() => {
    const chartRoot = chartRootRef.current;

    if (!chartRoot) {
      return;
    }

    syncChartRect();

    const resizeObserver = new ResizeObserver(syncChartRect);
    resizeObserver.observe(chartRoot);

    window.addEventListener("scroll", syncChartRect, {
      passive: true,
    });

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("scroll", syncChartRect);
    };
  }, [syncChartRect]);

  const activateFromCoordinates = useCallback(
    (clientX: number, clientY: number) => {
      const rect = chartRectRef.current;

      if (!rect || chartData.length === 0) {
        return;
      }

      const nextIndex = getRadarSectorIndex({
        x: clientX - rect.left,
        y: clientY - rect.top,
        width: rect.width,
        height: rect.height,
        count: chartData.length,
      });

      if (nextIndex !== null) {
        setActiveIndex((current) =>
          current === nextIndex ? current : nextIndex
        );
      }
    },
    [chartData.length]
  );

  const handlePointerMove = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (event.pointerType === "touch") {
        return;
      }

      activateFromCoordinates(event.clientX, event.clientY);
    },
    [activateFromCoordinates]
  );

  const handlePointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (event.pointerType !== "touch") {
        return;
      }

      syncChartRect();

      touchStartRef.current = {
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
      };
    },
    [syncChartRect]
  );

  const handlePointerUp = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      const touchStart = touchStartRef.current;
      touchStartRef.current = null;

      if (
        event.pointerType !== "touch" ||
        !touchStart ||
        touchStart.pointerId !== event.pointerId
      ) {
        return;
      }

      const movement = Math.hypot(
        event.clientX - touchStart.x,
        event.clientY - touchStart.y
      );

      if (movement <= 10) {
        activateFromCoordinates(event.clientX, event.clientY);
      }
    },
    [activateFromCoordinates]
  );

  const handlePointerLeave = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (
        event.pointerType !== "touch" &&
        !chartRootRef.current?.contains(document.activeElement)
      ) {
        setActiveIndex(null);
      }
    },
    []
  );

  const focusMuscle = useCallback((index: number) => {
    setActiveIndex(index);
  }, []);

  const handleTickKeyDown = useCallback(
    (event: KeyboardEvent<SVGGElement>, index: number) => {
      if (event.key === "Escape") {
        setActiveIndex(null);
        event.currentTarget.blur();
        return;
      }

      const direction =
        event.key === "ArrowRight" || event.key === "ArrowDown"
          ? 1
          : event.key === "ArrowLeft" || event.key === "ArrowUp"
          ? -1
          : null;

      if (direction !== null) {
        event.preventDefault();

        const nextIndex = getAdjacentRadarSectorIndex(
          index,
          direction,
          chartData.length
        );

        if (nextIndex !== null) {
          setActiveIndex(nextIndex);

          chartRootRef.current
            ?.querySelector<SVGGElement>(`[data-muscle-index="${nextIndex}"]`)
            ?.focus();
        }

        return;
      }

      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        setActiveIndex(index);
      }
    },
    [chartData.length]
  );

  const renderMuscleTick = useCallback(
    ({ index = 0, payload, textAnchor, x = 0, y = 0 }: MuscleAxisTickProps) => {
      const point = chartData[index];

      if (!point) {
        return <g />;
      }

      const isActive = index === activeIndex;
      const numericX = Number(x);
      const numericY = Number(y);

      return (
        <g
          role="button"
          tabIndex={0}
          focusable="true"
          data-muscle-index={index}
          aria-label={getRadarMuscleAriaLabel(point)}
          className="cursor-pointer outline-none"
          onBlur={(event) => {
            if (!chartRootRef.current?.contains(event.relatedTarget)) {
              setActiveIndex(null);
            }
          }}
          onClick={() => focusMuscle(index)}
          onFocus={() => focusMuscle(index)}
          onKeyDown={(event) => handleTickKeyDown(event, index)}
          onPointerEnter={() => focusMuscle(index)}
        >
          <circle
            aria-hidden="true"
            cx={numericX}
            cy={numericY}
            r={22}
            fill="transparent"
          />

          <text
            x={numericX}
            y={numericY}
            textAnchor={textAnchor}
            dominantBaseline="central"
            fill={
              isActive
                ? "var(--color-workloadScore)"
                : "var(--muted-foreground)"
            }
            fontSize={11}
            fontWeight={isActive ? 600 : 400}
          >
            {String(payload?.value ?? point.muscle)}
          </text>
        </g>
      );
    },
    [activeIndex, chartData, focusMuscle, handleTickKeyDown]
  );

  return (
    <Card className="h-full">
      <CardHeader className="items-center pb-4 text-center">
        <CardTitle>Muscle workload · Last 30 days</CardTitle>

        <CardDescription>
          Direct sets count as 1. Assisting sets add 0.5 to the workload score.
        </CardDescription>
      </CardHeader>

      <CardContent className="pb-0">
        <div
          ref={chartRootRef}
          role="group"
          aria-label="Interactive muscle workload chart for the last 30 days"
          aria-describedby="muscle-workload-summary"
          className="relative mx-auto aspect-square w-full max-w-[440px] touch-pan-y"
          onPointerCancel={() => {
            touchStartRef.current = null;
          }}
          onPointerDown={handlePointerDown}
          onPointerEnter={syncChartRect}
          onPointerLeave={handlePointerLeave}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        >
          <ChartContainer
            config={chartConfig}
            className="aspect-square size-full"
          >
            <RadarChart
              data={chartData}
              outerRadius="70%"
              margin={{
                top: 24,
                right: 42,
                bottom: 24,
                left: 42,
              }}
            >
              <PolarAngleAxis dataKey="muscle" tick={renderMuscleTick} />

              <PolarGrid stroke="var(--border)" />

              <Radar
                dataKey="workloadScore"
                activeDot={false}
                dot={false}
                fill="var(--color-workloadScore)"
                fillOpacity={0.28}
                stroke="var(--color-workloadScore)"
                strokeWidth={2}
              />

              <ActiveRadarSector
                activeIndex={activeIndex}
                count={chartData.length}
              />
            </RadarChart>
          </ChartContainer>

          {activePoint ? (
            <MuscleWorkloadTooltip
              point={activePoint}
              placement={
                activeIndex !== null &&
                activeIndex >= 1 &&
                activeIndex <= Math.floor(chartData.length / 2)
                  ? "left"
                  : "right"
              }
            />
          ) : null}
        </div>
      </CardContent>

      <div className="sr-only" id="muscle-workload-summary">
        <h3>Muscle workload · Last 30 days</h3>

        <p>
          Direct sets count as 1. Assisting sets add 0.5 to the workload score.
        </p>

        <ul>
          {chartData.map((item) => (
            <li key={item.muscle}>
              {item.muscle}: {item.directSets} direct sets, {item.assistingSets}{" "}
              assisting sets, {item.assistingWorkload} assisting workload,{" "}
              {item.workloadScore} workload score.
            </li>
          ))}
        </ul>

        {mostTrained ? (
          <p>
            Highest workload: {mostTrained.muscle}. Lowest workload:{" "}
            {leastTrained?.muscle ?? "None"}.
          </p>
        ) : null}
      </div>

      {totalWorkloadScore === 0 ? (
        <CardFooter className="flex-col gap-2 text-sm">
          <div className="font-medium leading-none">
            No completed sets in the last 30 days yet.
          </div>

          <div className="leading-none text-muted-foreground">
            Log workouts to fill out your muscle activity map.
          </div>
        </CardFooter>
      ) : mostTrained ? (
        <CardFooter className="flex-col gap-2 text-sm">
          <div className="flex items-center gap-2 font-medium leading-none">
            Highest workload: {mostTrained.muscle} ·{" "}
            {formatRadarWorkloadValue(mostTrained.workloadScore)}
            <TrendingUp className="h-4 w-4" />
          </div>

          {leastTrained ? (
            <div className="flex items-center gap-2 leading-none text-muted-foreground">
              Lowest workload: {leastTrained.muscle} ·{" "}
              {formatRadarWorkloadValue(leastTrained.workloadScore)}
            </div>
          ) : null}
        </CardFooter>
      ) : null}
    </Card>
  );
}
