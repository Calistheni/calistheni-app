"use client";

import { useCallback, useEffect, useState } from "react";
import { signIn, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Browser } from "@capacitor/browser";
import { AlertTriangle, Apple, Check, Loader2, Shield, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ManageSubscriptionButton } from "@/components/billing/ManageSubscriptionButton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { canUseNativeAppleAuth, performNativeAppleAuth } from "@/lib/native/apple-auth";
import { clearNativeSessionToken } from "@/lib/native/native-session-enrollment";
import { isNativeApp, getNativePlatform } from "@/lib/native/platform";
import { canUseAppleStoreKit, showAppleSubscriptionManagement } from "@/lib/native/apple-storekit";

const APPLE_SUBSCRIPTIONS_URL = "https://apps.apple.com/account/subscriptions";
const SUPPORT_EMAIL = "hello@calistheni.app";

type AccountStatus = {
  google: boolean;
  apple: boolean;
  password: boolean;
  passwordVerified: boolean;
  recentAuthentication: boolean;
};

export function AccountDeletionSection({ hasWebsiteSubscription }: { hasWebsiteSubscription: boolean }) {
  const router = useRouter();
  const [stage, setStage] = useState<"information" | "confirmation">("information");
  const [status, setStatus] = useState<AccountStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [statusError, setStatusError] = useState("");
  const [reauthPassword, setReauthPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [acknowledgedPermanent, setAcknowledgedPermanent] = useState(false);
  const [acknowledgedSubscriptions, setAcknowledgedSubscriptions] = useState(false);
  const [confirmation, setConfirmation] = useState("");

  const refreshStatus = useCallback(async () => {
    try {
      const response = await fetch("/api/auth/accounts", { credentials: "include", cache: "no-store" });
      if (!response.ok) {
        setStatusError(response.status === 401 ? "Your session has expired. Sign in again to continue." : "Unable to verify your sign-in status.");
        return null;
      }
      const nextStatus = await response.json() as AccountStatus;
      setStatus(nextStatus);
      setStatusError("");
      return nextStatus;
    } catch {
      setStatusError("Unable to verify your sign-in status. Check your connection and try again.");
      return null;
    } finally {
      setStatusLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => void refreshStatus());
    const onFocus = () => void refreshStatus();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [refreshStatus]);

  async function reauthenticateWithPassword() {
    if (!reauthPassword || busy) return;
    setBusy(true);
    try {
      const response = await fetch("/api/auth/password/manage", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reauthenticate", currentPassword: reauthPassword }),
      });
      if (!response.ok) throw new Error(response.status === 401 ? "The current password is incorrect." : "Password verification failed.");
      setReauthPassword("");
      const updated = await refreshStatus();
      if (updated?.recentAuthentication) toast.success("Your identity is verified for the next 10 minutes.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Password verification failed.");
    } finally {
      setBusy(false);
    }
  }

  async function reauthenticateWithProvider(provider: "google" | "apple") {
    if (busy) return;
    setBusy(true);
    try {
      if (provider === "apple" && canUseNativeAppleAuth()) {
        const result = await performNativeAppleAuth("login");
        window.location.assign(result.redirectTo ?? "/profile?accountDeletionReauth=1");
        return;
      }
      if (provider === "apple" && isNativeApp()) {
        throw new Error("Native Apple reauthentication is unavailable in this app version. Use another connected sign-in method, such as Google or your verified password.");
      }
      if (provider === "google" && isNativeApp()) {
        const response = await fetch("/api/native-auth/attempt", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            platform: getNativePlatform() === "ios" ? "IOS" : "ANDROID",
            intent: "login",
            redirectTo: "/profile?accountDeletionReauth=1",
          }),
        });
        const result = await response.json() as { externalAuthUrl?: string; error?: string };
        if (!response.ok || !result.externalAuthUrl) throw new Error("Unable to start Google reauthentication.");
        await Browser.open({ url: result.externalAuthUrl, presentationStyle: "fullscreen" });
        setBusy(false);
        return;
      }
      await signIn(provider, { redirectTo: "/profile?accountDeletionReauth=1" }, provider === "google" ? { prompt: "select_account" } : undefined);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to reauthenticate.");
      setBusy(false);
    }
  }

  async function manageAppleSubscription() {
    if (canUseAppleStoreKit()) {
      try {
        const result = await showAppleSubscriptionManagement();
        if (result.presented) return;
      } catch {
        // Keep the official web management link visible as the fallback.
      }
    }
    if (isNativeApp()) {
      try {
        await Browser.open({ url: APPLE_SUBSCRIPTIONS_URL, presentationStyle: "popover" });
      } catch {
        toast.error("Apple subscription settings could not be opened. Use the Apple subscription settings link below.");
      }
    } else {
      window.open(APPLE_SUBSCRIPTIONS_URL, "_blank", "noopener,noreferrer");
    }
  }

  async function submitDeletion() {
    if (busy || !status?.recentAuthentication || confirmation !== "DELETE_MY_ACCOUNT") return;
    setBusy(true);
    try {
      const response = await fetch("/api/account/deletion/request", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation: "DELETE_MY_ACCOUNT" }),
      });
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) {
        if (response.status === 401) throw new Error("Your session expired. Sign in again before requesting deletion.");
        if (payload.error === "RECENT_AUTH_REQUIRED") {
          await refreshStatus();
          throw new Error("Please verify your identity again. Recent authentication is required.");
        }
        if (payload.error === "EXPLICIT_CONFIRMATION_REQUIRED") throw new Error("Enter DELETE_MY_ACCOUNT exactly to confirm.");
        if (response.status === 409) throw new Error("A deletion request is already in progress or the account is unavailable.");
        throw new Error("We could not process the deletion request. Please try again.");
      }

      setDialogOpen(false);
      try { await signOut({ redirect: false }); } catch { /* The deletion endpoint already revoked server sessions. */ }
      try { await clearNativeSessionToken(); } catch { /* The native session is revoked server-side even if local keychain cleanup fails. */ }
      router.replace("/account-deleted");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "We could not process the deletion request.");
    } finally {
      setBusy(false);
    }
  }

  const canConfirm = Boolean(
    status?.recentAuthentication && acknowledgedPermanent && acknowledgedSubscriptions && confirmation === "DELETE_MY_ACCOUNT"
  );

  return (
    <Card className="mb-6 border-destructive/40" data-testid="account-deletion-section">
      <CardHeader>
        <div className="flex items-start gap-3">
          <div className="mt-0.5 rounded-full bg-destructive/10 p-2 text-destructive"><AlertTriangle className="size-5" aria-hidden="true" /></div>
          <div className="space-y-1">
            <h2 className="text-xl font-semibold text-destructive">Delete Account</h2>
            <p className="text-sm text-muted-foreground">Permanently deactivate your Calistheni account. Deleted accounts cannot be recovered.</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {stage === "information" ? (
          <>
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>Your account will become inaccessible immediately. Personal information will be deleted or anonymized within 30 days.</p>
              <p>If you register again later with the same email or sign-in method, Calistheni will create a new account. Your old workouts, progress, relationships, and purchases will not be restored or transferred.</p>
              <p>Approved anonymous community contributions may remain. Limited financial records may be retained where required for legitimate billing, accounting, tax, dispute, or fraud-prevention purposes.</p>
            </div>

            <section className="space-y-3 rounded-lg border border-amber-500/40 bg-amber-500/5 p-4" aria-labelledby="deletion-subscription-warning">
              <h3 id="deletion-subscription-warning" className="font-semibold">Subscriptions are not cancelled automatically</h3>
              <p className="whitespace-pre-line text-sm text-muted-foreground">{"Deleting your Calistheni account does not automatically cancel your subscriptions.\n\nIf you subscribed through our website, we recommend cancelling your subscription in your Calistheni billing settings before deleting your account.\n\nIf you subscribed through the Apple App Store, you can cancel your subscription through your Apple subscription settings before or after deleting your account.\n\nYou may continue to be charged until your subscription is cancelled."}</p>
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                {hasWebsiteSubscription ? <ManageSubscriptionButton variant="outline" label="Manage Website Subscription" /> : null}
                <Button type="button" variant="outline" onClick={() => void manageAppleSubscription()}><Apple aria-hidden="true" />Manage Apple Subscription</Button>
                <a className="inline-flex min-h-10 items-center justify-center rounded-md px-3 text-sm underline underline-offset-4" href={APPLE_SUBSCRIPTIONS_URL} target="_blank" rel="noreferrer">Open Apple subscription settings</a>
              </div>
              <p className="text-xs text-muted-foreground">Website billing portal access may no longer be available after deletion. Former website subscribers can contact <a className="underline underline-offset-4" href={`mailto:${SUPPORT_EMAIL}`}>support</a>; ownership will be verified before billing changes.</p>
            </section>
            <Button type="button" variant="destructive" className="w-full sm:w-auto" onClick={() => setStage("confirmation")}>
              Continue to Account Deletion
            </Button>
          </>
        ) : (
          <>
            <div className="rounded-lg border p-4 text-sm text-muted-foreground">
              <p className="font-medium text-foreground">Final confirmation</p>
              <p className="mt-1">This request deactivates the account now. Cleanup can take up to 30 days. Your subscriptions remain active until you cancel them separately.</p>
            </div>

            <div className="space-y-3 rounded-lg border p-4">
              <div className="flex items-center gap-2 text-sm font-medium"><Shield className="size-4" aria-hidden="true" />Verify your identity</div>
              {statusLoading ? <p className="text-sm text-muted-foreground">Checking your authentication…</p> : status?.recentAuthentication ? (
                <p className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400"><Check className="size-4" aria-hidden="true" />Recently authenticated. This verification expires after 10 minutes.</p>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">Reauthenticate with a connected method. Calistheni verifies this with the server before enabling deletion.</p>
                  {statusError ? <p role="alert" className="text-sm text-destructive">{statusError}</p> : null}
                  {status?.password && status.passwordVerified ? (
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <div className="min-w-0 flex-1 space-y-1"><Label htmlFor="deletion-current-password">Current password</Label><Input id="deletion-current-password" type="password" autoComplete="current-password" value={reauthPassword} onChange={(event) => setReauthPassword(event.target.value)} /></div>
                      <Button type="button" className="sm:mt-6" variant="outline" onClick={() => void reauthenticateWithPassword()} disabled={busy || !reauthPassword}>Verify password</Button>
                    </div>
                  ) : null}
                  {status?.google ? <Button type="button" variant="outline" disabled={busy} onClick={() => void reauthenticateWithProvider("google")}>Sign in with Google again</Button> : null}
                  {status?.apple ? <Button type="button" variant="outline" disabled={busy} onClick={() => void reauthenticateWithProvider("apple")}><Apple aria-hidden="true" />Sign in with Apple again</Button> : null}
                  {!status?.passwordVerified && !status?.google && !status?.apple ? <p className="text-sm text-destructive">No working reauthentication method is available. Contact support for help securing your account.</p> : null}
                  <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => void refreshStatus()}>{busy ? <Loader2 className="animate-spin" /> : null}Check authentication again</Button>
                </div>
              )}
            </div>

            <div className="space-y-4 rounded-lg border p-4">
              <div className="flex items-start gap-3"><Checkbox id="deletion-permanent" checked={acknowledgedPermanent} onCheckedChange={(checked) => setAcknowledgedPermanent(checked === true)} /><Label htmlFor="deletion-permanent" className="cursor-pointer leading-5">I understand account deletion is permanent and this account cannot be recovered.</Label></div>
              <div className="flex items-start gap-3"><Checkbox id="deletion-subscriptions" checked={acknowledgedSubscriptions} onCheckedChange={(checked) => setAcknowledgedSubscriptions(checked === true)} /><Label htmlFor="deletion-subscriptions" className="cursor-pointer leading-5">I understand deleting my account does not cancel my subscriptions.</Label></div>
              <div className="space-y-1"><Label htmlFor="deletion-confirmation">Type DELETE_MY_ACCOUNT to continue</Label><Input id="deletion-confirmation" autoCapitalize="characters" autoComplete="off" spellCheck={false} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></div>
            </div>

            {statusError ? <p role="alert" className="text-sm text-destructive">{statusError}</p> : null}
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button type="button" variant="outline" onClick={() => setStage("information")} disabled={busy}>Back</Button>
              <Button type="button" variant="destructive" disabled={!canConfirm || busy} onClick={() => setDialogOpen(true)}><Trash2 aria-hidden="true" />Review permanent deletion</Button>
            </div>
          </>
        )}

        <AlertDialog open={dialogOpen} onOpenChange={(open) => { if (!busy) setDialogOpen(open); }}>
          <AlertDialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-lg">
            <AlertDialogHeader>
              <AlertDialogTitle>Delete your Calistheni account permanently?</AlertDialogTitle>
              <AlertDialogDescription>Your account will be deactivated and your sessions revoked immediately. Personal-data cleanup may take up to 30 days. This does not cancel Apple or website subscriptions.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
              <AlertDialogAction disabled={!canConfirm || busy} onClick={(event) => { event.preventDefault(); void submitDeletion(); }}>
                {busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Trash2 aria-hidden="true" />}
                {busy ? "Submitting…" : "Delete Account"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
