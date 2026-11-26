"use client";

import { useState } from "react";
import Link from "next/link";
import { Browser } from "@capacitor/browser";
import { ManageSubscriptionButton } from "@/components/billing/ManageSubscriptionButton";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import type { AccountSubscriptionManagement } from "@/lib/billing-provider";
import { canUseAppleStoreKit, showAppleSubscriptionManagement } from "@/lib/native/apple-storekit";
import { isNativeApp } from "@/lib/native/platform";

const APPLE_SUBSCRIPTIONS_URL = "https://apps.apple.com/account/subscriptions";

export function DeletionSubscriptionAction({
  management,
  hasLifetime,
}: {
  management: AccountSubscriptionManagement;
  hasLifetime: boolean;
}) {
  const [stripeError, setStripeError] = useState<string | null>(null);
  const [appleError, setAppleError] = useState(false);
  const [openingApple, setOpeningApple] = useState(false);

  async function openAppleOnDevice() {
    if (openingApple) return;
    setOpeningApple(true);
    setAppleError(false);
    try {
      if (canUseAppleStoreKit()) {
        try {
          if ((await showAppleSubscriptionManagement()).presented) return;
        } catch {
          // Older builds can still use Apple's official subscription page.
        }
      }
      await Browser.open({ url: APPLE_SUBSCRIPTIONS_URL, presentationStyle: "popover" });
    } catch {
      setAppleError(true);
    } finally {
      setOpeningApple(false);
    }
  }

  const hasStripe = management.stripe !== "none";
  const stripeAction = hasStripe ? (
    <div className="space-y-2">
      <ManageSubscriptionButton
        variant="outline"
        label={
          management.apple ? "Website billing"
            : management.stripe === "uncertain" ? "Check website billing"
              : "Manage subscription"
        }
        onError={setStripeError}
      />
      {stripeError ? (
        <p role="alert" className="text-sm text-destructive">
          {stripeError} Try again or{" "}
          <a className="underline" href="mailto:hello@calistheni.app">contact billing support</a>.
        </p>
      ) : null}
    </div>
  ) : null;

  const appleAction = management.apple ? (
    <div className="space-y-2">
      <Button asChild variant="outline" aria-disabled={openingApple}>
        <a
          href={APPLE_SUBSCRIPTIONS_URL}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(event) => {
            if (!isNativeApp()) return;
            event.preventDefault();
            void openAppleOnDevice();
          }}
        >
          {openingApple ? "Opening subscriptions…" : hasStripe ? "Apple subscriptions" : "Manage subscription"}
        </a>
      </Button>
      {appleError ? (
        <p role="alert" className="text-sm text-destructive">
          Apple subscriptions could not be opened. On iPhone, go to Settings → your name → Subscriptions, or{" "}
          <a className="underline" href={APPLE_SUBSCRIPTIONS_URL} target="_blank" rel="noopener noreferrer">
            open Apple’s subscription page
          </a>.
        </p>
      ) : null}
    </div>
  ) : null;

  return (
    <div className="space-y-2">
      {hasLifetime ? <p className="text-sm text-muted-foreground">Lifetime Pro is paid once and does not renew.</p> : null}
      {management.stripe === "uncertain" ? (
        <p role="status" className="text-sm text-muted-foreground">
          We couldn’t confirm your website subscription status. Check website billing before deleting your account.
        </p>
      ) : null}
      {hasStripe && management.apple ? (
        <Dialog>
          <DialogTrigger asChild><Button type="button" variant="outline">Manage subscription</Button></DialogTrigger>
          <DialogContent>
            <DialogTitle>Manage subscriptions</DialogTitle>
            <DialogDescription>Check each provider separately before deleting your Calistheni account.</DialogDescription>
            {stripeAction}
            {appleAction}
          </DialogContent>
        </Dialog>
      ) : stripeAction ?? appleAction ?? (
        <Button asChild variant="outline"><Link href="/pro">View plans</Link></Button>
      )}
    </div>
  );
}
