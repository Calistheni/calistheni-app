"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  bodyFatDisplayValue, calculateAnthropometrySummary, estimateBodyFatPercentage,
  getMeasurementCapabilities, MEASUREMENT_CATALOGUE, type BodyFatSex,
} from "@/lib/anthropometry";
import { LEGACY_MEASUREMENT_KEY_MAP, type MeasurementField } from "@/lib/progress";

type DecimalValue = number | string | { toString(): string } | null;
type Entry = { id: string; measuredAt: string; note: string | null } & Record<MeasurementField, DecimalValue>;
type FormValues = Partial<Record<MeasurementField, string>>;

const STORAGE_FIELDS = Object.entries(LEGACY_MEASUREMENT_KEY_MAP) as [MeasurementField, keyof typeof MEASUREMENT_CATALOGUE][];
const groups = {
  Basic: ["bodyweightKg", "heightCm", "bodyFatPercentage"],
  Torso: ["neckCm", "shouldersCm", "upperChestCm", "chestCm", "waistCm", "waistNarrowestCm", "abdomenCm", "hipsCm", "glutesCm", "pelvisCm"],
  Arms: ["leftUpperArmRelaxedCm", "rightUpperArmRelaxedCm", "leftUpperArmCm", "rightUpperArmCm", "leftForearmCm", "rightForearmCm", "leftWristCm", "rightWristCm"],
  Legs: ["leftThighCm", "rightThighCm", "leftCalfCm", "rightCalfCm", "leftAnkleCm", "rightAnkleCm"],
} as const satisfies Record<string, MeasurementField[]>;

function numberValue(value: DecimalValue | undefined) {
  if (value == null) return null;
  const result = Number(typeof value === "object" ? value.toString() : value);
  return Number.isFinite(result) ? result : null;
}

function format(value: number | null, digits = 1) {
  return value == null ? "—" : value.toLocaleString(undefined, { maximumFractionDigits: digits });
}

function label(field: MeasurementField) { return MEASUREMENT_CATALOGUE[LEGACY_MEASUREMENT_KEY_MAP[field]].label; }
function unit(field: MeasurementField) { return MEASUREMENT_CATALOGUE[LEGACY_MEASUREMENT_KEY_MAP[field]].unit; }

function toAnthropometryValues(entry: Entry | null) {
  const values: Record<string, number | null> = {};
  if (!entry) return values;
  for (const [field, key] of STORAGE_FIELDS) values[key] = numberValue(entry[field]);
  return values;
}

function missingForEstimate(values: Record<string, number | null>, sex: BodyFatSex | null) {
  if (!sex) return ["Sex"];
  const fields = sex === "FEMALE" ? ["heightCm", "neckCm", "waistAtNavelCm", "hipsCm"] : ["heightCm", "neckCm", "waistAtNavelCm"];
  return fields.filter((key) => values[key] == null || values[key] === 0).map((key) => MEASUREMENT_CATALOGUE[key as keyof typeof MEASUREMENT_CATALOGUE].label);
}

function MetricCard({ title, value, detail, missing }: { title: string; value: string; detail: string; missing?: string[] }) {
  return <Card size="sm"><CardHeader><CardTitle>{title}</CardTitle><CardDescription>{detail}</CardDescription></CardHeader><CardContent>{value !== "—" ? <p className="text-2xl font-semibold tabular-nums">{value}</p> : <div><p className="text-lg font-medium">Unavailable</p>{missing?.length ? <p className="mt-1 text-xs text-muted-foreground">Missing: {missing.join(", ")}</p> : null}</div>}</CardContent></Card>;
}

function MeasurementInput({ field, value, error, onChange }: { field: MeasurementField; value: string; error?: string; onChange: (value: string) => void }) {
  const metadata = MEASUREMENT_CATALOGUE[LEGACY_MEASUREMENT_KEY_MAP[field]];
  const id = `measurement-${field}`;
  return <div className="min-w-0 space-y-1.5"><Label htmlFor={id}>{label(field)} <span className="text-muted-foreground">({unit(field)})</span></Label><Input id={id} inputMode="decimal" pattern="[0-9]*[.]?[0-9]*" aria-invalid={Boolean(error)} value={value} placeholder={`${metadata.min}–${metadata.max}`} onChange={(event) => { const next = event.target.value; if (/^\d*(?:\.\d*)?$/.test(next)) onChange(next); }} />{error ? <p className="text-xs text-destructive">{error}</p> : null}</div>;
}

export function MeasurementTracker({ isPro, initialBodyFatSex, initialHeightCm }: { isPro: boolean; initialBodyFatSex: BodyFatSex | null; initialHeightCm: string | null }) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<FormValues>({});
  const [sex, setSex] = useState<BodyFatSex | null>(initialBodyFatSex);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const capabilities = getMeasurementCapabilities(isPro);
  const allowedFields = useMemo(() => new Set(STORAGE_FIELDS.filter(([, key]) => capabilities.allowedKeys.includes(key)).map(([field]) => field)), [capabilities.allowedKeys]);
  const latest = entries[0] ?? null;
  const latestValues = toAnthropometryValues(latest);
  const estimatedBodyFat = sex ? estimateBodyFatPercentage({ sex, heightCm: latestValues.heightCm, neckCm: latestValues.neckCm, waistAtNavelCm: latestValues.waistAtNavelCm, hipsCm: latestValues.hipsCm }) : null;
  const bodyFat = bodyFatDisplayValue(latestValues.manualBodyFatPercent, isPro ? estimatedBodyFat : null);
  const summary = calculateAnthropometrySummary({ bodyweightKg: latestValues.bodyweightKg, heightCm: latestValues.heightCm, manualBodyFatPercent: bodyFat.value, waistAtNavelCm: latestValues.waistAtNavelCm, hipsCm: latestValues.hipsCm });
  const estimateMissing = missingForEstimate(latestValues, sex);

  const load = async () => {
    const response = await fetch("/api/user/measurements");
    if (response.ok) setEntries(await response.json());
  };
  useEffect(() => {
    let active = true;
    void fetch("/api/user/measurements")
      .then((response) => response.ok ? response.json() : null)
      .then((data) => { if (active && data) setEntries(data); });
    return () => { active = false; };
  }, []);

  function openDialog() {
    const next: FormValues = {};
    if (initialHeightCm) next.heightCm = initialHeightCm;
    setValues(next); setErrors({}); setRequestError(null); setOpen(true);
  }
  function setValue(field: MeasurementField, value: string) { setValues((current) => ({ ...current, [field]: value })); setErrors((current) => ({ ...current, [field]: "" })); }

  async function save(event: React.FormEvent) {
    event.preventDefault(); setRequestError(null);
    const nextErrors: Record<string, string> = {};
    const payload: Record<string, unknown> = { measuredAt: new Date().toISOString() };
    for (const [field, key] of STORAGE_FIELDS) {
      const raw = values[field]?.trim();
      if (!raw) continue;
      const parsed = Number(raw); const metadata = MEASUREMENT_CATALOGUE[key];
      if (!Number.isFinite(parsed) || parsed < metadata.min || parsed > metadata.max) nextErrors[field] = `Enter ${metadata.min}–${metadata.max} ${metadata.unit}.`;
      else payload[field] = parsed;
    }
    if (!Object.keys(payload).some((key) => key !== "measuredAt")) nextErrors.form = "Add at least one measurement.";
    if (Object.keys(nextErrors).length) { setErrors(nextErrors); return; }
    setSaving(true);
    try {
      if (sex !== initialBodyFatSex) {
        const profile = await fetch("/api/user/profile", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ bodyFatSex: sex }) });
        if (!profile.ok) throw new Error("Could not save the formula selection.");
      }
      const response = await fetch("/api/user/measurements", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!response.ok) {
        const result = await response.json().catch(() => null);
        setErrors(Object.fromEntries(Object.entries(result?.fieldErrors ?? {}).map(([key, messages]) => [key, Array.isArray(messages) ? messages[0] : "Invalid value."])));
        throw new Error(result?.error ?? "Could not save this check-in.");
      }
      setOpen(false); await load();
    } catch (error) { setRequestError(error instanceof Error ? error.message : "Could not save this check-in."); }
    finally { setSaving(false); }
  }

  return <div className="space-y-4">
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
      <MetricCard title="Weight" value={latest ? `${format(latestValues.bodyweightKg)} kg` : "—"} detail="Latest check-in" />
      <MetricCard title="Body Fat" value={bodyFat.value == null ? "—" : `${format(bodyFat.value)}%`} detail={bodyFat.source === "manual" ? "Manual measurement" : "US Navy circumference estimate"} missing={bodyFat.value == null ? estimateMissing : undefined} />
      <MetricCard title="Lean Mass" value={summary.leanBodyMassKg == null ? "—" : `${format(summary.leanBodyMassKg)} kg`} detail="Weight excluding body fat" />
      <MetricCard title="FFMI" value={format(summary.ffmi, 1)} detail="Fat-free mass relative to height" />
      <MetricCard title="Waist" value={latest ? `${format(latestValues.waistAtNavelCm)} cm` : "—"} detail="Measured at navel" />
      <MetricCard title="Last Check-in" value={latest ? new Date(latest.measuredAt).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "—"} detail="Most recent snapshot" />
    </div>
    <Button className="w-full sm:w-auto" onClick={openDialog}><Plus />Add check-in</Button>
    <Accordion type="multiple" defaultValue={["metrics", "history"]} className="rounded-xl border px-4">
      <AccordionItem value="metrics"><AccordionTrigger>Calculated Metrics</AccordionTrigger><AccordionContent><p className="mb-3 text-sm text-muted-foreground">Calculated from your latest check-in. These are informational estimates, not medical measurements.</p><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"><MetricCard title="Estimated Body Fat" value={estimatedBodyFat == null || !isPro ? "—" : `${format(estimatedBodyFat)}%`} detail="Estimated using the US Navy circumference method. This is an estimate and not a medical measurement." missing={!isPro ? ["Pro access"] : estimateMissing} /><MetricCard title="Fat Mass" value={summary.fatMassKg == null ? "—" : `${format(summary.fatMassKg)} kg`} detail="Estimated kilograms of body fat." /><MetricCard title="Lean Body Mass" value={summary.leanBodyMassKg == null ? "—" : `${format(summary.leanBodyMassKg)} kg`} detail="Body mass excluding estimated fat mass." /><MetricCard title="FFMI" value={format(summary.ffmi, 1)} detail="Lean mass adjusted for height." /><MetricCard title="Waist / Height Ratio" value={format(summary.waistToHeightRatio, 2)} detail="Waist circumference divided by height." /><MetricCard title="Waist / Hip Ratio" value={format(summary.waistToHipRatio, 2)} detail="Waist circumference divided by hip circumference." /></div></AccordionContent></AccordionItem>
      <AccordionItem value="history"><AccordionTrigger>History</AccordionTrigger><AccordionContent>{entries.length ? <div className="grid gap-3">{entries.map((entry) => <Card key={entry.id} size="sm"><CardHeader className="flex flex-row items-start justify-between gap-3"><div><CardTitle>{new Date(entry.measuredAt).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" })}</CardTitle><CardDescription>Measurement snapshot</CardDescription></div><Button size="icon-sm" variant="ghost" aria-label="Delete measurement" onClick={async () => { await fetch(`/api/user/measurements/${entry.id}`, { method: "DELETE" }); await load(); }}><Trash2 /></Button></CardHeader><CardContent><div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">{STORAGE_FIELDS.filter(([field]) => numberValue(entry[field]) != null).map(([field]) => <div key={field} className="min-w-0"><p className="text-xs text-muted-foreground">{label(field)}</p><p className="font-medium tabular-nums">{format(numberValue(entry[field]))} {unit(field)}</p></div>)}</div></CardContent></Card>)}</div> : <p className="rounded-lg bg-muted p-4 text-sm text-muted-foreground">No body measurements recorded. Add your first check-in to begin tracking changes.</p>}</AccordionContent></AccordionItem>
    </Accordion>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="inset-0 h-[100dvh] max-h-none w-full max-w-none translate-x-0 translate-y-0 rounded-none border-0 p-0 sm:top-1/2 sm:left-1/2 sm:h-[min(90dvh,54rem)] sm:max-w-3xl sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-xl sm:border"><form onSubmit={save} className="flex h-full min-h-0 flex-col"><DialogHeader className="shrink-0 border-b p-4 pr-12"><DialogTitle>Add body check-in</DialogTitle><DialogDescription>Save a complete measurement snapshot. Decimal values are supported.</DialogDescription></DialogHeader><div className="min-h-0 flex-1 overflow-y-auto p-4"><Accordion type="multiple" defaultValue={["Basic", "Torso", "Arms", "Legs"]} className="rounded-xl border px-4">{Object.entries(groups).map(([group, fields]) => <AccordionItem key={group} value={group}><AccordionTrigger>{group}</AccordionTrigger><AccordionContent><div className="grid gap-4 sm:grid-cols-2">{group === "Basic" ? <div className="min-w-0 space-y-1.5"><Label>Sex used for body-fat estimate</Label><Select value={sex ?? undefined} onValueChange={(value) => setSex(value as BodyFatSex)}><SelectTrigger className="w-full"><SelectValue placeholder="Choose Male or Female" /></SelectTrigger><SelectContent><SelectItem value="MALE">Male</SelectItem><SelectItem value="FEMALE">Female</SelectItem></SelectContent></Select><p className="text-xs text-muted-foreground">This optional value chooses the US Navy formula and is never inferred.</p></div> : null}{fields.filter((field) => allowedFields.has(field)).map((field) => <MeasurementInput key={field} field={field} value={values[field] ?? ""} error={errors[field]} onChange={(value) => setValue(field, value)} />)}</div></AccordionContent></AccordionItem>)}</Accordion>{errors.form ? <p className="mt-3 text-sm text-destructive">{errors.form}</p> : null}{requestError ? <p className="mt-3 text-sm text-destructive">{requestError}</p> : null}</div><DialogFooter className="shrink-0 sm:justify-between"><p className="hidden text-xs text-muted-foreground sm:block">Fields available for your current plan are shown.</p><Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save check-in"}</Button></DialogFooter></form></DialogContent></Dialog>
  </div>;
}
