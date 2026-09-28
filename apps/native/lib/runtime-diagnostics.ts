import type { NativePrimaryHref } from "./navigation";

export type NativeNavigationDiagnostic = {
  at: string;
  from: NativePrimaryHref;
  requested: NativePrimaryHref;
  activeSurfaceBefore: NativePrimaryHref;
  activeSurfaceAfter: NativePrimaryHref;
  pathnameBefore: string;
  pathnameAfter: string;
  hrefBefore: string;
  hrefAfter: string;
  generation: number;
};

const navigationEvents: NativeNavigationDiagnostic[] = [];
export type NativeAuthDiagnostic = {
  at: string;
  stage: string;
  detail?: string;
};
const authEvents: NativeAuthDiagnostic[] = [];

export function recordNativeNavigation(event: Omit<NativeNavigationDiagnostic, "at">) {
  if (process.env.NEXT_PUBLIC_CALISTHENI_NATIVE_DIAGNOSTICS !== "1") return;
  const entry = { ...event, at: new Date().toISOString() };
  navigationEvents.push(entry);
  if (navigationEvents.length > 12) navigationEvents.shift();
  console.info("[NativeNav]", entry);
  window.dispatchEvent(new CustomEvent("calistheni:native-diagnostics"));
}

export function getNativeNavigationDiagnostics() {
  return navigationEvents.slice();
}

/** Records only coarse stages/categories. Credentials and callback URLs never enter this store. */
export function recordNativeAuth(stage: string, detail?: string) {
  if (process.env.NEXT_PUBLIC_CALISTHENI_NATIVE_DIAGNOSTICS !== "1") return;
  const entry = { stage, ...(detail ? { detail } : {}), at: new Date().toISOString() };
  authEvents.push(entry);
  if (authEvents.length > 16) authEvents.shift();
  console.info("[NativeAuth]", entry);
  window.dispatchEvent(new CustomEvent("calistheni:native-diagnostics"));
}

export function getNativeAuthDiagnostics() {
  return authEvents.slice();
}
