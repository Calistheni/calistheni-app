"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useState } from "react";
import { Archive, Bell, BellRing, Check, Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { getLocalSupplementDateKey } from "@/lib/supplement-log";
import { createSupplementLogRequest } from "@/lib/supplement-log-client";
import { isReminderPlanDueOn } from "@/lib/supplement-reminder-due";
import { cancelAllSupplementReminders, checkSupplementReminderPermission, deviceTimeZone, reconcileSupplementReminders, requestSupplementReminderPermission, type ReminderPermission, type ReminderSettings } from "@/lib/native/supplement-reminders";

type Plan = {
  id: string;
  customName: string | null;
  dosage: { toString(): string } | null;
  unit: string | null;
  frequency: "DAILY" | "SELECTED_WEEKDAYS" | "AS_NEEDED";
  weekdays: number[];
  preferredTime: string | null;
  isActive: boolean;
  createdAt: string;
  archivedAt: string | null;
  supplementDefinition: { id: string; name: string } | null;
  logs: { scheduledFor: string }[];
};
type Definition = { id: string; name: string };

async function responseError(response: Response, fallback: string) {
  try {
    const body = await response.json();
    return typeof body.error === "string" ? body.error : fallback;
  } catch {
    return fallback;
  }
}

export function SupplementTracker() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [definitions, setDefinitions] = useState<Definition[]>([]);
  const [editing, setEditing] = useState<Plan | null>(null);
  const [busy, setBusy] = useState(false);
  const [takingPlanId, setTakingPlanId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [reminderSettings, setReminderSettings] = useState<ReminderSettings | null>(null);
  const [permission, setPermission] = useState<ReminderPermission>("unavailable");
  const [reminderBusy, setReminderBusy] = useState(false);
  const today = getLocalSupplementDateKey();

  const load = async () => {
    const response = await fetch("/api/user/supplements");
    if (!response.ok) {
      setError(await responseError(response, "Unable to load supplements."));
      return;
    }
    const data = await response.json();
    setPlans(data.plans);
    setDefinitions(data.definitions);
  };

  useEffect(() => { void load(); }, []);
  useEffect(() => {
    void fetch("/api/user/supplements/reminders").then(async (response) => response.ok ? setReminderSettings(await response.json()) : undefined).catch(() => undefined);
    void checkSupplementReminderPermission().then(setPermission);
  }, []);

  const active = plans.filter((plan) => plan.isActive);
  const archived = plans.filter((plan) => !plan.isActive);

  async function action(plan: Plan, actionName: "archive" | "restore") {
    setBusy(true);
    setError("");
    const response = await fetch(`/api/user/supplements/${plan.id}?action=${actionName}`, { method: "POST" });
    if (!response.ok) setError(await responseError(response, "Unable to update supplement plan."));
    setBusy(false);
    await load();
    if (response.ok) void reconcileSupplementReminders();
  }

  async function removePlan(plan: Plan) {
    setBusy(true);
    setError("");
    const response = await fetch(`/api/user/supplements/${plan.id}`, { method: "DELETE" });
    if (!response.ok) setError(await responseError(response, "Unable to delete this plan."));
    setBusy(false);
    await load();
    if (response.ok) void reconcileSupplementReminders();
  }

  async function toggleTake(plan: Plan) {
    if (takingPlanId) return;
    const completed = plan.logs.some((log) => log.scheduledFor.slice(0, 10) === today);
    setTakingPlanId(plan.id);
    setError("");
    const response = completed
      ? await fetch(`/api/user/supplements/${plan.id}/logs?scheduledDate=${encodeURIComponent(today)}`, { method: "DELETE" })
      : await createSupplementLogRequest(plan.id, today);

    if (!response.ok) {
      setError(await responseError(response, completed ? "Unable to undo this supplement." : "Unable to take this supplement."));
      setTakingPlanId(null);
      return;
    }

    setPlans((current) => current.map((currentPlan) => {
      if (currentPlan.id !== plan.id) return currentPlan;
      return completed
        ? { ...currentPlan, logs: currentPlan.logs.filter((log) => log.scheduledFor.slice(0, 10) !== today) }
        : { ...currentPlan, logs: [...currentPlan.logs, { scheduledFor: `${today}T00:00:00.000Z` }] };
    }));
    setTakingPlanId(null);
    await load();
    void reconcileSupplementReminders();
  }

  async function saveReminderSettings(update: Partial<ReminderSettings>) {
    const response = await fetch("/api/user/supplements/reminders", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...update, timezone: update.timezone ?? deviceTimeZone() }) });
    if (!response.ok) throw new Error(await responseError(response, "Unable to update reminder settings."));
    const settings = await response.json() as ReminderSettings;
    setReminderSettings(settings);
    return settings;
  }
  async function enableReminders() {
    setReminderBusy(true); setError("");
    const nextPermission = await requestSupplementReminderPermission(); setPermission(nextPermission);
    try {
      if (nextPermission !== "granted") { if (nextPermission === "denied") setError("Notifications are disabled for Calistheni. Enable them in iPhone Settings to receive supplement reminders."); return; }
      await saveReminderSettings({ enabled: true, timezone: deviceTimeZone() });
      void reconcileSupplementReminders();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to enable reminders."); } finally { setReminderBusy(false); }
  }
  async function disableReminders() { setReminderBusy(true); setError(""); try { await saveReminderSettings({ enabled: false }); await cancelAllSupplementReminders(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to disable reminders."); } finally { setReminderBusy(false); } }
  async function updateReminderTime(value: string) { const [hour, minute] = value.split(":").map(Number); if (!Number.isInteger(hour) || !Number.isInteger(minute)) return; setReminderBusy(true); try { await saveReminderSettings({ reminderHour: hour, reminderMinute: minute }); void reconcileSupplementReminders(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to update reminder time."); } finally { setReminderBusy(false); } }

  const dueToday = active.filter((plan) => isReminderPlanDueOn(plan, today, deviceTimeZone()));
  return <div className="space-y-6">
    <ReminderSettingsCard settings={reminderSettings} permission={permission} busy={reminderBusy} onEnable={enableReminders} onDisable={disableReminders} onTimeChange={updateReminderTime} />
    <section>
      <h2 className="mb-3 text-xl font-bold">Today</h2>
      <div className="grid gap-3">
        {dueToday.map((plan) => {
          const completed = plan.logs.some((log) => log.scheduledFor.slice(0, 10) === today);
          const pending = takingPlanId === plan.id;
          return <Card key={plan.id}><CardContent className="flex min-w-0 items-center gap-2 p-4">
            <div className="min-w-0 flex-1"><p className="truncate font-semibold">{plan.supplementDefinition?.name ?? plan.customName}</p><p className="text-sm text-muted-foreground">{plan.dosage?.toString() ?? ""} {plan.unit ?? ""} · {plan.preferredTime?.replaceAll("_", " ") ?? "Any time"}</p></div>
            <Button size="sm" disabled={pending} onClick={() => toggleTake(plan)}>{completed ? <><RotateCcw /> Undo</> : <><Check /> {pending ? "Taking…" : "Take"}</>}</Button>
            <Button size="icon-sm" variant="ghost" aria-label="Edit supplement" onClick={() => setEditing(plan)}><Pencil /></Button>
          </CardContent></Card>;
        })}
      </div>
    </section>
    <section><h2 className="mb-3 text-xl font-bold">Plans</h2><div className="grid gap-2">{active.map((plan) => <div key={plan.id} className="flex items-center gap-2 rounded-xl border p-3"><span className="min-w-0 flex-1 truncate">{plan.supplementDefinition?.name ?? plan.customName}</span><Button size="icon-sm" variant="ghost" aria-label="Edit plan" onClick={() => setEditing(plan)}><Pencil /></Button><Button size="icon-sm" variant="ghost" aria-label="Archive plan" disabled={busy} onClick={() => action(plan, "archive")}><Archive /></Button><Button size="icon-sm" variant="ghost" aria-label="Delete plan" disabled={busy} onClick={() => removePlan(plan)}><Trash2 /></Button></div>)}</div></section>
    <section><h2 className="mb-3 text-xl font-bold">Archived</h2>{archived.length ? <div className="grid gap-2">{archived.map((plan) => <div key={plan.id} className="flex items-center gap-2 rounded-xl border p-3"><span className="min-w-0 flex-1 truncate">{plan.supplementDefinition?.name ?? plan.customName}</span><Button size="sm" variant="outline" disabled={busy} onClick={() => action(plan, "restore")}>Restore</Button></div>)}</div> : <p className="text-sm text-muted-foreground">No archived plans.</p>}</section>
    <Button variant="outline" onClick={() => setEditing({ id: "", customName: "", dosage: null, unit: "g", frequency: "DAILY", weekdays: [], preferredTime: null, isActive: true, createdAt: new Date().toISOString(), archivedAt: null, supplementDefinition: null, logs: [] })}><Plus /> Add supplement</Button>
    {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
    <PlanDialog plan={editing} definitions={definitions} onClose={() => setEditing(null)} onSaved={async () => { setEditing(null); await load(); void reconcileSupplementReminders(); }} />
  </div>;
}

function ReminderSettingsCard({ settings, permission, busy, onEnable, onDisable, onTimeChange }: { settings: ReminderSettings | null; permission: ReminderPermission; busy: boolean; onEnable: () => void; onDisable: () => void; onTimeChange: (value: string) => void }) {
  const enabled = Boolean(settings?.enabled && permission === "granted");
  const time = `${String(settings?.reminderHour ?? 19).padStart(2, "0")}:${String(settings?.reminderMinute ?? 0).padStart(2, "0")}`;
  return <Card><CardContent className="grid gap-4 p-4"><div className="flex items-start gap-3"><div className="rounded-full bg-primary/10 p-2 text-primary">{enabled ? <BellRing /> : <Bell />}</div><div className="min-w-0 flex-1"><h2 className="font-semibold">Supplement reminders</h2><p className="text-sm text-muted-foreground">Remind me when today’s scheduled supplements are still untaken. Calistheni needs notification access to show this reminder while the app is closed.</p></div><Switch checked={enabled} disabled={busy || permission === "unavailable" || permission === "denied"} aria-label="Enable supplement reminders" onCheckedChange={(checked) => { if (checked) onEnable(); else onDisable(); }} /></div>
    {permission === "denied" ? <Alert className="border-destructive/50 text-destructive"><Bell /><AlertTitle>Notifications are disabled</AlertTitle><AlertDescription>Enable notifications for Calistheni in your device Settings to receive supplement reminders. The installed Capacitor version does not expose a general notification-settings deep link, so the app will not repeatedly request permission.</AlertDescription></Alert> : null}
    {permission === "unavailable" ? <p className="text-sm text-muted-foreground">Reminders are available in the Calistheni iPhone or Android app.</p> : null}
    {!enabled && permission !== "unavailable" && permission !== "denied" ? <Button onClick={onEnable} disabled={busy}>{busy ? "Enabling…" : "Enable reminders"}</Button> : null}
    <div className="grid gap-1"><Label htmlFor="supplement-reminder-time">Reminder time</Label><Input id="supplement-reminder-time" type="time" value={time} disabled={!enabled || busy} onChange={(event) => onTimeChange(event.target.value)} /><p className="text-xs text-muted-foreground">As-needed supplements are not included in automatic reminders.</p></div>
    <p className="text-xs text-muted-foreground">Supplement reminders are optional tracking tools and are not medical advice.</p>
  </CardContent></Card>;
}

function PlanDialog({ plan, definitions, onClose, onSaved }: { plan: Plan | null; definitions: Definition[]; onClose: () => void; onSaved: () => Promise<void> }) {
  const [name, setName] = useState(""); const [dose, setDose] = useState(""); const [frequency, setFrequency] = useState("DAILY"); const [weekdays, setWeekdays] = useState<number[]>([]); const [submitting, setSubmitting] = useState(false); const [error, setError] = useState("");
  useEffect(() => { if (plan) { setName(plan.supplementDefinition?.name ?? plan.customName ?? ""); setDose(plan.dosage?.toString() ?? ""); setFrequency(plan.frequency); setWeekdays(plan.weekdays); } }, [plan]);
  if (!plan) return null;
  const currentPlan = plan;
  async function save(event: React.FormEvent) { event.preventDefault(); if (frequency === "SELECTED_WEEKDAYS" && !weekdays.length) { setError("Choose at least one weekday."); return; } setSubmitting(true); const built = definitions.find((definition) => definition.name === name); const body = { supplementDefinitionId: built?.id ?? null, customName: built ? null : name, dosage: dose || null, unit: "g", frequency, weekdays }; const response = await fetch(currentPlan.id ? `/api/user/supplements/${currentPlan.id}` : "/api/user/supplements", { method: currentPlan.id ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); setSubmitting(false); if (!response.ok) { setError(await responseError(response, "Unable to save plan.")); return; } await onSaved(); }
  return <Dialog open onOpenChange={(open) => !open && onClose()}><DialogContent className="max-h-[90dvh] overflow-y-auto"><DialogHeader><DialogTitle>{currentPlan.id ? "Edit supplement" : "Add supplement"}</DialogTitle><DialogDescription>Choose a supplement, dosage, schedule, and preferred time.</DialogDescription></DialogHeader><form onSubmit={save} className="grid gap-3"><div><Label htmlFor="supplement-plan-name">Supplement</Label><Input id="supplement-plan-name" list="supplement-definitions" value={name} onChange={(event) => setName(event.target.value)} required /><datalist id="supplement-definitions">{definitions.map((definition) => <option key={definition.id} value={definition.name} />)}</datalist></div><div><Label htmlFor="supplement-plan-dose">Dosage</Label><Input id="supplement-plan-dose" type="number" min="0" step="0.01" inputMode="decimal" onKeyDown={(event) => { if (["e", "E", "+", "-"].includes(event.key)) event.preventDefault(); }} value={dose} onChange={(event) => setDose(event.target.value)} /></div><fieldset><legend className="mb-1 text-sm font-medium">Schedule</legend><select className="h-10 w-full rounded-lg border bg-background px-2" value={frequency} onChange={(event) => setFrequency(event.target.value)}><option value="DAILY">Daily</option><option value="SELECTED_WEEKDAYS">Selected weekdays</option><option value="AS_NEEDED">As needed</option></select>{frequency === "SELECTED_WEEKDAYS" ? <div className="mt-2 flex flex-wrap gap-2">{[1, 2, 3, 4, 5, 6, 7].map((day) => <Button type="button" size="sm" variant={weekdays.includes(day) ? "default" : "outline"} key={day} onClick={() => setWeekdays((current) => current.includes(day) ? current.filter((value) => value !== day) : [...current, day])}>{["M", "T", "W", "T", "F", "S", "S"][day - 1]}</Button>)}</div> : null}</fieldset>{error ? <p className="text-sm text-destructive">{error}</p> : null}<Button disabled={submitting}>{submitting ? "Saving…" : "Save plan"}</Button></form></DialogContent></Dialog>;
}
