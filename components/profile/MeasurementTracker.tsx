"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, LockKeyhole, Plus, Trash2 } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NoteTextarea } from "@/components/ui/note-textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  calculateAnthropometrySummary,
  estimateBodyFatPercentage,
  getMeasurementCapabilities,
  MEASUREMENT_CATALOGUE,
  type BodyFatSex,
} from "@/lib/anthropometry";
import {
  DIRECT_MEASUREMENT_FIELDS,
  LEGACY_MEASUREMENT_KEY_MAP,
  type MeasurementField,
} from "@/lib/progress";
import {
  latestMeasurementSnapshot,
  resolveLatestMeasurementState,
  resolveMeasurementHistory,
} from "@/lib/latest-body-measurements";
import { normalizeOptionalNote } from "@/lib/notes";
import { getAppleHealthMeasurementPayloads } from "@/lib/apple-health-measurements";
import { saveAppleHealthBodyMeasurements } from "@/lib/native/apple-health";
import { toast } from "sonner";
import { BodyMeasurementProgressChart } from "@/components/profile/BodyMeasurementProgressChart";

type DecimalValue = number | string | { toString(): string } | null;
type Entry = {
  id: string;
  measuredAt: string;
  createdAt?: string;
  note: string | null;
  source?: "MANUAL" | "APPLE_HEALTH";
  changedFields?: string[];
} & Record<string, DecimalValue | string[] | undefined>;
type FormValues = Partial<Record<MeasurementField, string>>;
const STORAGE_FIELDS = DIRECT_MEASUREMENT_FIELDS.map(
  (field) => [field, LEGACY_MEASUREMENT_KEY_MAP[field]] as const
);
const groups = {
  Basic: ["bodyweightKg", "heightCm"],
  Torso: ["neckCm", "shouldersCm", "chestCm", "waistCm", "hipsCm"],
  Arms: ["bicepsCm", "forearmCm", "wristCm"],
  Legs: ["thighCm", "calfCm", "ankleCm"],
} as const satisfies Record<
  string,
  readonly Exclude<MeasurementField, "bodyFatPercentage">[]
>;

function format(value: number | null, digits = 1) {
  return value == null
    ? "—"
    : value.toLocaleString(undefined, { maximumFractionDigits: digits });
}
function label(field: Exclude<MeasurementField, "bodyFatPercentage">) {
  return MEASUREMENT_CATALOGUE[LEGACY_MEASUREMENT_KEY_MAP[field]].label;
}
function unit(field: Exclude<MeasurementField, "bodyFatPercentage">) {
  return MEASUREMENT_CATALOGUE[LEGACY_MEASUREMENT_KEY_MAP[field]].unit;
}
function missingForEstimate(
  values: Record<string, number | null | undefined>,
  sex: BodyFatSex | null
) {
  if (!sex) return ["Sex"];
  const fields =
    sex === "FEMALE"
      ? ["heightCm", "neckCm", "waistAtNavelCm", "hipsCm"]
      : ["heightCm", "neckCm", "waistAtNavelCm"];
  return fields
    .filter((key) => !values[key])
    .map(
      (key) =>
        MEASUREMENT_CATALOGUE[key as keyof typeof MEASUREMENT_CATALOGUE].label
    );
}

function MetricCard({
  title,
  value,
  detail,
  missing,
}: {
  title: string;
  value: string;
  detail: string;
  missing?: string[];
}) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{detail}</CardDescription>
      </CardHeader>
      <CardContent>
        {value !== "—" ? (
          <p className="text-2xl font-semibold tabular-nums">{value}</p>
        ) : (
          <div>
            <p className="text-lg font-medium">Unavailable</p>
            {missing?.length ? (
              <p className="mt-1 text-xs text-muted-foreground">
                Missing: {missing.join(", ")}
              </p>
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
function MeasurementInput({
  field,
  value,
  error,
  onChange,
  onClear,
}: {
  field: Exclude<MeasurementField, "bodyFatPercentage">;
  value: string;
  error?: string;
  onChange: (value: string) => void;
  onClear: () => void;
}) {
  const metadata = MEASUREMENT_CATALOGUE[LEGACY_MEASUREMENT_KEY_MAP[field]];
  const id = `measurement-${field}`;
  return (
    <div className="min-w-0 space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={id}>
          {label(field)}{" "}
          <span className="text-muted-foreground">({unit(field)})</span>
        </Label>
        {value ? (
          <Button
            type="button"
            variant="link"
            size="xs"
            className="h-auto px-0 text-muted-foreground"
            onClick={onClear}
          >
            Clear
          </Button>
        ) : null}
      </div>
      <Input
        id={id}
        inputMode="decimal"
        pattern="[0-9]*[.]?[0-9]*"
        aria-describedby={`${id}-help`}
        aria-invalid={Boolean(error)}
        value={value}
        placeholder={`${metadata.min}–${metadata.max}`}
        onChange={(event) => {
          const next = event.target.value;
          if (/^\d*(?:\.\d*)?$/.test(next)) onChange(next);
        }}
      />
      <p id={`${id}-help`} className="text-xs text-muted-foreground">
        {metadata.helper}
      </p>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

function MeasurementHistoryCell({
  field,
  value,
  previousValue,
  changed,
  locked,
}: {
  field: Exclude<MeasurementField, "bodyFatPercentage">;
  value: number | null | undefined;
  previousValue: number | null | undefined;
  changed: boolean;
  locked: boolean;
}) {
  const stateClass = locked
    ? "border-muted bg-muted/40"
    : changed
    ? "border-primary/30 bg-primary/10"
    : "border-border bg-background/40";
  const status = locked
    ? "Upgrade to track"
    : changed
    ? previousValue == null
      ? "Initial value"
      : `${format(Number(previousValue))} → ${format(Number(value))}`
    : "\u00a0";

  return (
    <div
      className={`flex min-h-24 min-w-0 flex-col justify-between rounded-md border p-3 ${stateClass}`}
    >
      <p className="text-xs text-muted-foreground">{label(field)}</p>
      {locked ? (
        <p className="flex items-center gap-1 font-medium text-muted-foreground">
          <LockKeyhole className="size-3.5" /> Pro
        </p>
      ) : (
        <p className="font-medium tabular-nums">
          {value == null ? "Not tracked" : `${format(value)} ${unit(field)}`}
        </p>
      )}
      <p
        className={`min-h-4 text-xs ${
          locked
            ? "text-muted-foreground"
            : changed
            ? "text-primary"
            : "text-transparent"
        }`}
      >
        {status}
      </p>
    </div>
  );
}

export function MeasurementTracker({
  isPro,
  appleHealthBodyMeasurementExportEnabled,
  initialBodyFatSex,
}: {
  isPro: boolean;
  appleHealthBodyMeasurementExportEnabled: boolean;
  initialBodyFatSex: BodyFatSex | null;
}) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<FormValues>({});
  const [initialValues, setInitialValues] = useState<FormValues>({});
  const [clearFields, setClearFields] = useState<MeasurementField[]>([]);
  const [note, setNote] = useState("");
  const [initialNote, setInitialNote] = useState("");
  const [sex, setSex] = useState<BodyFatSex | null>(initialBodyFatSex);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const capabilities = getMeasurementCapabilities(isPro);
  const allowedFields = useMemo(
    () =>
      new Set(
        STORAGE_FIELDS.filter(([, key]) =>
          capabilities.allowedKeys.includes(key)
        ).map(([field]) => field)
      ),
    [capabilities.allowedKeys]
  );
  const latest = entries[0] ?? null;
  const history = resolveMeasurementHistory(entries);
  const resolved = resolveLatestMeasurementState(entries);
  const resolvedValues = {
    bodyweightKg: resolved.bodyweightKg,
    heightCm: resolved.heightCm,
    neckCm: resolved.neckCm,
    waistAtNavelCm: resolved.waistCm,
    hipsCm: resolved.hipsCm,
  };
  const estimatedBodyFat =
    isPro && sex ? estimateBodyFatPercentage({ sex, ...resolvedValues }) : null;
  const summary = calculateAnthropometrySummary({
    bodyweightKg: resolved.bodyweightKg,
    heightCm: resolved.heightCm,
    manualBodyFatPercent: estimatedBodyFat,
    waistAtNavelCm: resolved.waistCm,
    hipsCm: resolved.hipsCm,
  });
  const estimateMissing = missingForEstimate(
    {
      heightCm: resolved.heightCm,
      neckCm: resolved.neckCm,
      waistAtNavelCm: resolved.waistCm,
      hipsCm: resolved.hipsCm,
    },
    sex
  );
  const hasPendingMeasurementChange = useMemo(
    () =>
      STORAGE_FIELDS.some(([field]) => {
        if (clearFields.includes(field)) return Boolean(initialValues[field]);
        const raw = values[field]?.trim();
        const initial = initialValues[field]?.trim();
        if (!raw && !initial) return false;
        const next = Number(raw);
        const previous = Number(initial);
        if (Number.isFinite(next) && Number.isFinite(previous))
          return Math.abs(next - previous) > 1e-9;
        return raw !== initial;
      }),
    [clearFields, initialValues, values]
  );
  const load = async () => {
    const response = await fetch("/api/user/measurements");
    if (response.ok) setEntries(await response.json());
  };
  useEffect(() => {
    let active = true;
    void fetch("/api/user/measurements")
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (active && data) setEntries(data);
      });
    return () => {
      active = false;
    };
  }, []);

  function openDialog() {
    const snapshot = latestMeasurementSnapshot(entries);
    const next: FormValues = {};
    for (const [field] of STORAGE_FIELDS) {
      const value = snapshot[field];
      if (value != null) next[field] = String(value);
    }
    setValues(next);
    setInitialValues(next);
    setClearFields([]);
    setNote(latest?.note ?? "");
    setInitialNote(latest?.note ?? "");
    setErrors({});
    setRequestError(null);
    setOpen(true);
  }
  function setValue(field: MeasurementField, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    setClearFields((current) => current.filter((item) => item !== field));
    setErrors((current) => ({ ...current, [field]: "" }));
  }
  function clearValue(field: MeasurementField) {
    setValues((current) => ({ ...current, [field]: "" }));
    setClearFields((current) =>
      current.includes(field) ? current : [...current, field]
    );
  }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;
    setRequestError(null);
    const nextErrors: Record<string, string> = {};
    const payload: Record<string, unknown> = {
      measuredAt: new Date().toISOString(),
      clearFields,
    };
    if (note !== initialNote) payload.note = normalizeOptionalNote(note);
    for (const [field, key] of STORAGE_FIELDS) {
      const raw = values[field]?.trim();
      const initial = initialValues[field]?.trim();
      if (!raw) continue;
      const parsed = Number(raw);
      const previous = Number(initial);
      if (
        initial &&
        Number.isFinite(previous) &&
        Number.isFinite(parsed) &&
        Math.abs(parsed - previous) <= 1e-9
      )
        continue;
      const metadata = MEASUREMENT_CATALOGUE[key];
      if (
        !Number.isFinite(parsed) ||
        parsed < metadata.min ||
        parsed > metadata.max
      )
        nextErrors[
          field
        ] = `Enter ${metadata.min}–${metadata.max} ${metadata.unit}.`;
      else payload[field] = parsed;
    }
    payload.healthExportKinds = [
      payload.bodyweightKg != null ? "BODY_WEIGHT" : null,
      payload.waistCm != null ? "WAIST" : null,
      payload.heightCm != null ? "HEIGHT" : null,
    ].filter((kind): kind is string => kind !== null);
    if (!hasPendingMeasurementChange)
      nextErrors.form = "Change at least one measurement before saving.";
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      return;
    }
    setSaving(true);
    try {
      const response = await fetch("/api/user/measurements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const result = await response.json().catch(() => null);
        setErrors(
          Object.fromEntries(
            Object.entries(result?.fieldErrors ?? {}).map(([key, messages]) => [
              key,
              Array.isArray(messages) ? messages[0] : "Invalid value.",
            ])
          )
        );
        throw new Error(result?.error ?? "Could not save this check-in.");
      }
      const entry = await response.json();
      if (appleHealthBodyMeasurementExportEnabled && entry.source === "MANUAL")
        await saveAppleHealthBodyMeasurements(
          getAppleHealthMeasurementPayloads(entry, isPro)
        );
      if (sex !== initialBodyFatSex) {
        const profile = await fetch("/api/user/profile", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ bodyFatSex: sex }),
        });
        if (!profile.ok)
          toast.error(
            "Check-in saved, but the body-fat formula selection could not be saved."
          );
      }
      await load();
      setOpen(false);
      toast.success("Check-in saved.");
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Could not save this check-in.";
      setRequestError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  async function deleteEntry(id: string) {
    const response = await fetch(`/api/user/measurements/${id}`, {
      method: "DELETE",
    });
    if (!response.ok) {
      const result = await response.json().catch(() => null);
      const message = result?.error ?? "Could not delete this check-in.";
      toast.error(message);
      return;
    }
    await load();
    toast.success("Check-in deleted.");
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <MetricCard
          title="Weight"
          value={
            resolved.bodyweightKg == null
              ? "—"
              : `${format(resolved.bodyweightKg)} kg`
          }
          detail="Latest recorded value"
        />
        <MetricCard
          title="Body Fat"
          value={
            estimatedBodyFat == null ? "—" : `${format(estimatedBodyFat)}%`
          }
          detail="US Navy circumference estimate"
          missing={
            estimatedBodyFat == null
              ? !isPro
                ? ["Pro access"]
                : estimateMissing
              : undefined
          }
        />
        <MetricCard
          title="Lean Mass"
          value={
            summary.leanBodyMassKg == null
              ? "—"
              : `${format(summary.leanBodyMassKg)} kg`
          }
          detail="Weight excluding estimated body fat"
        />
        <MetricCard
          title="FFMI"
          value={format(summary.ffmi, 1)}
          detail="Lean mass adjusted for height"
        />
        <MetricCard
          title="Waist"
          value={
            resolved.waistCm == null ? "—" : `${format(resolved.waistCm)} cm`
          }
          detail="Measured at navel"
        />
        <MetricCard
          title="Last Check-in"
          value={
            latest
              ? new Date(latest.measuredAt).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                })
              : "—"
          }
          detail="Most recent measurement event"
        />
      </div>
      <Button className="w-full sm:w-auto" onClick={openDialog}>
        <Plus />
        Add check-in
      </Button>
      <BodyMeasurementProgressChart entries={entries} isPro={isPro} />
      <Accordion
        type="multiple"
        defaultValue={["metrics", "history"]}
        className="rounded-xl border px-4"
      >
        <AccordionItem value="metrics">
          <AccordionTrigger>Calculated Metrics</AccordionTrigger>
          <AccordionContent>
            <p className="mb-3 text-sm text-muted-foreground">
              Calculated from the latest value of each measurement. These are
              informational estimates, not medical measurements.
            </p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <MetricCard
                title="Estimated Body Fat"
                value={
                  estimatedBodyFat == null
                    ? "—"
                    : `${format(estimatedBodyFat)}%`
                }
                detail="US Navy circumference estimate"
                missing={!isPro ? ["Pro access"] : estimateMissing}
              />
              <MetricCard
                title="Lean Body Mass"
                value={
                  summary.leanBodyMassKg == null
                    ? "—"
                    : `${format(summary.leanBodyMassKg)} kg`
                }
                detail="Body mass excluding estimated fat mass."
              />
              <MetricCard
                title="FFMI"
                value={format(summary.ffmi, 1)}
                detail="Lean mass adjusted for height."
              />
            </div>
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="history">
          <AccordionTrigger>History</AccordionTrigger>
          <AccordionContent>
            {entries.length ? (
              <div className="grid gap-3">
                {[...history]
                  .reverse()
                  .map(({ entry, snapshot, changedFields, previous }) => {
                    const changed = new Set(
                      entry.changedFields?.length
                        ? entry.changedFields
                        : changedFields
                    );
                    return (
                      <Card key={entry.id} size="sm">
                        <CardHeader className="flex flex-row items-start justify-between gap-3">
                          <div>
                            <CardTitle>
                              {new Date(entry.measuredAt).toLocaleDateString(
                                undefined,
                                {
                                  day: "2-digit",
                                  month: "short",
                                  year: "numeric",
                                }
                              )}
                            </CardTitle>
                            <CardDescription>
                              Resolved check-in snapshot
                            </CardDescription>
                          </div>
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            aria-label="Delete measurement"
                            onClick={() => void deleteEntry(entry.id)}
                          >
                            <Trash2 />
                          </Button>
                        </CardHeader>
                        <CardContent>
                          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                            {STORAGE_FIELDS.map(([field]) => (
                              <MeasurementHistoryCell
                                key={field}
                                field={field}
                                value={snapshot[field]}
                                previousValue={previous[field]}
                                changed={changed.has(field)}
                                locked={!allowedFields.has(field)}
                              />
                            ))}
                          </div>
                          {entry.note ? (
                            <p className="mt-3 whitespace-pre-wrap text-sm text-muted-foreground">
                              {entry.note}
                            </p>
                          ) : null}
                        </CardContent>
                      </Card>
                    );
                  })}
              </div>
            ) : (
              <p className="rounded-lg bg-muted p-4 text-sm text-muted-foreground">
                No body measurements recorded. Add your first check-in to begin
                tracking changes.
              </p>
            )}
          </AccordionContent>
        </AccordionItem>
      </Accordion>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="inset-0 h-[100dvh] max-h-none w-full max-w-none translate-x-0 translate-y-0 overflow-hidden rounded-none border-0 p-0 sm:top-1/2 sm:left-1/2 sm:h-[min(90dvh,54rem)] sm:max-w-3xl sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-xl sm:border">
          <form onSubmit={save} className="flex h-full min-h-0 flex-col">
            <DialogHeader className="shrink-0 border-b p-4 pr-12">
              <DialogTitle>Add body check-in</DialogTitle>
              <DialogDescription>
                Values are prefilled from your latest value for each
                measurement.
              </DialogDescription>
            </DialogHeader>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
              <Accordion
                type="multiple"
                defaultValue={["Basic", "Torso", "Arms", "Legs"]}
                className="rounded-xl border px-4"
              >
                {Object.entries(groups).map(([group, fields]) => (
                  <AccordionItem key={group} value={group}>
                    <AccordionTrigger>{group}</AccordionTrigger>
                    <AccordionContent>
                      <div className="grid gap-4 sm:grid-cols-2">
                        {group === "Basic" ? (
                          <div className="min-w-0 space-y-1.5">
                            <Label>Sex used for body-fat estimate</Label>
                            <Select
                              value={sex ?? undefined}
                              onValueChange={(value) =>
                                setSex(value as BodyFatSex)
                              }
                            >
                              <SelectTrigger className="w-full">
                                <SelectValue placeholder="Choose Male or Female" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="MALE">Male</SelectItem>
                                <SelectItem value="FEMALE">Female</SelectItem>
                              </SelectContent>
                            </Select>
                            <p className="text-xs text-muted-foreground">
                              This chooses the US Navy formula and is never
                              inferred.
                            </p>
                          </div>
                        ) : null}
                        {fields
                          .filter((field) => allowedFields.has(field))
                          .map((field) => (
                            <MeasurementInput
                              key={field}
                              field={field}
                              value={values[field] ?? ""}
                              error={errors[field]}
                              onChange={(value) => setValue(field, value)}
                              onClear={() => clearValue(field)}
                            />
                          ))}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
              <div className="mt-4 space-y-1.5">
                <Label htmlFor="measurement-note">
                  Check-in note <span className="font-normal">(optional)</span>
                </Label>
                <NoteTextarea
                  id="measurement-note"
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder="How are you feeling?"
                />
              </div>
              {errors.form ? (
                <p className="mt-3 text-sm text-destructive">{errors.form}</p>
              ) : null}
              {requestError ? (
                <p className="mt-3 text-sm text-destructive">{requestError}</p>
              ) : null}
            </div>
            <DialogFooter className="m-0 shrink-0 rounded-none border-t bg-popover p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] sm:m-0 sm:justify-between sm:pb-4">
              <p className="text-xs text-muted-foreground">
                {hasPendingMeasurementChange
                  ? "Fields available for your current plan are shown."
                  : "Change at least one measurement before saving."}
              </p>
              <Button
                className="w-full sm:w-auto"
                type="submit"
                disabled={saving || !hasPendingMeasurementChange}
              >
                {saving ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
                {saving ? "Saving check-in…" : "Save check-in"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
