"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function PasswordAuthForm({
  mode,
  callbackUrl,
}: {
  mode: "login" | "register";
  callbackUrl?: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    const data = new FormData(event.currentTarget);
    const payload = {
      email: data.get("email"),
      password: data.get("password"),
      ...(mode === "register" ? { confirmPassword: data.get("confirmPassword") } : {}),
      ...(callbackUrl ? { redirectTo: callbackUrl } : {}),
    };
    try {
      const response = await fetch(`/api/auth/password/${mode}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = (await response.json()) as {
        error?: string;
        message?: string;
        redirectTo?: string;
      };
      if (!response.ok) throw new Error(result.error ?? "Authentication failed.");
      if (mode === "register") {
        setMessage(result.message ?? "Check your email to verify your account.");
      } else {
        router.push(result.redirectTo ?? "/home");
        router.refresh();
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Authentication failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="space-y-4" onSubmit={submit} noValidate>
      <div className="space-y-2">
        <Label htmlFor="email">Email address</Label>
        <Input id="email" name="email" type="email" inputMode="email" autoComplete="email" required maxLength={320} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete={mode === "register" ? "new-password" : "current-password"}
          required
          minLength={mode === "register" ? 12 : undefined}
          maxLength={1024}
        />
        {mode === "register" ? <p className="text-xs text-muted-foreground">Use at least 12 characters.</p> : null}
      </div>
      {mode === "register" ? (
        <div className="space-y-2">
          <Label htmlFor="confirmPassword">Confirm password</Label>
          <Input id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" required maxLength={1024} />
        </div>
      ) : null}
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      {message ? <p role="status" className="rounded-lg border bg-muted/30 p-3 text-sm">{message}</p> : null}
      <Button className="w-full" type="submit" disabled={busy}>
        {busy ? <Loader2 className="size-4 animate-spin" /> : null}
        {busy ? "Please wait…" : mode === "register" ? "Create Account" : "Sign In"}
      </Button>
      {mode === "login" ? (
        <div className="text-center text-sm">
          <Link className="text-primary underline-offset-4 hover:underline" href="/forgot-password">Forgot password?</Link>
        </div>
      ) : null}
    </form>
  );
}
