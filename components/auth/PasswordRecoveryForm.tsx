"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { submitPasswordRecoveryRequest } from "@/lib/auth/password-recovery-form";

export function PasswordRecoveryForm({ token }: { token?: string }) {
  const isReset = Boolean(token);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (token) window.history.replaceState(null, "", "/reset-password");
  }, [token]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setBusy(true);
    setError(null);
    const data = new FormData(form);
    const body = isReset
      ? { token, password: data.get("password"), confirmPassword: data.get("confirmPassword") }
      : { email: data.get("email") };
    try {
      setMessage(await submitPasswordRecoveryRequest({ form, isReset, body }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to complete this request.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="space-y-4" onSubmit={submit}>
      {isReset ? (
        <>
          <div className="space-y-2">
            <Label htmlFor="password">New password</Label>
            <Input id="password" name="password" type="password" autoComplete="new-password" minLength={12} maxLength={1024} required />
            <p className="text-xs text-muted-foreground">Use at least 12 characters.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Confirm new password</Label>
            <Input id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" maxLength={1024} required />
          </div>
        </>
      ) : (
        <div className="space-y-2">
          <Label htmlFor="email">Email address</Label>
          <Input id="email" name="email" type="email" inputMode="email" autoComplete="email" maxLength={320} required />
        </div>
      )}
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      {message ? <p role="status" className="rounded-lg border bg-muted/30 p-3 text-sm">{message}</p> : null}
      <Button className="w-full" type="submit" disabled={busy || (isReset && !token)}>
        {busy ? <Loader2 className="size-4 animate-spin" /> : null}
        {busy ? "Please wait…" : isReset ? "Reset Password" : "Send Reset Link"}
      </Button>
      <p className="text-center text-sm"><Link href="/login" className="text-primary hover:underline">Back to sign in</Link></p>
    </form>
  );
}
