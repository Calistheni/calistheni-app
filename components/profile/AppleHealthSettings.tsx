"use client";

import { Apple, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  getAppleHealthAuthorizationStatus,
  getLatestAppleHealthBodyWeight,
  isAppleHealthAvailable,
  requestAppleHealthAuthorization,
  type AppleHealthAuthorizationStatus,
} from "@/lib/native/apple-health";
import { formatWeight, type MeasurementSystem } from "@/lib/measurement-units";

type AppleHealthSettingsProps = {
  measurementSystem: MeasurementSystem;
  workoutExportEnabled: boolean;
  bodyweightImportEnabled: boolean;
  onPreferencesChange: (preferences: {
    appleHealthWorkoutExportEnabled: boolean;
    appleHealthBodyweightImportEnabled: boolean;
  }) => Promise<void>;
  onUseBodyweightKg: (weightKg: number) => Promise<void>;
};

function authorizationCopy(status: AppleHealthAuthorizationStatus) {
  if (status === "unnecessary") return "Apple Health authorization has been requested on this device.";
  if (status === "shouldRequest") return "Connect to request workout-write and bodyweight-read access.";
  return "Apple Health permission status is managed by iOS.";
}

export function AppleHealthSettings({
  measurementSystem,
  workoutExportEnabled,
  bodyweightImportEnabled,
  onPreferencesChange,
  onUseBodyweightKg,
}: AppleHealthSettingsProps) {
  const [available, setAvailable] = useState(false);
  const [status, setStatus] = useState<AppleHealthAuthorizationStatus>("unknown");
  const [isWorking, setIsWorking] = useState(false);
  const [latestWeight, setLatestWeight] = useState<{ weightKg: number; sampledAtMs: number | null } | null>(null);

  useEffect(() => {
    void (async () => {
      const nextAvailable = await isAppleHealthAvailable();
      setAvailable(nextAvailable);
      if (nextAvailable) setStatus(await getAppleHealthAuthorizationStatus());
    })();
  }, []);

  if (!available) return null;

  async function connect() {
    setIsWorking(true);
    try {
      const nextStatus = await requestAppleHealthAuthorization();
      setStatus(nextStatus);
      if (nextStatus === "unavailable") toast.error("Apple Health is unavailable on this device.");
      else toast.success("Apple Health authorization request finished.");
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

  async function savePreferences(preferences: {
    appleHealthWorkoutExportEnabled: boolean;
    appleHealthBodyweightImportEnabled: boolean;
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
          <Switch checked={workoutExportEnabled} disabled={isWorking} onCheckedChange={(checked) => void savePreferences({ appleHealthWorkoutExportEnabled: checked, appleHealthBodyweightImportEnabled: bodyweightImportEnabled })} aria-label="Save completed workouts to Apple Health" />
        </div>
        <div className="flex items-start justify-between gap-4">
          <div><p className="text-sm font-medium">Use body weight from Health</p><p className="text-xs text-muted-foreground">Lets you manually import the latest Apple Health weight.</p></div>
          <Switch checked={bodyweightImportEnabled} disabled={isWorking} onCheckedChange={(checked) => void savePreferences({ appleHealthWorkoutExportEnabled: workoutExportEnabled, appleHealthBodyweightImportEnabled: checked })} aria-label="Enable Apple Health bodyweight import" />
        </div>
        {bodyweightImportEnabled ? <div className="space-y-2"><Button type="button" size="sm" variant="outline" onClick={() => void loadLatestWeight()} disabled={isWorking}><RefreshCw className="size-4" /> Read latest body weight</Button>{latestWeight ? <div className="rounded-md bg-muted/50 p-2 text-sm"><p>Apple Health found {formatWeight(latestWeight.weightKg, measurementSystem)}{latestWeight.sampledAtMs ? ` · ${new Date(latestWeight.sampledAtMs).toLocaleDateString()}` : ""}</p><Button className="mt-2" type="button" size="sm" onClick={() => void applyLatestWeight(latestWeight.weightKg)} disabled={isWorking}>Use this weight</Button></div> : null}</div> : null}
      </>}
    </div>
  );
}
