import type { HomeSupplementCompletion } from "@/lib/home-supplement-activity";

const SUPPLEMENT_ACTIVITY_EVENT = "calistheni:supplement-activity";

export type SupplementActivityChange =
  | { type: "completed"; completion: HomeSupplementCompletion }
  | { type: "removed"; planId: string; scheduledDate: string };

export function notifySupplementActivityChange(change: SupplementActivityChange) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(SUPPLEMENT_ACTIVITY_EVENT, { detail: change }));
}

export function subscribeToSupplementActivityChanges(
  listener: (change: SupplementActivityChange) => void
) {
  if (typeof window === "undefined") return () => undefined;
  const handle = (event: Event) => {
    listener((event as CustomEvent<SupplementActivityChange>).detail);
  };
  window.addEventListener(SUPPLEMENT_ACTIVITY_EVENT, handle);
  return () => window.removeEventListener(SUPPLEMENT_ACTIVITY_EVENT, handle);
}
