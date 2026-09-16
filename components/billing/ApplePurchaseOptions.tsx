"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Crown, RefreshCw, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { APPLE_PRO_PRODUCT_IDS } from "@/lib/apple-iap/products";
import {
  isAppleStoreKitAvailable,
  loadAppleStoreKitProducts,
  purchaseAppleProduct,
  restoreApplePurchases,
  type AppleStoreKitProduct,
} from "@/lib/native/apple-storekit";

const applePlans = [
  {
    productId: APPLE_PRO_PRODUCT_IDS.monthly,
    name: "Monthly Pro",
    cadence: "/ month",
    note: "Flexible recurring access.",
    features: ["Unlimited routines", "Unlimited custom exercises"],
    icon: Crown,
  },
  {
    productId: APPLE_PRO_PRODUCT_IDS.yearly,
    name: "Yearly Pro",
    cadence: "/ year",
    note: "One annual payment for the same Pro access.",
    features: ["Everything in Pro", "One annual payment"],
    icon: Sparkles,
  },
  {
    productId: APPLE_PRO_PRODUCT_IDS.lifetime,
    name: "Lifetime Pro",
    cadence: "once",
    note: "Paid once — no renewal.",
    features: ["Lifetime Pro access", "No recurring subscription"],
    icon: Crown,
  },
] as const;

type BusyAction = string | "restore" | null;

export function ApplePurchaseOptions({
  isPro,
  userKey,
}: {
  isPro: boolean;
  userKey: string | null;
}) {
  const router = useRouter();
  const [products, setProducts] = useState<AppleStoreKitProduct[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [busyAction, setBusyAction] = useState<BusyAction>(null);

  const productsById = useMemo(
    () => new Map(products.map((product) => [product.productId, product])),
    [products]
  );

  const loadProducts = useCallback(async () => {
    setLoadingProducts(true);
    setLoadError(false);
    try {
      if (!(await isAppleStoreKitAvailable())) throw new Error("unavailable");
      setProducts(await loadAppleStoreKitProducts());
    } catch (error) {
      console.warn("[apple-iap] Pro product load failed", {
        stage: "pro_page_retry",
        errorName: error instanceof Error ? error.name : "UnknownError",
        errorCode:
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          typeof error.code === "string"
            ? error.code
            : null,
      });
      setProducts([]);
      setLoadError(true);
    } finally {
      setLoadingProducts(false);
    }
  }, []);

  useEffect(() => {
    let disposed = false;
    void (async () => {
      try {
        if (!(await isAppleStoreKitAvailable())) throw new Error("unavailable");
        const loadedProducts = await loadAppleStoreKitProducts();
        if (!disposed) setProducts(loadedProducts);
      } catch (error) {
        if (!disposed) {
          console.warn("[apple-iap] Pro product load failed", {
            stage: "pro_page_initial",
            errorName: error instanceof Error ? error.name : "UnknownError",
            errorCode:
              typeof error === "object" &&
              error !== null &&
              "code" in error &&
              typeof error.code === "string"
                ? error.code
                : null,
          });
          setLoadError(true);
        }
      } finally {
        if (!disposed) setLoadingProducts(false);
      }
    })();
    return () => {
      disposed = true;
    };
  }, []);

  async function purchase(productId: string) {
    if (busyAction || isPro) return;
    if (!userKey) {
      toast.error("Sign in before choosing a Pro plan.", {
        action: { label: "Sign in", onClick: () => router.push("/login") },
      });
      return;
    }
    if (!productsById.has(productId)) {
      toast.error("This App Store product is unavailable right now.");
      return;
    }

    setBusyAction(productId);
    try {
      const result = await purchaseAppleProduct({ userKey, productId });
      if (result.outcome === "userCancelled") return;
      if (result.outcome === "pending") {
        toast.info("Your purchase is awaiting approval or confirmation.");
        return;
      }
      if (result.outcome === "unverified") {
        toast.error("Apple could not verify this purchase on the device.");
        return;
      }
      if (result.isPro) {
        toast.success("Calistheni Pro is active.");
      } else {
        toast.info(
          "The Sandbox purchase was synchronized for testing and does not grant Production Pro."
        );
      }
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Your Apple purchase is waiting to synchronize. It has not been lost."
      );
    } finally {
      setBusyAction(null);
    }
  }

  async function restore() {
    if (busyAction) return;
    if (!userKey) {
      toast.error("Sign in before restoring purchases.");
      return;
    }
    setBusyAction("restore");
    try {
      const result = await restoreApplePurchases(userKey);
      if (result.found === 0 && result.unverified === 0) {
        toast.info("No restorable Calistheni purchases were found.");
      } else if (result.synchronized === 0 && result.errors.length > 0) {
        throw result.errors[0];
      } else if (result.errors.length > 0 || result.unverified > 0) {
        toast.warning(
          "Some purchases could not be verified for this Calistheni account."
        );
      } else if (result.isPro) {
        toast.success("Your Calistheni Pro purchase was restored.");
      } else {
        toast.info(
          "Purchases were synchronized, but no Production Pro entitlement is active."
        );
      }
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Purchases could not be restored right now."
      );
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <div className="space-y-5">
      {loadError ||
      (!loadingProducts && products.length !== applePlans.length) ? (
        <div className="flex flex-col items-center justify-between gap-3 rounded-2xl border border-border/80 bg-card/75 p-4 text-center sm:flex-row sm:text-left">
          <p className="text-sm text-muted-foreground">
            Some App Store products are unavailable right now. No web checkout
            fallback is used inside the iOS app.
          </p>
          <Button variant="outline" onClick={() => void loadProducts()}>
            <RefreshCw className="size-4" aria-hidden="true" /> Retry
          </Button>
        </div>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-3">
        {applePlans.map((plan) => {
          const product = productsById.get(plan.productId);
          const Icon = plan.icon;
          const recommended = !isPro && plan.productId === APPLE_PRO_PRODUCT_IDS.yearly;
          const purchasing = busyAction === plan.productId;
          return (
            <article
              key={plan.productId}
              className={`relative flex min-w-0 flex-col rounded-3xl border bg-card/75 p-6 shadow-none sm:p-7 ${
                recommended
                  ? "border-primary/50 bg-primary/5 lg:-translate-y-3"
                  : "border-border/80"
              }`}
            >
              <div className="flex min-h-7 items-center justify-between gap-3">
                {recommended ? <Badge>Best value</Badge> : <span />}
                {isPro ? <Badge variant="secondary">Pro active</Badge> : null}
              </div>
              <span className="mt-6 flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Icon className="size-5" aria-hidden="true" />
              </span>
              <h2 className="mt-5 text-xl font-semibold">{plan.name}</h2>
              <div className="mt-4 flex min-h-10 flex-wrap items-end gap-x-2 gap-y-1">
                {loadingProducts ? (
                  <Skeleton className="h-10 w-28" />
                ) : (
                  <p className="text-4xl font-bold tracking-tight">
                    {product?.displayPrice ?? "Unavailable"}
                  </p>
                )}
                {product ? (
                  <p className="pb-1 text-sm text-muted-foreground">{plan.cadence}</p>
                ) : null}
              </div>
              <p className="mt-3 min-h-12 text-sm leading-6 text-muted-foreground">
                {plan.note}
              </p>
              <ul className="mt-6 space-y-3 border-t pt-5 text-sm">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-center gap-2.5">
                    <Check className="size-4 shrink-0 text-primary" aria-hidden="true" />
                    {feature}
                  </li>
                ))}
              </ul>
              <Button
                size="lg"
                variant={recommended ? "default" : "outline"}
                className="mt-8 min-h-11 w-full whitespace-normal"
                disabled={isPro || busyAction !== null || !product}
                onClick={() => void purchase(plan.productId)}
              >
                {isPro
                  ? "Included with your Pro access"
                  : purchasing
                    ? "Purchasing..."
                    : product
                      ? `Choose ${plan.name.replace(" Pro", "")}`
                      : "Unavailable"}
              </Button>
            </article>
          );
        })}
      </div>

      <div className="flex justify-center">
        <Button
          variant="ghost"
          disabled={busyAction !== null}
          onClick={() => void restore()}
        >
          <RefreshCw className={busyAction === "restore" ? "size-4 animate-spin" : "size-4"} aria-hidden="true" />
          {busyAction === "restore" ? "Restoring..." : "Restore Purchases"}
        </Button>
      </div>
    </div>
  );
}
