"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { App } from "@capacitor/app";
import Image from "next/image";
import Link from "next/link";
import {
  Barcode,
  ArrowLeft,
  Camera,
  CheckCircle2,
  Flashlight,
  ImagePlus,
  ListPlus,
  Loader2,
  Plus,
  Search,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FoodVisual } from "@/components/nutrition/FoodVisual";
import { NutritionMobileSheet } from "@/components/nutrition/NutritionMobileSheet";
import {
  canUseNativeLiveBarcodeScanner,
  getNativeBarcodeScannerAvailability,
  openNativeBarcodeSettings,
  signalNativeBarcodeSuccess,
  startNativeLiveBarcodeScanner,
  stopNativeLiveBarcodeScanner,
  toggleNativeBarcodeTorch,
  usesNativeBarcodeCameraLayer,
} from "@/lib/native/barcode-scanner";
import { compressWorkoutPhoto } from "@/lib/workout-photo-client";
import {
  rankNutritionFoodCandidates,
  selectNutritionFoodCandidate,
} from "@/lib/nutrition/search-ranking";

export type QuickMeal = "BREAKFAST" | "LUNCH" | "DINNER" | "SNACKS";
type Food = {
  id?: string;
  provider?: "USDA" | "OPEN_FOOD_FACTS";
  externalId?: string;
  name: string;
  brandName?: string | null;
  imageUrl?: string | null;
  genericIcon?: { url: string } | null;
  nutritionPer100g: Record<string, number | undefined>;
  servings?: Array<{
    name: string;
    quantity: number;
    grams: number;
    householdUnit?: string | null;
  }>;
};
type DraftItem = {
  key: string;
  food: Food & { id: string };
  grams: number;
  quantity: number;
  unit: string;
  confidence?: number;
};
type DescribeReviewItem =
  | { key: string; type: "resolved"; item: DraftItem }
  | {
      key: string;
      type: "unresolved";
      label: string;
      preparation: string | null;
      quantityText: string | null;
    };
type DescribeState =
  | { type: "input"; description: string }
  | { type: "loading"; description: string; action: "finding" | "logging" }
  | { type: "review"; description: string; items: DescribeReviewItem[] }
  | {
      type: "error";
      description: string;
      message: string;
      kind: "unavailable" | "no-foods" | "rate-limited";
    };
type Entry = Record<string, unknown>;
type AiQuota = { used: number; remaining: number; limit: number };
type AiLimits = { isPro: boolean; describe: AiQuota; aiScan?: AiQuota };
const mealLabel = (meal: QuickMeal) =>
  meal.charAt(0) + meal.slice(1).toLowerCase();
const number = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? value : 0;
const macrosFor = (food: Food, grams: number) => ({
  calories: (number(food.nutritionPer100g.caloriesKcal) * grams) / 100,
  protein: (number(food.nutritionPer100g.proteinGrams) * grams) / 100,
  carbs: (number(food.nutritionPer100g.carbohydrateGrams) * grams) / 100,
  fat: (number(food.nutritionPer100g.fatGrams) * grams) / 100,
});
const format = (value: number) =>
  Number.isInteger(value) ? String(value) : value.toFixed(1);

async function responseMessage(response: Response, fallback: string) {
  const body = await response.json().catch(() => null);
  return body?.error?.message ?? body?.error ?? fallback;
}
async function importFood(food: Food): Promise<Food & { id: string }> {
  if (food.id) return food as Food & { id: string };
  if (!food.provider || !food.externalId) throw new Error("This food cannot be logged yet.");
  const response = await fetch("/api/nutrition/foods/import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      provider: food.provider,
      externalId: food.externalId,
    }),
  });
  if (!response.ok)
    throw new Error(
      await responseMessage(response, "Unable to save this food.")
    );
  const imported = (await response.json()).food as Food & { id: string };
  return { ...food, ...imported, servings: imported.servings ?? food.servings };
}
async function searchCanonical(query: string) {
  const response = await fetch(
    `/api/nutrition/foods/search?q=${encodeURIComponent(query)}`
  );
  if (!response.ok) return [] as Food[];
  const data = await response.json();
  const candidates = (data.results ?? [
    ...(data.genericResults ?? []),
    ...(data.localResults ?? []),
    ...(data.packagedResults ?? []),
  ]) as Food[];
  return rankNutritionFoodCandidates(query, candidates) as Food[];
}
async function searchLocalCanonical(query: string) {
  const response = await fetch(
    `/api/nutrition/foods/search?q=${encodeURIComponent(query)}&localOnly=1`
  );
  if (!response.ok) return [] as Food[];
  const data = await response.json();
  return rankNutritionFoodCandidates(query, (data.results ?? []) as Food[]) as Food[];
}
async function resolveCanonicalFood(query: string) {
  const localMatch = selectNutritionFoodCandidate(
    query,
    await searchLocalCanonical(query)
  ) as Food | null;
  if (localMatch) return localMatch;
  return selectNutritionFoodCandidate(query, await searchCanonical(query)) as Food | null;
}
async function batchLog(meal: QuickMeal, date: string, items: DraftItem[]) {
  const response = await fetch("/api/nutrition/entries/batch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      date,
      mealCategory: meal,
      items: items.map((item) => ({
        foodId: item.food.id,
        gramsConsumed: item.grams * item.quantity,
        quantity: item.quantity,
        unit: item.unit,
      })),
    }),
  });
  if (!response.ok)
    throw new Error(await responseMessage(response, "Unable to add foods."));
  return (await response.json()).entries as Entry[];
}

type BarcodeDetectorLike = new (options: { formats: string[] }) => {
  detect(source: ImageBitmap): Promise<Array<{ rawValue: string }>>;
};
export async function detectBarcodesFromImage(file: File) {
  const Detector = (
    globalThis as unknown as { BarcodeDetector?: BarcodeDetectorLike }
  ).BarcodeDetector;
  if (Detector) {
    const bitmap = await createImageBitmap(file, {
      imageOrientation: "from-image",
    });
    try {
      return [
        ...new Set(
          (
            await new Detector({
              formats: ["ean_13", "ean_8", "upc_a", "upc_e"],
            }).detect(bitmap)
          )
            .map((result) => result.rawValue)
            .filter((value) => /^\d{8,14}$/.test(value))
        ),
      ];
    } finally {
      bitmap.close();
    }
  }
  const { BrowserMultiFormatReader } = await import("@zxing/browser");
  const url = URL.createObjectURL(file);
  try {
    const result = await new BrowserMultiFormatReader().decodeFromImageUrl(url);
    return /^\d{8,14}$/.test(result.getText()) ? [result.getText()] : [];
  } catch {
    return [];
  } finally {
    URL.revokeObjectURL(url);
  }
}

export type NutritionQuickActionCapabilities = {
  canUseAiScan: boolean;
  canUseBarcodeScan: boolean;
};

export function NutritionQuickActions({
  meal,
  date,
  onEntries,
  capabilities,
}: {
  meal: QuickMeal;
  date: string;
  onEntries: (entries: Entry[]) => void;
  capabilities: NutritionQuickActionCapabilities;
}) {
  const [workflow, setWorkflow] = useState<
    "barcode" | "ai" | "describe" | null
  >(null);
  const [upgradeFeature, setUpgradeFeature] = useState<"barcode" | "ai" | null>(
    null
  );
  const isLocked = (feature: "barcode" | "ai") =>
    feature === "barcode"
      ? !capabilities.canUseBarcodeScan
      : !capabilities.canUseAiScan;
  function open(feature: "barcode" | "ai" | "describe") {
    if (feature !== "describe" && isLocked(feature)) {
      setUpgradeFeature(feature);
      return;
    }
    setWorkflow(feature);
  }
  const upgradeCopy =
    upgradeFeature === "ai"
      ? {
          title: "AI Scan is a Pro feature",
          description:
            "Scan your meal with a photo and let Calistheni identify the foods for you.",
          icon: Sparkles,
        }
      : {
          title: "Barcode scanning is a Pro feature",
          description: "Quickly find packaged foods using their barcode.",
          icon: Barcode,
        };
  const UpgradeIcon = upgradeCopy.icon;
  return (
    <>
      <div className="grid grid-cols-3 gap-2">
        <Button
          className="min-w-0 gap-1 px-1 text-xs [&>svg]:size-3"
          variant="outline"
          size="sm"
          aria-label={isLocked("barcode") ? "Barcode, Pro feature" : "Barcode"}
          onClick={() => open("barcode")}
        >
          <Barcode />
          <span className="min-w-0 truncate">Barcode</span>
          {isLocked("barcode") ? (
            <Badge variant="secondary" className="h-4 shrink-0 px-1 text-[9px]">
              PRO
            </Badge>
          ) : null}
        </Button>
        <Button
          className="min-w-0 gap-1 px-1 text-xs [&>svg]:size-3"
          variant="outline"
          size="sm"
          aria-label={isLocked("ai") ? "AI Scan, Pro feature" : "AI Scan"}
          onClick={() => open("ai")}
        >
          <Camera />
          <span className="min-w-0 truncate">AI Scan</span>
          {isLocked("ai") ? (
            <Badge variant="secondary" className="h-4 shrink-0 px-1 text-[9px]">
              PRO
            </Badge>
          ) : null}
        </Button>
        <Button
          className="min-w-0 gap-1 px-1 text-xs [&>svg]:size-3"
          variant="outline"
          size="sm"
          aria-label="Describe meal"
          onClick={() => open("describe")}
        >
          <ListPlus />
          <span className="min-w-0 truncate">Describe</span>
        </Button>
      </div>
      <BarcodeWorkflow
        open={workflow === "barcode"}
        meal={meal}
        date={date}
        close={() => setWorkflow(null)}
        onEntries={onEntries}
      />
      <AiWorkflow
        open={workflow === "ai"}
        meal={meal}
        date={date}
        close={() => setWorkflow(null)}
        onEntries={onEntries}
      />
      <DescribeWorkflow
        open={workflow === "describe"}
        meal={meal}
        date={date}
        isPro={capabilities.canUseAiScan}
        close={() => setWorkflow(null)}
        onEntries={onEntries}
      />
      <Dialog
        open={upgradeFeature !== null}
        onOpenChange={(isOpen) => !isOpen && setUpgradeFeature(null)}
      >
        <DialogContent>
          <DialogHeader>
            <div className="mb-2 flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
              <UpgradeIcon />
            </div>
            <DialogTitle>{upgradeCopy.title}</DialogTitle>
            <DialogDescription>{upgradeCopy.description}</DialogDescription>
          </DialogHeader>
          <div className="flex gap-2">
            <Button asChild className="flex-1">
              <Link href="/pro">Upgrade to Pro</Link>
            </Button>
            <Button
              className="flex-1"
              variant="outline"
              onClick={() => setUpgradeFeature(null)}
            >
              Maybe later
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function AiQuotaStatus({
  open,
  feature,
}: {
  open: boolean;
  feature: "describe" | "aiScan";
}) {
  const [limits, setLimits] = useState<AiLimits | null>(null);
  useEffect(() => {
    if (!open) return;
    let active = true;
    void fetch("/api/user/nutrition/ai-limits", { cache: "no-store" })
      .then(async (response) =>
        response.ok ? (response.json() as Promise<AiLimits>) : null
      )
      .then((value) => {
        if (active) setLimits(value);
      })
      .catch(() => {
        if (active) setLimits(null);
      });
    return () => {
      active = false;
    };
  }, [feature, open]);
  const quota = feature === "describe" ? limits?.describe : limits?.aiScan;
  if (!quota) return null;
  return (
    <p className="text-xs text-muted-foreground">
      {limits?.isPro
        ? `${quota.used} / ${quota.limit} used today`
        : `${quota.remaining} / ${quota.limit} remaining today`}
    </p>
  );
}

function DailyQuotaDialog({
  open,
  onOpenChange,
  feature,
  isPro,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  feature: "describe" | "aiScan";
  isPro: boolean;
}) {
  const freeDescribe = feature === "describe" && !isPro;
  const title = freeDescribe
    ? "You've used today's free AI meal descriptions."
    : feature === "describe"
    ? "You've reached today's AI description limit."
    : "You've reached today's AI Scan limit.";
  const description = freeDescribe
    ? "Upgrade to Pro for 200 AI descriptions per day."
    : "Your quota resets tomorrow.";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {freeDescribe ? (
          <div className="flex gap-2">
            <Button asChild className="flex-1">
              <Link href="/pro">Upgrade to Pro</Link>
            </Button>
            <Button
              className="flex-1"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
          </div>
        ) : (
          <Button onClick={() => onOpenChange(false)}>OK</Button>
        )}
      </DialogContent>
    </Dialog>
  );
}

function BarcodeWorkflow({
  open,
  meal,
  date,
  close,
  onEntries,
}: {
  open: boolean;
  meal: QuickMeal;
  date: string;
  close: () => void;
  onEntries: (entries: Entry[]) => void;
}) {
  const [code, setCode] = useState("");
  const [detected, setDetected] = useState<string[]>([]);
  const [food, setFood] = useState<(Food & { id: string }) | null>(null);
  const [grams, setGrams] = useState(100);
  const [quantity, setQuantity] = useState(1);
  const [unit, setUnit] = useState("g");
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<"reading" | "looking" | null>(null);
  const [error, setError] = useState("");
  const [nativeScanner, setNativeScanner] = useState(false);
  const [manualMode, setManualMode] = useState(false);
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [scannerSessionVersion, setScannerSessionVersion] = useState(0);
  const scanLocked = useRef(false);
  const lookupRef = useRef<(value: string) => void>(() => undefined);
  const scannerSessionRef = useRef(0);
  const scannerActiveRef = useRef(false);
  const nativeAvailability = getNativeBarcodeScannerAvailability();
  const nativeRuntime = nativeAvailability.nativePlatform;
  // Native Barcode is intentionally live-only. Image decoding is retained for
  // desktop browsers, where the Capacitor camera bridge is unavailable.
  const allowPhotoFallback =
    !nativeRuntime;
  const liveScannerVisible =
    nativeScanner ||
    (open &&
      !food &&
      !error &&
      !manualMode &&
      !scanLocked.current &&
      nativeRuntime);
  const endNativeScannerSession = useCallback((reason: string) => {
    scannerActiveRef.current = false;
    scannerSessionRef.current += 1;
    setNativeScanner(false);
    return stopNativeLiveBarcodeScanner(reason);
  }, []);
  function reset() {
    scanLocked.current = false;
    setNativeScanner(false);
    setManualMode(false);
    setTorchAvailable(false);
    setTorchOn(false);
    setCode("");
    setDetected([]);
    setFood(null);
    setGrams(100);
    setQuantity(1);
    setUnit("g");
    setBusy(false);
    setPhase(null);
    setError("");
  }
  function restartNativeScanner() {
    void endNativeScannerSession("scan-again").finally(() => {
      scanLocked.current = false;
      setManualMode(false);
      setTorchAvailable(false);
      setTorchOn(false);
      setError("");
      setScannerSessionVersion((version) => version + 1);
    });
  }
  function dismiss() {
    void endNativeScannerSession("overlay-closed");
    reset();
    close();
  }
  useEffect(() => {
    lookupRef.current = (value) => {
      void lookup(value);
    };
  });
  useEffect(() => {
    if (process.env.NODE_ENV !== "development" || !open) return;
    console.info("[BarcodeScanner]", {
      platform: nativeAvailability.platform,
      isNativePlatform: nativeAvailability.nativePlatform,
      pluginName: nativeAvailability.pluginName,
      pluginAvailable: nativeAvailability.pluginAvailable,
    });
  }, [open, nativeAvailability.nativePlatform, nativeAvailability.platform, nativeAvailability.pluginAvailable, nativeAvailability.pluginName]);
  useEffect(() => {
    if (!open || !nativeRuntime) return;
    const sessionId = scannerSessionRef.current + 1;
    scannerSessionRef.current = sessionId;
    scannerActiveRef.current = true;
    if (process.env.NODE_ENV === "development") {
      console.info("[BarcodeScanner]", { event: "session created", sessionId });
    }
    let cancelled = false;
    const controller = new AbortController();
    void startNativeLiveBarcodeScanner((value) => {
      if (
        cancelled ||
        sessionId !== scannerSessionRef.current ||
        scanLocked.current
      ) {
        return;
      }
      scanLocked.current = true;
      void endNativeScannerSession("barcode-detected").then(() => {
        if (cancelled) return;
        void signalNativeBarcodeSuccess();
        setCode(value);
        lookupRef.current(value);
      });
    }, controller.signal).then((result) => {
      if (cancelled || sessionId !== scannerSessionRef.current) return;
      if (result.ok) {
        setTorchAvailable(result.torchAvailable);
        setNativeScanner(true);
        if (process.env.NODE_ENV === "development") {
          console.info("[BarcodeScanner]", {
            event: "capture session started",
            sessionId,
          });
        }
      } else if (result.reason === "denied") {
        scannerActiveRef.current = false;
        setError("Camera access is required to scan barcodes.");
      } else {
        scannerActiveRef.current = false;
        setError(
          result.detail ?? "Live barcode scanner failed to start."
        );
      }
    });
    return () => {
      cancelled = true;
      controller.abort();
      if (sessionId !== scannerSessionRef.current) return;
      void endNativeScannerSession("scanner-session-cleanup");
    };
  }, [open, nativeRuntime, scannerSessionVersion, endNativeScannerSession]);
  useEffect(() => {
    if (!open || !nativeRuntime) return;
    let handle: { remove: () => Promise<void> } | undefined;
    // Capacitor maps appStateChange(false) to iOS willResignActive, which also
    // fires for transient system overlays. Pause maps to didEnterBackground.
    void App.addListener("pause", () => {
      if (scannerActiveRef.current) {
        void endNativeScannerSession("app-background");
        setError("Scanner paused while Calistheni was in the background. Tap Scan again to restart.");
      }
    }).then((registered) => {
      handle = registered;
    });
    return () => {
      void handle?.remove();
    };
  }, [open, nativeRuntime, endNativeScannerSession]);
  async function lookup(value: string) {
    const barcode = value.replaceAll(/\s/g, "");
    if (!/^\d{8,14}$/.test(barcode))
      return setError("Enter a valid 8–14 digit UPC, EAN, or GTIN.");
    setBusy(true);
    setPhase("looking");
    setError("");
    try {
      const response = await fetch(`/api/nutrition/foods/barcode/${barcode}`);
      if (!response.ok)
        throw new Error(
          response.status === 404
            ? "We couldn't find a food for this barcode."
            : await responseMessage(response, "Barcode lookup failed.")
        );
      const data = await response.json();
      const match = await importFood(data.local ?? data.external);
      setFood(match);
      const defaultServing = match.servings?.[0];
      setGrams(defaultServing?.grams ?? 100);
      setQuantity(1);
      setUnit(defaultServing?.name.slice(0, 40) ?? "g");
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Barcode lookup failed."
      );
    } finally {
      setBusy(false);
      setPhase(null);
    }
  }
  async function photo(file?: File) {
    if (!file) return;
    setBusy(true);
    setPhase("reading");
    setError("");
    try {
      const values = await detectBarcodesFromImage(file);
      setDetected(values);
      if (values.length === 1) {
        setCode(values[0]);
        await lookup(values[0]);
      } else if (!values.length)
        setError(
          "No supported barcode was detected. Try another photo or enter it manually."
        );
    } catch {
      setError("The barcode image could not be read.");
    } finally {
      setBusy(false);
      setPhase(null);
    }
  }
  async function add() {
    if (!food || grams <= 0 || quantity <= 0 || busy) return;
    setBusy(true);
    try {
      const entries = await batchLog(meal, date, [
        { key: food.id, food, grams, quantity, unit },
      ]);
      onEntries(entries);
      dismiss();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Unable to add product."
      );
      setBusy(false);
    }
  }
  if (liveScannerVisible) {
    return (
      <Sheet open={open} onOpenChange={(value) => !value && dismiss()}>
        <SheetContent
          side="bottom"
          showCloseButton={false}
          className="native-barcode-scanner-sheet h-[100dvh] max-h-[100dvh] border-0 bg-transparent p-0 text-white shadow-none"
        >
          <SheetTitle className="sr-only">Scan barcode</SheetTitle>
          <SheetDescription className="sr-only">
            Align a food barcode inside the frame for automatic scanning.
          </SheetDescription>
          <div className="flex h-full min-h-0 flex-col bg-transparent">
            <div className="flex items-center justify-between px-4 pt-[max(1rem,env(safe-area-inset-top))]">
              <Button
                size="icon"
                variant="secondary"
                aria-label="Cancel barcode scan"
                onClick={dismiss}
              >
                <ArrowLeft />
              </Button>
              <p className="font-semibold">Scan</p>
              <span className="size-10" aria-hidden="true" />
            </div>
            <div className="flex min-h-0 flex-1 items-center justify-center p-6">
              <div className="relative aspect-[1.6/1] w-full max-w-sm overflow-hidden rounded-2xl border-2 border-white/90 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]">
                <span
                  className="absolute inset-x-4 top-1/2 h-0.5 animate-pulse bg-primary"
                  aria-hidden="true"
                />
              </div>
            </div>
            <div className="space-y-3 px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
              <p className="text-center text-sm font-medium">
                Align the barcode inside the frame
              </p>
              <div className="flex items-center justify-center gap-3">
                <Button
                  variant="secondary"
                  aria-label="Enter barcode manually"
                  onClick={() => {
                    void endNativeScannerSession("manual-entry");
                    setManualMode(true);
                  }}
                >
                  <Barcode />
                  Manual entry
                </Button>
                {torchAvailable ? (
                  <Button
                    variant="secondary"
                    aria-pressed={torchOn}
                    aria-label="Toggle flash"
                    onClick={() =>
                      void toggleNativeBarcodeTorch().then(({ enabled }) =>
                        setTorchOn(enabled)
                      )
                    }
                  >
                    <Flashlight />
                    Flash
                  </Button>
                ) : null}
              </div>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    );
  }
  const showNativeStartupError =
    nativeRuntime && Boolean(error) && !manualMode;
  return (
    <Sheet open={open} onOpenChange={(value) => !value && dismiss()}>
      <NutritionMobileSheet
        header={<SheetHeader>
          <SheetTitle>Barcode</SheetTitle>
          <SheetDescription>
            {nativeRuntime
              ? "Scan a barcode live with your camera. Manual entry is available if needed."
              : "Scan a barcode from a photo or enter the number manually."}
          </SheetDescription>
        </SheetHeader>}
        footer={
          food ? (
            <div className="flex gap-2">
              <Button className="flex-1" disabled={busy} onClick={() => void add()}>
                Add to {mealLabel(meal)}
              </Button>
              <Button variant="outline" onClick={dismiss}>
                Cancel
              </Button>
            </div>
          ) : undefined
        }
      >
        <div className="space-y-4">
          {showNativeStartupError ? (
            <>
              <Alert>
                <AlertTitle>
                  {error === "Camera access is required to scan barcodes."
                    ? "Camera access required"
                    : "Live barcode scanner failed to start"}
                </AlertTitle>
                <AlertDescription>
                  {error ||
                    "This installed app does not include the native live barcode scanner."}
                </AlertDescription>
              </Alert>
              <div className="flex flex-wrap gap-2">
                {error === "Camera access is required to scan barcodes." ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void openNativeBarcodeSettings()}
                  >
                    Open Settings
                  </Button>
                ) : null}
                <Button size="sm" variant="outline" onClick={restartNativeScanner}>
                  Try again
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    void endNativeScannerSession("manual-entry");
                    setManualMode(true);
                    setError("");
                  }}
                >
                  Enter manually
                </Button>
                <Button size="sm" variant="ghost" onClick={dismiss}>
                  Cancel
                </Button>
              </div>
            </>
          ) : phase === "looking" && scanLocked.current && !food ? (
            <div className="space-y-3 py-8 text-center">
              <CheckCircle2 className="mx-auto size-10 text-primary" aria-hidden="true" />
              <p className="font-medium">Barcode found</p>
              <p className="text-sm text-muted-foreground">Looking up product…</p>
            </div>
          ) : (
          <Tabs defaultValue="manual">
            <TabsList className="w-full">
              {allowPhotoFallback ? (
                <TabsTrigger value="photo">Scan / Photo</TabsTrigger>
              ) : null}
              <TabsTrigger value="manual">Enter manually</TabsTrigger>
            </TabsList>
            {allowPhotoFallback ? (
              <TabsContent value="photo">
                <div className="grid grid-cols-2 gap-2">
                  <Button asChild variant="outline">
                    <Label className="cursor-pointer justify-center">
                      <Camera />
                      Take photo
                      <Input
                        disabled={busy}
                        className="sr-only"
                        type="file"
                        accept="image/*"
                        capture="environment"
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          event.target.value = "";
                          void photo(file);
                        }}
                      />
                    </Label>
                  </Button>
                  <Button asChild variant="outline">
                    <Label className="cursor-pointer justify-center">
                      <ImagePlus />
                      Choose photo
                      <Input
                        disabled={busy}
                        className="sr-only"
                        type="file"
                        accept="image/*"
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          event.target.value = "";
                          void photo(file);
                        }}
                      />
                    </Label>
                  </Button>
                </div>
                {phase === "reading" ? (
                  <p className="mt-3 text-sm text-muted-foreground">
                    Reading barcode…
                  </p>
                ) : phase === "looking" ? (
                  <p className="mt-3 text-sm text-muted-foreground">
                    Looking up food…
                  </p>
                ) : null}
                {detected.length > 1 ? (
                  <div className="mt-3">
                    <p className="text-sm font-medium">
                      Choose a detected barcode
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {detected.map((value) => (
                        <Button
                          key={value}
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() => {
                            setCode(value);
                            void lookup(value);
                          }}
                        >
                          {value}
                        </Button>
                      ))}
                    </div>
                  </div>
                ) : null}
              </TabsContent>
            ) : null}
            <TabsContent value="manual">
              <Label htmlFor="manual-barcode">Barcode number</Label>
              <div className="mt-1 flex gap-2">
                <Input
                  id="manual-barcode"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={code}
                  onChange={(event) =>
                    setCode(event.target.value.replaceAll(/\D/g, ""))
                  }
                  placeholder="3017620422003"
                />
                <Button disabled={busy} onClick={() => void lookup(code)}>
                  {busy ? <Loader2 className="animate-spin" /> : <Search />}
                  Lookup
                </Button>
              </div>
              {phase === "looking" ? (
                <p className="mt-2 text-sm text-muted-foreground">
                  Looking up food…
                </p>
              ) : null}
            </TabsContent>
          </Tabs>
          )}
          {error && !showNativeStartupError ? (
            <>
              <Alert>
                <AlertTitle>Barcode unavailable</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
              {error === "Camera access is required to scan barcodes." &&
              canUseNativeLiveBarcodeScanner() &&
              !usesNativeBarcodeCameraLayer() ? (
                <p className="text-sm text-muted-foreground">
                  Enable Camera for Calistheni in iPhone Settings, then try
                  again.
                </p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                {error === "Camera access is required to scan barcodes." &&
                usesNativeBarcodeCameraLayer() ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void openNativeBarcodeSettings()}
                  >
                    Open Settings
                  </Button>
                ) : null}
                <Button size="sm" variant="outline" onClick={restartNativeScanner}>
                  {canUseNativeLiveBarcodeScanner() ? "Scan again" : "Try again"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    void endNativeScannerSession("manual-entry");
                    setManualMode(true);
                  }}
                >
                  Enter manually
                </Button>
                <Button size="sm" variant="ghost" onClick={dismiss}>
                  Search foods
                </Button>
              </div>
            </>
          ) : null}
          {food ? (
            <>
              <FoodAmountCard
                food={food}
                grams={grams}
                setGrams={setGrams}
                quantity={quantity}
                setQuantity={setQuantity}
                unit={unit}
                setUnit={setUnit}
              />
            </>
          ) : null}
        </div>
      </NutritionMobileSheet>
    </Sheet>
  );
}

function FoodAmountCard({
  food,
  grams,
  setGrams,
  quantity = 1,
  setQuantity,
  unit = "g",
  setUnit,
  remove,
  replace,
  edit,
  editing,
  confidence,
}: {
  food: Food;
  grams: number;
  setGrams: (value: number) => void;
  quantity?: number;
  setQuantity?: (value: number) => void;
  unit?: string;
  setUnit?: (value: string) => void;
  remove?: () => void;
  replace?: () => void;
  edit?: () => void;
  editing?: boolean;
  confidence?: number;
}) {
  const macro = macrosFor(food, grams * quantity);
  const showEditor = !edit || editing;
  return (
    <Card>
      <CardContent className="p-3">
        <div className="flex min-w-0 items-center gap-3">
          <FoodVisual
            imageUrl={food.imageUrl}
            iconPath={food.genericIcon?.url}
            name={food.name}
            size="sm"
          />
          <div className="min-w-0 flex-1">
            <p className="line-clamp-2 font-medium">{food.name}</p>
            {food.brandName ? (
              <p className="truncate text-xs text-muted-foreground">
                {food.brandName}
              </p>
            ) : null}
            {confidence !== undefined && confidence < 0.6 ? (
              <p className="text-xs text-amber-600">
                Low-confidence match — review carefully
              </p>
            ) : null}
          </div>
          {edit ? (
            <Button size="sm" variant="ghost" onClick={edit}>
              {editing ? "Done" : "Edit"}
            </Button>
          ) : null}
          {replace ? (
            <Button size="sm" variant="ghost" onClick={replace}>
              Replace
            </Button>
          ) : null}
          {remove ? (
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label={`Remove ${food.name}`}
              onClick={remove}
            >
              <Trash2 />
            </Button>
          ) : null}
        </div>
        {showEditor && food.servings?.length && setUnit ? (
          <Label className="mt-3 block">
            Serving
            <select
              className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm"
              value={unit}
              onChange={(event) => {
                const nextUnit = event.target.value;
                setUnit(nextUnit);
                const serving = food.servings?.find(
                  (candidate) => candidate.name.slice(0, 40) === nextUnit
                );
                if (serving) setGrams(serving.grams);
              }}
            >
              <option value="g">Custom grams</option>
              {food.servings.map((serving) => (
                <option
                  key={`${serving.name}:${serving.grams}`}
                  value={serving.name.slice(0, 40)}
                >
                  {serving.name} · {format(serving.grams)} g
                </option>
              ))}
            </select>
          </Label>
        ) : null}
        {showEditor ? (
          <div className="mt-3 grid grid-cols-2 gap-3">
            <Label>
              Amount (g)
              <Input
                type="number"
                min="1"
                max="10000"
                value={grams}
                onChange={(event) => {
                  setGrams(Number(event.target.value));
                  setUnit?.("g");
                }}
              />
            </Label>
            {setQuantity ? (
              <Label>
                Quantity
                <Input
                  type="number"
                  min="0.1"
                  max="100"
                  step="0.1"
                  value={quantity}
                  onChange={(event) => setQuantity(Number(event.target.value))}
                />
              </Label>
            ) : null}
          </div>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">
            {format(grams * quantity)} g
          </p>
        )}
        <p className="mt-2 text-xs text-muted-foreground">
          {format(macro.calories)} kcal · P {format(macro.protein)} · C{" "}
          {format(macro.carbs)} · F {format(macro.fat)}
        </p>
      </CardContent>
    </Card>
  );
}

function AiWorkflow({
  open,
  meal,
  date,
  close,
  onEntries,
}: {
  open: boolean;
  meal: QuickMeal;
  date: string;
  close: () => void;
  onEntries: (entries: Entry[]) => void;
}) {
  const [image, setImage] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [items, setItems] = useState<DraftItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [limitReached, setLimitReached] = useState(false);
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview]
  );
  function chooseImage(file?: File) {
    if (!file) return;
    if (preview) URL.revokeObjectURL(preview);
    setImage(file);
    setPreview(URL.createObjectURL(file));
    setItems([]);
    setError("");
  }
  function clearImage() {
    if (preview) URL.revokeObjectURL(preview);
    setImage(null);
    setPreview(null);
    setItems([]);
    setError("");
  }
  function reset() {
    if (preview) URL.revokeObjectURL(preview);
    setImage(null);
    setPreview(null);
    setDescription("");
    setItems([]);
    setBusy(false);
    setError("");
  }
  function dismiss() {
    reset();
    close();
  }
  async function analyze() {
    if (!image || busy) return setError("Take or choose a food photo first.");
    setBusy(true);
    setError("");
    try {
      const compressed = await compressWorkoutPhoto(image);
      if (compressed.size > 4 * 1024 * 1024)
        throw new Error("The compressed image is still larger than 4 MB.");
      const form = new FormData();
      form.set("image", compressed);
      form.set("description", description);
      const response = await fetch("/api/nutrition/ai-scan", {
        method: "POST",
        body: form,
      });
      if (!response.ok) {
        const failure = await response.json().catch(() => null);
        if (failure?.error === "DAILY_LIMIT_REACHED") {
          setLimitReached(true);
          return;
        }
        throw new Error(
          failure?.message ?? failure?.error?.message ?? "AI food scan failed."
        );
      }
      const result = await response.json();
      const resolved: DraftItem[] = [];
      const unresolved: string[] = [];
      for (const detected of result.foods) {
        const match = await resolveCanonicalFood(detected.label);
        if (!match) {
          unresolved.push(detected.label);
          continue;
        }
        try {
          const food = await importFood(match);
          resolved.push({
            key: crypto.randomUUID(),
            food,
            grams: detected.estimatedGrams,
            quantity: 1,
            unit: "g",
            confidence: detected.confidence,
          });
        } catch {
          unresolved.push(detected.label);
        }
      }
      setItems(resolved);
      if (unresolved.length)
        setError(
          `Choose matching foods manually for: ${unresolved.join(", ")}.`
        );
      if (!resolved.length && !unresolved.length)
        setError(
          "No foods were detected. Try another photo or add foods manually."
        );
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "AI food scan failed."
      );
    } finally {
      setBusy(false);
    }
  }
  async function confirm() {
    if (!items.length || busy)
      return setError("Add at least one reviewed food.");
    setBusy(true);
    try {
      onEntries(await batchLog(meal, date, items));
      dismiss();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to add scanned foods."
      );
      setBusy(false);
    }
  }
  return (
    <>
      <Sheet open={open} onOpenChange={(value) => !value && dismiss()}>
        <NutritionMobileSheet
          header={<SheetHeader>
            <SheetTitle>AI food scan</SheetTitle>
            <SheetDescription>
              Take or choose a photo of your food. You can add an optional
              description to improve the estimate.
            </SheetDescription>
            <AiQuotaStatus open={open} feature="aiScan" />
          </SheetHeader>}
          footer={items.length ? <Button className="w-full" disabled={busy} onClick={() => void confirm()}>Add {items.length} {items.length === 1 ? "food" : "foods"} to {mealLabel(meal)}</Button> : undefined}
        >
          <div className="space-y-4">
            <Alert>
              <Camera />
              <AlertTitle>Photo privacy</AlertTitle>
              <AlertDescription>
                Your photo is sent securely for food recognition and is not
                saved to your Calistheni profile. AI estimates can be
                inaccurate; review foods and portions before adding them.
              </AlertDescription>
            </Alert>
            {preview ? (
              <div className="relative h-[min(16rem,30dvh)] max-h-[30dvh] overflow-hidden rounded-xl bg-muted">
                <Image
                  src={preview}
                  alt="Selected meal"
                  fill
                  unoptimized
                  className="object-contain"
                />
                <Button
                  className="absolute right-2 top-2"
                  size="icon-sm"
                  variant="secondary"
                  aria-label="Remove image"
                  onClick={clearImage}
                >
                  <X />
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <Button asChild variant="outline">
                  <Label className="cursor-pointer justify-center">
                    <Camera />
                    Take photo
                    <Input
                      className="sr-only"
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        event.target.value = "";
                        chooseImage(file);
                      }}
                    />
                  </Label>
                </Button>
                <Button asChild variant="outline">
                  <Label className="cursor-pointer justify-center">
                    <ImagePlus />
                    Choose photo
                    <Input
                      className="sr-only"
                      type="file"
                      accept="image/*"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        event.target.value = "";
                        chooseImage(file);
                      }}
                    />
                  </Label>
                </Button>
              </div>
            )}
            <Label htmlFor="ai-description">Description (optional)</Label>
            <Input
              id="ai-description"
              value={description}
              maxLength={200}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="e.g. 2 eggs, toast and half an avocado"
            />
            <Button
              className="w-full"
              disabled={!image || busy}
              onClick={() => void analyze()}
            >
              {busy ? <Loader2 className="animate-spin" /> : <Camera />}
              {busy ? "Analyzing meal…" : "Analyze meal"}
            </Button>
            {error ? (
              <Alert>
                <AlertTitle>Review needed</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
            {items.length ? (
              <ReviewList items={items} setItems={setItems} />
            ) : null}
            <DraftSearch
              onFood={(food) =>
                setItems((current) => [
                  ...current,
                  {
                    key: crypto.randomUUID(),
                    food,
                    grams: 100,
                    quantity: 1,
                    unit: "g",
                  },
                ])
              }
            />
            {items.length ? (
              <>
                <MealTotal items={items} />
              </>
            ) : null}
          </div>
        </NutritionMobileSheet>
      </Sheet>
      <DailyQuotaDialog
        open={limitReached}
        onOpenChange={setLimitReached}
        feature="aiScan"
        isPro
      />
    </>
  );
}

function DescribeWorkflow({
  open,
  meal,
  date,
  isPro,
  close,
  onEntries,
}: {
  open: boolean;
  meal: QuickMeal;
  date: string;
  isPro: boolean;
  close: () => void;
  onEntries: (entries: Entry[]) => void;
}) {
  const [state, setState] = useState<DescribeState>({
    type: "input",
    description: "",
  });
  const [choosingKey, setChoosingKey] = useState<string | null>(null);
  const [reviewNotice, setReviewNotice] = useState("");
  const [limitReached, setLimitReached] = useState(false);
  const description = state.description;
  const isBusy = state.type === "loading";
  const reviewItems = state.type === "review" ? state.items : [];
  const resolvedItems = reviewItems.flatMap((item) =>
    item.type === "resolved" ? [item.item] : []
  );

  function dismiss() {
    setState({ type: "input", description: "" });
    setChoosingKey(null);
    setReviewNotice("");
    close();
  }
  function setDescription(value: string) {
    setState((current) => ({ ...current, description: value }));
  }
  function updateReviewItems(
    update: (items: DescribeReviewItem[]) => DescribeReviewItem[]
  ) {
    setState((current) =>
      current.type === "review"
        ? { ...current, items: update(current.items) }
        : current
    );
  }
  function setResolvedItems(
    update: DraftItem[] | ((items: DraftItem[]) => DraftItem[])
  ) {
    updateReviewItems((current) => {
      const existing = current.flatMap((item) =>
        item.type === "resolved" ? [item.item] : []
      );
      const next = typeof update === "function" ? update(existing) : update;
      const byKey = new Map(next.map((item) => [item.key, item]));
      return current.reduce<DescribeReviewItem[]>((nextItems, item) => {
        if (item.type === "unresolved") nextItems.push(item);
        else if (byKey.has(item.item.key))
          nextItems.push({ ...item, item: byKey.get(item.item.key)! });
        return nextItems;
      }, []);
    });
  }
  function draftForDetected(
    food: Food & { id: string },
    detected: { estimatedGrams?: number | null; quantityText?: string | null }
  ) {
    const serving = food.servings?.[0];
    const quantityHint = Number(
      String(detected.quantityText ?? "").match(/^\s*(\d+(?:\.\d+)?)/)?.[1] ?? 1
    );
    const usesServingHint =
      detected.estimatedGrams == null &&
      serving &&
      Number.isFinite(quantityHint) &&
      quantityHint > 0;
    return {
      key: crypto.randomUUID(),
      food,
      grams: detected.estimatedGrams ?? serving?.grams ?? 100,
      quantity: usesServingHint ? quantityHint : 1,
      unit: usesServingHint ? serving.name.slice(0, 40) : "g",
    };
  }
  async function findFoods() {
    const text = description.trim();
    if (!text || isBusy) return;
    setState({ type: "loading", description, action: "finding" });
    setReviewNotice("");
    try {
      const response = await fetch("/api/nutrition/describe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: text }),
      });
      if (!response.ok) {
        const failure = await response.json().catch(() => null);
        if (failure?.error === "DAILY_LIMIT_REACHED") {
          setLimitReached(true);
          setState({ type: "input", description });
          return;
        }
        const message =
          failure?.message ??
          failure?.error?.message ??
          failure?.error ??
          "Meal descriptions are temporarily unavailable. You can still add foods manually.";
        setState({
          type: "error",
          description,
          message:
            response.status === 429
              ? "You've used Describe several times recently. Try again shortly."
              : message,
          kind:
            response.status === 429
              ? "rate-limited"
              : response.status === 502
              ? "no-foods"
              : "unavailable",
        });
        return;
      }
      const result = (await response.json()) as {
        foods?: Array<{
          label: string;
          preparation?: string | null;
          estimatedGrams?: number | null;
          quantityText?: string | null;
          confidence?: number | null;
          food?: Food | null;
        }>;
      };
      const items: DescribeReviewItem[] = (result.foods ?? []).map((detected) => {
        if (detected.food?.id) {
          return {
            key: crypto.randomUUID(),
            type: "resolved",
            item: draftForDetected(detected.food as Food & { id: string }, detected),
          };
        }
        return {
          key: crypto.randomUUID(),
          type: "unresolved",
          label: detected.label,
          preparation: detected.preparation ?? null,
          quantityText: detected.quantityText ?? null,
        };
      });
      if (!items.length) {
        setState({
          type: "error",
          description,
          message:
            "We couldn't identify any foods. Try describing the meal differently.",
          kind: "no-foods",
        });
        return;
      }
      setState({ type: "review", description, items });
    } catch {
      setState({
        type: "error",
        description,
        message:
          "Meal descriptions are temporarily unavailable. You can still add foods manually.",
        kind: "unavailable",
      });
    }
  }
  async function confirm() {
    if (isBusy) return;
    if (reviewItems.some((item) => item.type === "unresolved")) {
      setReviewNotice(
        "Choose a matching food or remove every item that needs review before adding this meal."
      );
      return;
    }
    if (!resolvedItems.length) {
      setReviewNotice("Add at least one reviewed food.");
      return;
    }
    setState({ type: "loading", description, action: "logging" });
    try {
      onEntries(await batchLog(meal, date, resolvedItems));
      dismiss();
    } catch (reason) {
      setState({ type: "review", description, items: reviewItems });
      setReviewNotice(
        reason instanceof Error ? reason.message : "Unable to add meal."
      );
    }
  }
  function addManualFood(food: Food & { id: string }) {
    updateReviewItems((current) => [
      ...current,
      {
        key: crypto.randomUUID(),
        type: "resolved",
        item: {
          key: crypto.randomUUID(),
          food,
          grams: 100,
          quantity: 1,
          unit: "g",
        },
      },
    ]);
  }
  function chooseMatch(key: string, food: Food & { id: string }) {
    updateReviewItems((current) =>
      current.map((item) =>
        item.key === key
          ? {
              key: item.key,
              type: "resolved",
              item: {
                key: crypto.randomUUID(),
                food,
                grams: 100,
                quantity: 1,
                unit: "g",
              },
            }
          : item
      )
    );
    setChoosingKey(null);
  }
  const review = state.type === "review";
  return (
    <>
      <Sheet open={open} onOpenChange={(value) => !value && dismiss()}>
        <NutritionMobileSheet
          header={<SheetHeader>
            <SheetTitle>
              {review ? "Review meal" : "Describe your meal"}
            </SheetTitle>
            <SheetDescription>
              {review
                ? "Check the foods and portions before adding them."
                : "Tell us what you ate and we'll find the foods for you."}
            </SheetDescription>
            {!review ? <AiQuotaStatus open={open} feature="describe" /> : null}
          </SheetHeader>}
          footer={review && resolvedItems.length ? <Button className="w-full" disabled={isBusy} onClick={() => void confirm()}>{isBusy ? <Loader2 className="animate-spin" /> : null}Add {resolvedItems.length} {resolvedItems.length === 1 ? "food" : "foods"} to {mealLabel(meal)}</Button> : undefined}
        >
          <div className="space-y-4">
            {!review ? (
              <form
                className="space-y-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  void findFoods();
                }}
              >
                <Label htmlFor="nutrition-description">
                  Describe what you ate
                </Label>
                <Input
                  id="nutrition-description"
                  value={description}
                  maxLength={250}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="e.g. salmon with potatoes"
                />
                <p
                  className={`text-right text-xs ${
                    description.length >= 220
                      ? "text-amber-600"
                      : "text-muted-foreground"
                  }`}
                >
                  {description.length} / 250
                </p>
                <Button
                  className="w-full"
                  type="submit"
                  disabled={isBusy || !description.trim()}
                >
                  {isBusy ? <Loader2 className="animate-spin" /> : <Search />}
                  {isBusy
                    ? state.action === "logging"
                      ? "Adding foods…"
                      : "Finding foods…"
                    : "Find foods"}
                </Button>
              </form>
            ) : null}
            {state.type === "error" ? (
              <>
                <Alert>
                  <AlertTitle>
                    {state.kind === "unavailable"
                      ? "Meal descriptions unavailable"
                      : state.kind === "rate-limited"
                      ? "Try again shortly"
                      : "No foods found"}
                  </AlertTitle>
                  <AlertDescription>{state.message}</AlertDescription>
                </Alert>
                <div className="flex gap-2">
                  <Button className="flex-1" onClick={() => void findFoods()}>
                    Try again
                  </Button>
                  <Button
                    className="flex-1"
                    variant="outline"
                    onClick={() =>
                      setState({ type: "review", description, items: [] })
                    }
                  >
                    Add foods manually
                  </Button>
                </div>
              </>
            ) : null}
            {review ? (
              <>
                <Alert>
                  <AlertTitle>We found</AlertTitle>
                  <AlertDescription>
                    AI estimates can be inaccurate. Review foods and portions
                    before adding them.
                  </AlertDescription>
                </Alert>
                <ReviewList items={resolvedItems} setItems={setResolvedItems} />
                {reviewItems
                  .filter(
                    (
                      item
                    ): item is Extract<
                      DescribeReviewItem,
                      { type: "unresolved" }
                    > => item.type === "unresolved"
                  )
                  .map((item) => (
                    <Card key={item.key}>
                      <CardContent className="space-y-2 p-3">
                        <div>
                          <p className="font-medium">{item.label}</p>
                          <p className="text-sm text-muted-foreground">
                            Needs review · No matching food selected
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setChoosingKey(item.key)}
                          >
                            Choose matching food
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive"
                            onClick={() =>
                              updateReviewItems((current) =>
                                current.filter(
                                  (candidate) => candidate.key !== item.key
                                )
                              )
                            }
                          >
                            Remove
                          </Button>
                        </div>
                        {choosingKey === item.key ? (
                          <div className="rounded-lg border p-2">
                            <DraftSearch
                              onFood={(food) => chooseMatch(item.key, food)}
                            />
                          </div>
                        ) : null}
                      </CardContent>
                    </Card>
                  ))}
                <DraftSearch onFood={addManualFood} />
                {reviewNotice ? (
                  <Alert>
                    <AlertTitle>Review needed</AlertTitle>
                    <AlertDescription>{reviewNotice}</AlertDescription>
                  </Alert>
                ) : null}
                {resolvedItems.length ? (
                  <>
                    <MealTotal items={resolvedItems} />
                  </>
                ) : null}
              </>
            ) : null}
          </div>
        </NutritionMobileSheet>
      </Sheet>
      <DailyQuotaDialog
        open={limitReached}
        onOpenChange={setLimitReached}
        feature="describe"
        isPro={isPro}
      />
    </>
  );
}

function DraftSearch({
  onFood,
}: {
  onFood: (food: Food & { id: string }) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Food[]>([]);
  const [busy, setBusy] = useState(false);
  const request = useRef(0);
  async function search() {
    if (query.trim().length < 2 || busy) return;
    const id = ++request.current;
    setBusy(true);
    const matches = await searchCanonical(query.trim());
    if (id === request.current) {
      setResults(matches);
      setBusy(false);
    }
  }
  async function select(food: Food) {
    setBusy(true);
    try {
      onFood(await importFood(food));
      setQuery("");
      setResults([]);
    } catch (reason) {
      toast.error(
        reason instanceof Error ? reason.message : "Unable to select food."
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div>
      <Label htmlFor="draft-food-search">Add food</Label>
      <div className="mt-1 flex gap-2">
        <Input
          id="draft-food-search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search foods"
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void search();
            }
          }}
        />
        <Button
          variant="outline"
          disabled={busy || query.trim().length < 2}
          onClick={() => void search()}
        >
          {busy ? <Loader2 className="animate-spin" /> : <Plus />}
        </Button>
      </div>
      {results.length ? (
        <div className="mt-2 max-h-52 space-y-1 overflow-y-auto rounded-lg border p-1">
          {results.slice(0, 10).map((food) => (
            <button
              key={`${food.id ? "local" : food.provider}:${
                food.id ?? food.externalId
              }`}
              className="flex w-full min-w-0 items-center gap-2 rounded-md p-2 text-left hover:bg-muted"
              onClick={() => void select(food)}
            >
              <FoodVisual
                imageUrl={food.imageUrl}
                iconPath={food.genericIcon?.url}
                name={food.name}
                size="sm"
              />
              <span className="line-clamp-2 min-w-0 text-sm font-medium">
                {food.name}
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
function ReviewList({
  items,
  setItems,
}: {
  items: DraftItem[];
  setItems: (
    items: DraftItem[] | ((items: DraftItem[]) => DraftItem[])
  ) => void;
}) {
  const [replaceKey, setReplaceKey] = useState<string | null>(null);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  return (
    <div className="space-y-2">
      {items.map((item) => (
        <div key={item.key}>
          <FoodAmountCard
            food={item.food}
            grams={item.grams}
            quantity={item.quantity}
            unit={item.unit}
            confidence={item.confidence}
            editing={editingKey === item.key}
            edit={() =>
              setEditingKey((current) =>
                current === item.key ? null : item.key
              )
            }
            setGrams={(grams) =>
              setItems((current) =>
                current.map((candidate) =>
                  candidate.key === item.key
                    ? { ...candidate, grams }
                    : candidate
                )
              )
            }
            setQuantity={(quantity) =>
              setItems((current) =>
                current.map((candidate) =>
                  candidate.key === item.key
                    ? { ...candidate, quantity }
                    : candidate
                )
              )
            }
            setUnit={(unit) =>
              setItems((current) =>
                current.map((candidate) =>
                  candidate.key === item.key
                    ? { ...candidate, unit }
                    : candidate
                )
              )
            }
            replace={() => setReplaceKey(item.key)}
            remove={() =>
              setItems((current) =>
                current.filter((candidate) => candidate.key !== item.key)
              )
            }
          />
          {replaceKey === item.key ? (
            <div className="mt-2 rounded-lg border p-2">
              <DraftSearch
                onFood={(food) => {
                  setItems((current) =>
                    current.map((candidate) =>
                      candidate.key === item.key
                        ? {
                            ...candidate,
                            food,
                            grams: 100,
                            quantity: 1,
                            unit: "g",
                            confidence: undefined,
                          }
                        : candidate
                    )
                  );
                  setReplaceKey(null);
                  setEditingKey(item.key);
                }}
              />
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}
function MealTotal({ items }: { items: DraftItem[] }) {
  const total = useMemo(
    () =>
      items.reduce(
        (sum, item) => {
          const macro = macrosFor(item.food, item.grams * item.quantity);
          return {
            calories: sum.calories + macro.calories,
            protein: sum.protein + macro.protein,
            carbs: sum.carbs + macro.carbs,
            fat: sum.fat + macro.fat,
          };
        },
        { calories: 0, protein: 0, carbs: 0, fat: 0 }
      ),
    [items]
  );
  return (
    <Card>
      <CardContent className="p-3">
        <p className="font-medium">Meal total</p>
        <p className="text-sm text-muted-foreground">
          {format(total.calories)} kcal · P {format(total.protein)} · C{" "}
          {format(total.carbs)} · F {format(total.fat)}
        </p>
      </CardContent>
    </Card>
  );
}
