"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { DisplayNameInputs } from "@/components/profile/DisplayNameInputs";
import { Button } from "@/components/ui/button";
import { formatDisplayName, validateDisplayName, type DisplayNameErrors } from "@/lib/display-name";

export function ChangeDisplayName({
  currentName,
  initialFields,
}: {
  currentName: string | null;
  initialFields: { firstName: string; familyName: string; legacyName: boolean };
}) {
  const router = useRouter();
  const [name, setName] = useState(currentName);
  const [savedFields, setSavedFields] = useState(initialFields);
  const [fields, setFields] = useState(initialFields);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<DisplayNameErrors>({});
  const [error, setError] = useState("");

  async function saveName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setError("");
    const validated = validateDisplayName(fields.firstName, fields.familyName);
    if (!validated.ok) {
      setErrors(validated.errors);
      return;
    }

    setSaving(true);
    try {
      const response = await fetch("/api/user/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validated.fields),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || typeof payload?.name !== "string") {
        setErrors({ firstName: payload?.fieldErrors?.firstName?.[0], familyName: payload?.fieldErrors?.familyName?.[0] });
        throw new Error(payload?.error || "Unable to save your display name.");
      }
      setName(payload.name);
      setSavedFields({ ...validated.fields, legacyName: false });
      setOpen(false);
      toast.success("Display name updated.");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save your display name.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="space-y-3" aria-label="Displayed name">
      <p className="text-sm text-muted-foreground">
        Displayed name: <span className="break-words font-medium text-foreground">{name ?? "Not set"}</span>
      </p>
      {open ? (
        <form className="max-w-md space-y-3" onSubmit={saveName}>
          <DisplayNameInputs
            value={fields}
            errors={errors}
            legacyName={savedFields.legacyName}
            onChange={(field, value) => {
              setFields((previous) => ({ ...previous, [field]: value }));
              setErrors((previous) => ({ ...previous, [field]: undefined }));
              setError("");
            }}
          />
          <p className="text-sm text-muted-foreground">Shown on your profile and in the community as <strong className="break-words">{formatDisplayName(fields) || "—"}</strong>.</p>
          {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save displayed name"}</Button>
            <Button type="button" variant="ghost" disabled={saving} onClick={() => setOpen(false)}>Cancel</Button>
          </div>
        </form>
      ) : (
        <Button type="button" variant="outline" onClick={() => {
          setFields(savedFields);
          setErrors({});
          setError("");
          setOpen(true);
        }}>Change displayed name</Button>
      )}
    </section>
  );
}
