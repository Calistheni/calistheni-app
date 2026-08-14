"use client";

import { Apple, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  getAppleHealthAuthorizationStatus,
  getLatestAppleHealthBodyWeight,
  getLatestAppleHealthProfileMeasurements,
  isAppleHealthAvailable,
  requestAppleHealthAuthorization,
  type AppleHealthAuthorizationStatus,
} from "@/lib/native/apple-health";
import { formatLength, formatWeight, type MeasurementSystem } from "@/lib/measurement-units";

type AppleHealthSettingsProps = {
  measurementSystem: MeasurementSystem;
  workoutExportEnabled: boolean;
  bodyweightImportEnabled: boolean;
  bodyMeasurementExportEnabled: boolean;
  onPreferencesChange: (preferences: {
    appleHealthWorkoutExportEnabled: boolean;
    appleHealthBodyweightImportEnabled: boolean;
    appleHealthBodyMeasurementExportEnabled: boolean;
  }) => Promise<void>;
  onUseBodyweightKg: (weightKg: number) => Promise<void>;
  onImportMeasurements: (values: { waistAtNavelCm?: number; heightCm?: number; manualBodyFatPercent?: number; dateOfBirth?: string; bodyFatSex?: "MALE" | "FEMALE" }) => Promise<void>;
  onExportMeasurementHistory: () => Promise<{ exported: number; failed: number }>;
  isPro: boolean;
};

function authorizationCopy(status: AppleHealthAuthorizationStatus) {
  if (status === "unnecessary") return "Apple Health authorization has been requested on this device.";
  if (status === "shouldRequest") return "Connect to request workout export plus the body measurements available on your plan.";
  return "Apple Health permission status is managed by iOS.";
}

export function AppleHealthSettings({
  measurementSystem,
  workoutExportEnabled,
  bodyweightImportEnabled,
  bodyMeasurementExportEnabled,
  onPreferencesChange,
  onUseBodyweightKg,
  onImportMeasurements,
  onExportMeasurementHistory,
  isPro,
}: AppleHealthSettingsProps) {
  const [available, setAvailable] = useState(false);
  const [status, setStatus] = useState<AppleHealthAuthorizationStatus>("unknown");
  const [proStatus, setProStatus] = useState<AppleHealthAuthorizationStatus>("unknown");
  const [isWorking, setIsWorking] = useState(false);
  const [latestWeight, setLatestWeight] = useState<{ weightKg: number; sampledAtMs: number | null } | null>(null);
  const [profileMeasurements, setProfileMeasurements] = useState<Awaited<ReturnType<typeof getLatestAppleHealthProfileMeasurements>> | null>(null);

  useEffect(() => {
    void (async () => {
      const nextAvailable = await isAppleHealthAvailable();
      setAvailable(nextAvailable);
      if (nextAvailable) {
        setStatus(await getAppleHealthAuthorizationStatus(false));
        if (isPro) setProStatus(await getAppleHealthAuthorizationStatus(true));
      }
    })();
  }, [isPro]);

  if (!available) return null;

  async function connect() {
    setIsWorking(true);
    try {
      const nextStatus = await requestAppleHealthAuthorization(false);
      setStatus(nextStatus);
      if (nextStatus === "unavailable") toast.error("Apple Health is unavailable on this device.");
      else toast.success("Apple Health authorization request finished.");
    } finally {
      setIsWorking(false);
    }
  }

  async function enableProHealthData() {
    setIsWorking(true);
    try {
      const nextStatus = await requestAppleHealthAuthorization(true);
      setProStatus(nextStatus);
      toast.success("Advanced Apple Health authorization request finished.");
    } finally {
      setIsWorking(false);
    }
  }

  async function loadLatestWeight() {
    setIsWorking(true);
    try {
      const result = await getLatestAppleHealthBodyWeight();
      if (result.weightKg === null) {
        toast.message("No Apple Health bodyweight was available.");
        return;
      }
      setLatestWeight({ weightKg: result.weightKg, sampledAtMs: result.sampledAtMs });
    } finally {
      setIsWorking(false);
    }
  }

  async function loadProfileMeasurements() {
    setIsWorking(true);
    try {
      setProfileMeasurements(await getLatestAppleHealthProfileMeasurements(isPro));
    } finally {
      setIsWorking(false);
    }
  }

  async function savePreferences(preferences: {
    appleHealthWorkoutExportEnabled: boolean;
    appleHealthBodyweightImportEnabled: boolean;
    appleHealthBodyMeasurementExportEnabled: boolean;
  }) {
    setIsWorking(true);
    try {
      await onPreferencesChange(preferences);
    } catch {
      toast.error("Unable to save Apple Health preferences.");
    } finally {
      setIsWorking(false);
    }
  }

  async function applyLatestWeight(weightKg: number) {
    setIsWorking(true);
    try {
      await onUseBodyweightKg(weightKg);
    } catch {
      toast.error("Unable to import Apple Health bodyweight.");
    } finally {
      setIsWorking(false);
    }
  }

  async function exportMeasurementHistory() {
    setIsWorking(true);
    try {
      const result = await onExportMeasurementHistory();
      toast.success(result.failed ? `Exported ${result.exported} samples; ${result.failed} need retrying.` : "Calistheni measurement history exported to Apple Health.");
    } catch {
      toast.error("Unable to export Calistheni measurement history.");
    } finally {
      setIsWorking(false);
    }
  }

  function sampledOn(key: keyof NonNullable<typeof profileMeasurements>["sampledAtMs"]) {
    const sampledAtMs = profileMeasurements?.sampledAtMs[key];
    return sampledAtMs ? ` · ${new Date(sampledAtMs).toLocaleDateString()}` : "";
  }

  const connected = status === "unnecessary";
  return (
    <div className="space-y-3 rounded-lg border p-3">
      <div className="flex items-start gap-3">
        <Apple className="mt-0.5 size-5 text-primary" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">Apple Health</p>
          <p className="text-xs text-muted-foreground">Connect completed workouts and explicitly import your latest body weight.</p>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">{authorizationCopy(status)}</p>
      {!connected ? <Button type="button" variant="outline" onClick={() => void connect()} disabled={isWorking}>Connect Apple Health</Button> : <>
        <div className="flex items-start justify-between gap-4">
          <div><p className="text-sm font-medium">Save completed workouts</p><p className="text-xs text-muted-foreground">Exports one completed workout to Apple Health.</p></div>
          <Switch checked={workoutExportEnabled} disabled={isWorking} onCheckedChange={(checked) => void savePreferences({ appleHealthWorkoutExportEnabled: checked, appleHealthBodyweightImportEnabled: bodyweightImportEnabled, appleHealthBodyMeasurementExportEnabled: bodyMeasurementExportEnabled })} aria-label="Save completed workouts to Apple Health" />
        </div>
        {bodyMeasurementExportEnabled ? <Button type="button" size="sm" variant="outline" onClick={() => void exportMeasurementHistory()} disabled={isWorking}>Export existing Calistheni measurements</Button> : null}
        <div className="flex items-start justify-between gap-4">
          <div><p className="text-sm font-medium">Use body weight from Health</p><p className="text-xs text-muted-foreground">Lets you manually import the latest Apple Health weight.</p></div>
          <Switch checked={bodyweightImportEnabled} disabled={isWorking} onCheckedChange={(checked) => void savePreferences({ appleHealthWorkoutExportEnabled: workoutExportEnabled, appleHealthBodyweightImportEnabled: checked, appleHealthBodyMeasurementExportEnabled: bodyMeasurementExportEnabled })} aria-label="Enable Apple Health bodyweight import" />
        </div>
        <div className="flex items-start justify-between gap-4">
          <div><p className="text-sm font-medium">Save Calistheni measurements to Health</p><p className="text-xs text-muted-foreground">Writes committed weight, waist, and eligible Pro measurements as Apple Health samples.</p></div>
          <Switch checked={bodyMeasurementExportEnabled} disabled={isWorking} onCheckedChange={(checked) => void savePreferences({ appleHealthWorkoutExportEnabled: workoutExportEnabled, appleHealthBodyweightImportEnabled: bodyweightImportEnabled, appleHealthBodyMeasurementExportEnabled: checked })} aria-label="Save Calistheni body measurements to Apple Health" />
        </div>
        {bodyweightImportEnabled ? <div className="space-y-2"><Button type="button" size="sm" variant="outline" onClick={() => void loadLatestWeight()} disabled={isWorking}><RefreshCw className="size-4" /> Read latest body weight</Button>{latestWeight ? <div className="rounded-md bg-muted/50 p-2 text-sm"><p>Apple Health found {formatWeight(latestWeight.weightKg, measurementSystem)}{latestWeight.sampledAtMs ? ` · ${new Date(latestWeight.sampledAtMs).toLocaleDateString()}` : ""}</p><Button className="mt-2" type="button" size="sm" onClick={() => void applyLatestWeight(latestWeight.weightKg)} disabled={isWorking}>Use this weight</Button></div> : null}</div> : null}
        {bodyweightImportEnabled ? <div className="space-y-2"><Button type="button" size="sm" variant="outline" onClick={() => void loadProfileMeasurements()} disabled={isWorking}><RefreshCw className="size-4" /> Review Apple Health profile data</Button>{profileMeasurements ? <div className="space-y-2 rounded-md bg-muted/50 p-2 text-sm">{profileMeasurements.waistAtNavelCm != null ? <p>Waist: {formatLength(profileMeasurements.waistAtNavelCm, measurementSystem)}{sampledOn("waistAtNavelCm")} <Button size="xs" type="button" onClick={() => void onImportMeasurements({ waistAtNavelCm: profileMeasurements.waistAtNavelCm! })}>Use</Button></p> : null}{isPro && profileMeasurements.heightCm != null ? <p>Height: {formatLength(profileMeasurements.heightCm, measurementSystem)}{sampledOn("heightCm")} <Button size="xs" type="button" onClick={() => void onImportMeasurements({ heightCm: profileMeasurements.heightCm! })}>Use</Button></p> : null}{isPro && profileMeasurements.manualBodyFatPercent != null ? <p>Body fat: {profileMeasurements.manualBodyFatPercent.toFixed(1)}%{sampledOn("manualBodyFatPercent")} <Button size="xs" type="button" onClick={() => void onImportMeasurements({ manualBodyFatPercent: profileMeasurements.manualBodyFatPercent! })}>Use</Button></p> : null}{profileMeasurements.dateOfBirth ? <p>Date of birth: {new Date(profileMeasurements.dateOfBirth).toLocaleDateString()} <Button size="xs" type="button" onClick={() => void onImportMeasurements({ dateOfBirth: profileMeasurements.dateOfBirth! })}>Use</Button></p> : null}{isPro && profileMeasurements.bodyFatSex ? <p>Biological sex: {profileMeasurements.bodyFatSex === "MALE" ? "Male" : "Female"} <Button size="xs" type="button" onClick={() => void onImportMeasurements({ bodyFatSex: profileMeasurements.bodyFatSex! })}>Use</Button></p> : null}</div> : null}</div> : null}
        <div className="rounded-md bg-muted/30 p-2 text-xs text-muted-foreground">Free Health data: Weight, waist circumference, and date of birth. {isPro ? "Pro also enables height, body fat, and biological sex." : "Upgrade to Pro for height, body fat, and biological sex."}</div>
        {isPro ? <div className="flex items-center justify-between gap-3 rounded-lg border border-primary/25 p-3"><div><p className="text-sm font-medium">Advanced body measurements <span className="text-primary">PRO</span></p><p className="text-xs text-muted-foreground">Enable Height, Body Fat Percentage, and Biological Sex from Apple Health.</p></div>{proStatus === "shouldRequest" ? <Button type="button" size="sm" onClick={() => void enableProHealthData()} disabled={isWorking}>Enable advanced Health sync</Button> : <span className="text-xs text-muted-foreground">Authorization requested</span>}</div> : null}
      </>}
    </div>
  );
}
