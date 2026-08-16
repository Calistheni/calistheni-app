"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { ProgressChart } from "@/components/charts/ProgressChart";
import {
  DIRECT_MEASUREMENT_FIELDS,
  LEGACY_MEASUREMENT_KEY_MAP,
  type MeasurementField,
} from "@/lib/progress";
import {
  getMeasurementCapabilities,
  MEASUREMENT_CATALOGUE,
} from "@/lib/anthropometry";
import {
  resolveMeasurementHistory,
  type BodyMeasurementEntryLike,
} from "@/lib/latest-body-measurements";

type Entry = BodyMeasurementEntryLike & {
  id: string;
  changedFields?: string[];
};
export function BodyMeasurementProgressChart({
  entries,
  isPro,
}: {
  entries: Entry[];
  isPro: boolean;
}) {
  const router = useRouter();
  const capabilities = getMeasurementCapabilities(isPro);
  const history = useMemo(() => resolveMeasurementHistory(entries), [entries]);
  const fields = DIRECT_MEASUREMENT_FIELDS as readonly Exclude<
    MeasurementField,
    "bodyFatPercentage"
  >[];
  const metrics = fields.map((field) => {
    const definition = MEASUREMENT_CATALOGUE[LEGACY_MEASUREMENT_KEY_MAP[field]];
    const locked = !capabilities.allowedKeys.includes(
      LEGACY_MEASUREMENT_KEY_MAP[field]
    );
    return {
      key: field,
      label: definition.label,
      shortLabel: definition.label,
      summary: definition.unit,
      locked,
      lockDescription: locked ? "Upgrade to Pro to track" : undefined,
    };
  });
  const pointsByMetric = Object.fromEntries(
    fields.map((field) => [
      field,
      history.flatMap(({ entry, snapshot, changedFields }) =>
        changedFields.includes(field) && snapshot[field] != null
          ? [
              {
                date: new Date(entry.measuredAt).toISOString(),
                value: Number(snapshot[field]),
              },
            ]
          : []
      ),
    ])
  );
  return (
    <ProgressChart
      title="Body progress"
      description="Track how your measurements change over time."
      metrics={metrics}
      pointsByMetric={pointsByMetric}
      emptyText={(metric) =>
        `No ${metric.label} history yet. Add a check-in to start tracking this measurement.`
      }
      onLockedMetric={() => {
        router.push("/pro");
      }}
    />
  );
}
