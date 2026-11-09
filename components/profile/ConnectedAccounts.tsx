"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { signIn } from "next-auth/react";
import { Browser } from "@capacitor/browser";
import { Check, Link2, Loader2, Unlink } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { canUseNativeAppleAuth, performNativeAppleAuth } from "@/lib/native/apple-auth";
import { getNativePlatform, isNativeApp } from "@/lib/native/platform";

type AccountStatus = {
  google: boolean;
  apple: boolean;
  password: boolean;
  passwordVerified: boolean;
  recentAuthentication: boolean;
};

export function ConnectedAccounts() {
  const [status, setStatus] = useState<AccountStatus | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [reauthPassword, setReauthPassword] = useState("");

  const refresh = useCallback(async () => {
    const response = await fetch("/api/auth/accounts", { credentials: "include", cache: "no-store" });
    if (response.ok) setStatus((await response.json()) as AccountStatus);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/auth/accounts", {
      credentials: "include",
      cache: "no-store",
      signal: controller.signal,
    }).then(async (response) => {
      if (response.ok) setStatus((await response.json()) as AccountStatus);
    });
    return () => controller.abort();
  }, []);

  async function connect(provider: "google" | "apple") {
    setBusy(provider);
    try {
      if (provider === "apple" && canUseNativeAppleAuth()) {
        await performNativeAppleAuth("link");
        toast.success("Apple is connected.");
        await refresh();
        return;
      }
      if (provider === "google" && isNativeApp()) {
        const response = await fetch("/api/native-auth/attempt", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ platform: getNativePlatform() === "ios" ? "IOS" : "ANDROID", intent: "link", redirectTo: "/profile" }),
        });
        const result = (await response.json()) as { externalAuthUrl?: string; error?: string };
        if (!response.ok || !result.externalAuthUrl) throw new Error(result.error ?? "Unable to connect Google.");
        await Browser.open({ url: result.externalAuthUrl, presentationStyle: "fullscreen" });
        setBusy(null);
        return;
      }
      const response = await fetch("/api/auth/link/start", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error === "RECENT_AUTH_REQUIRED" ? "Sign in again before connecting another account." : result.error ?? "Unable to connect this account.");
      await signIn(provider, { redirectTo: "/profile" }, provider === "google" ? { prompt: "select_account" } : undefined);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to connect this account.");
      setBusy(null);
    }
  }

  async function disconnect(provider: "google" | "apple") {
    if (!window.confirm(`Disconnect ${provider === "google" ? "Google" : "Apple"}?`)) return;
    setBusy(`disconnect-${provider}`);
    try {
      const response = await fetch("/api/auth/accounts", {
        method: "DELETE",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error === "FINAL_LOGIN_METHOD" ? "Add another verified sign-in method before disconnecting this one." : result.error === "RECENT_AUTH_REQUIRED" ? "Sign in again before disconnecting an account." : "Unable to disconnect this account.");
      toast.success(`${provider === "google" ? "Google" : "Apple"} disconnected.`);
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to disconnect this account.");
    } finally {
      setBusy(null);
    }
  }

  async function reauthenticate() {
    setBusy("reauthenticate");
    try {
      if (status?.password && reauthPassword) {
        const response = await fetch("/api/auth/password/manage", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "reauthenticate", currentPassword: reauthPassword }),
        });
        const result = (await response.json()) as { error?: string };
        if (!response.ok) throw new Error(result.error ?? "Reauthentication failed.");
        setReauthPassword("");
        await refresh();
        toast.success("Identity confirmed.");
        return;
      }
      if (status?.apple && canUseNativeAppleAuth()) {
        const result = await performNativeAppleAuth("login");
        window.location.assign(result.redirectTo ?? "/profile");
        return;
      }
      if (status?.google && isNativeApp()) {
        const response = await fetch("/api/native-auth/attempt", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ platform: getNativePlatform() === "ios" ? "IOS" : "ANDROID", intent: "login", redirectTo: "/profile" }),
        });
        const result = (await response.json()) as { externalAuthUrl?: string; error?: string };
        if (!response.ok || !result.externalAuthUrl) throw new Error(result.error ?? "Reauthentication failed.");
        await Browser.open({ url: result.externalAuthUrl, presentationStyle: "fullscreen" });
        return;
      }
      const provider = status?.apple ? "apple" : "google";
      await signIn(provider, { redirectTo: "/profile" }, provider === "google" ? { prompt: "select_account" } : undefined);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Reauthentication failed.");
      setBusy(null);
    }
  }

  async function savePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy("password");
    const data = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/auth/password/manage", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: status?.password ? "change" : "add",
          currentPassword: data.get("currentPassword"),
          password: data.get("password"),
          confirmPassword: data.get("confirmPassword"),
        }),
      });
      const result = (await response.json()) as { error?: string; verificationRequired?: boolean };
      if (!response.ok) throw new Error(result.error === "RECENT_AUTH_REQUIRED" ? "Sign in again before changing sign-in methods." : result.error ?? "Unable to save the password.");
      toast.success(result.verificationRequired ? "Password added. Verify your email before using it to sign in." : "Password saved.");
      event.currentTarget.reset();
      setShowPassword(false);
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to save the password.");
    } finally {
      setBusy(null);
    }
  }

  if (!status) return <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />Loading connected accounts…</div>;

  const rows: Array<{ provider: "google" | "apple"; label: string; connected: boolean }> = [
    { provider: "google", label: "Google", connected: status.google },
    { provider: "apple", label: "Apple", connected: status.apple },
  ];
  return (
    <div className="space-y-4">
      {!status.recentAuthentication ? (
        <div className="space-y-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
          <p className="text-sm text-muted-foreground">For security, confirm your identity before connecting or removing a sign-in method.</p>
          {status.password ? <Input aria-label="Current password" type="password" autoComplete="current-password" placeholder="Current password" value={reauthPassword} onChange={(event) => setReauthPassword(event.target.value)} maxLength={1024} /> : null}
          <Button type="button" size="sm" variant="outline" disabled={busy !== null || (status.password && !reauthPassword)} onClick={() => void reauthenticate()}>
            {busy === "reauthenticate" ? <Loader2 className="size-4 animate-spin" /> : null}Confirm identity
          </Button>
        </div>
      ) : null}
      <div className="divide-y rounded-xl border">
        {rows.map((row) => (
          <div key={row.provider} className="flex min-w-0 items-center justify-between gap-3 p-4">
            <div className="min-w-0"><p className="font-medium">{row.label}</p><p className="text-sm text-muted-foreground">{row.connected ? "Connected" : "Not connected"}</p></div>
            {row.connected ? (
              <Button type="button" size="sm" variant="outline" disabled={busy !== null} onClick={() => void disconnect(row.provider)}>
                {busy === `disconnect-${row.provider}` ? <Loader2 className="size-4 animate-spin" /> : <Unlink className="size-4" />}Disconnect
              </Button>
            ) : (
              <Button type="button" size="sm" variant="outline" disabled={busy !== null} onClick={() => void connect(row.provider)}>
                {busy === row.provider ? <Loader2 className="size-4 animate-spin" /> : <Link2 className="size-4" />}Connect
              </Button>
            )}
          </div>
        ))}
        <div className="flex min-w-0 items-center justify-between gap-3 p-4">
          <div className="min-w-0"><p className="font-medium">Email &amp; Password</p><p className="text-sm text-muted-foreground">{status.password ? status.passwordVerified ? "Configured" : "Configured · verification required" : "Not configured"}</p></div>
          <Button type="button" size="sm" variant="outline" onClick={() => setShowPassword((value) => !value)}>{status.passwordVerified ? <Check className="size-4" /> : null}{status.password ? "Change" : "Add password"}</Button>
        </div>
      </div>
      {showPassword ? (
        <form className="space-y-3 rounded-xl border bg-muted/20 p-4" onSubmit={savePassword}>
          {status.password ? <div className="space-y-2"><Label htmlFor="currentPassword">Current password</Label><Input id="currentPassword" name="currentPassword" type="password" autoComplete="current-password" required maxLength={1024} /></div> : null}
          <div className="space-y-2"><Label htmlFor="newPassword">New password</Label><Input id="newPassword" name="password" type="password" autoComplete="new-password" required minLength={12} maxLength={1024} /></div>
          <div className="space-y-2"><Label htmlFor="confirmNewPassword">Confirm new password</Label><Input id="confirmNewPassword" name="confirmPassword" type="password" autoComplete="new-password" required maxLength={1024} /></div>
          <div className="flex flex-wrap gap-2"><Button type="submit" disabled={busy !== null}>{busy === "password" ? <Loader2 className="size-4 animate-spin" /> : null}Save password</Button><Button type="button" variant="ghost" onClick={() => setShowPassword(false)}>Cancel</Button></div>
        </form>
      ) : null}
    </div>
  );
}
