"use client";

import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ChangePassword() {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  async function savePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;

    const form = event.currentTarget;
    const data = new FormData(form);
    setSaving(true);
    try {
      const response = await fetch("/api/auth/password/manage", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "change",
          currentPassword: data.get("currentPassword"),
          password: data.get("password"),
          confirmPassword: data.get("confirmPassword"),
        }),
      });
      if (!response.ok) {
        const result = await response.json().catch(() => null);
        throw new Error(
          typeof result?.error === "string" && result.error !== "UNAUTHORIZED"
            ? result.error
            : "Unable to change your password. Sign in again if your session expired."
        );
      }
      form.reset();
      setOpen(false);
      toast.success("Password changed.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to change your password.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="space-y-3" aria-label="Password">
      {open ? (
        <form className="max-w-md space-y-3" onSubmit={savePassword}>
          <div className="space-y-2">
            <Label htmlFor="change-current-password">Current password</Label>
            <Input id="change-current-password" name="currentPassword" type="password" autoComplete="current-password" required maxLength={1024} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="change-new-password">New password</Label>
            <Input id="change-new-password" name="password" type="password" autoComplete="new-password" required minLength={12} maxLength={1024} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="change-confirm-password">Confirm new password</Label>
            <Input id="change-confirm-password" name="confirmPassword" type="password" autoComplete="new-password" required maxLength={1024} />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save password"}</Button>
            <Button type="button" variant="ghost" disabled={saving} onClick={() => setOpen(false)}>Cancel</Button>
          </div>
        </form>
      ) : (
        <Button type="button" variant="outline" onClick={() => setOpen(true)}>Change password</Button>
      )}
    </section>
  );
}
