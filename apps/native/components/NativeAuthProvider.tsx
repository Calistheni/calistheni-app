"use client";

import { App } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { apiFetch, NativeApiError } from "@native/lib/api";
import { clearUserCache, readUserCache, writeUserCache } from "@native/lib/cache";
import {
  hydratePrimarySnapshots,
  warmPrimaryQueries,
} from "@native/lib/primary-data";
import { getNativePrimaryHref } from "@native/lib/navigation";
import {
  clearNativeSessionToken,
  getNativeSessionToken,
  setNativeSessionToken,
} from "@native/lib/secure-session";
import type { NativeBootstrap } from "@native/lib/types";

type AuthState =
  | { status: "initializing" }
  | { status: "signed-out"; message?: string }
  | { status: "recoverable"; message: string }
  | { status: "authenticated"; bootstrap: NativeBootstrap; offline: boolean };

type NativeAuthContextValue = {
  state: AuthState;
  signIn(): Promise<void>;
  logout(): Promise<void>;
  retry(): Promise<void>;
};

const NativeAuthContext = createContext<NativeAuthContextValue | null>(null);
const bootstrapCacheKey = "bootstrap";

function nativeCode(value: string) {
  try {
    const url = new URL(value);
    const validLocation =
      (url.protocol === "calistheni:" && url.hostname === "auth" && url.pathname === "/mobile/callback") ||
      (url.protocol === "https:" && url.hostname === "calistheni.app" && url.pathname === "/auth/mobile/callback");
    const code = url.searchParams.get("code");
    return validLocation && code && /^[A-Za-z0-9_-]{43}$/.test(code) ? code : null;
  } catch { return null; }
}

export function NativeAuthProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { staleTime: 60_000, retry: 1, refetchOnWindowFocus: false } } }));
  const [state, setState] = useState<AuthState>({ status: "initializing" });
  const authenticatedUserId = state.status === "authenticated" ? state.bootstrap.user.id : null;

  const bootstrap = useCallback(async () => {
    const token = await getNativeSessionToken();
    if (!token) { setState({ status: "signed-out" }); return; }
    const cached = await readUserCache<NativeBootstrap>("current", bootstrapCacheKey);
    if (cached) {
      await hydratePrimarySnapshots(queryClient, cached.user.id);
      setState({ status: "authenticated", bootstrap: cached, offline: true });
    }
    try {
      const value = await apiFetch<NativeBootstrap>("/api/native/v1/bootstrap");
      const previousId = cached?.user.id;
      if (previousId && previousId !== value.user.id) {
        await clearUserCache(previousId);
        queryClient.removeQueries({ queryKey: ["native", "primary", previousId] });
      }
      await writeUserCache("current", bootstrapCacheKey, value);
      await hydratePrimarySnapshots(queryClient, value.user.id);
      setState({ status: "authenticated", bootstrap: value, offline: false });
    } catch (error) {
      if (error instanceof NativeApiError && error.status === 401) {
        await clearNativeSessionToken();
        if (cached) await queryClient.cancelQueries({ queryKey: ["native", "primary", cached.user.id] });
        if (cached) await clearUserCache(cached.user.id);
        await clearUserCache("current");
        queryClient.clear();
        setState({ status: "signed-out", message: "Your session expired. Please sign in again." });
      } else if (!cached) {
        setState({ status: "recoverable", message: "Connect to the internet to finish signing in." });
      }
    }
  }, [queryClient]);

  const exchange = useCallback(async (rawUrl: string) => {
    const code = nativeCode(rawUrl);
    if (!code) return;
    await Browser.close().catch(() => undefined);
    try {
      const result = await apiFetch<{ token: string }>("/api/native/v1/auth/exchange", {
        method: "POST",
        authenticated: false,
        body: JSON.stringify({ code }),
      });
      await setNativeSessionToken(result.token);
      setState({ status: "initializing" });
      await bootstrap();
    } catch (error) {
      setState({ status: "signed-out", message: error instanceof Error ? error.message : "Sign-in failed." });
    }
  }, [bootstrap]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => { void bootstrap(); });
    return () => window.cancelAnimationFrame(frame);
  }, [bootstrap]);
  useEffect(() => {
    const unauthorized = () => {
      void clearNativeSessionToken().finally(async () => {
        const userId = state.status === "authenticated" ? state.bootstrap.user.id : null;
        if (userId) {
          await queryClient.cancelQueries({ queryKey: ["native", "primary", userId] });
        }
        await Promise.all([
          clearUserCache("current"),
          ...(userId ? [clearUserCache(userId)] : []),
        ]);
        queryClient.clear();
        setState({ status: "signed-out", message: "Your session expired. Please sign in again." });
      });
    };
    window.addEventListener("calistheni:native-session-unauthorized", unauthorized);
    return () => window.removeEventListener("calistheni:native-session-unauthorized", unauthorized);
  }, [queryClient, state]);
  useEffect(() => {
    let active = true;
    let listener: Awaited<ReturnType<typeof App.addListener>> | undefined;
    void App.getLaunchUrl().then((launch) => { if (active && launch?.url) void exchange(launch.url); });
    void App.addListener("appUrlOpen", ({ url }) => { if (active) void exchange(url); }).then((handle) => { listener = handle; });
    return () => { active = false; void listener?.remove(); };
  }, [exchange]);
  useEffect(() => {
    if (!authenticatedUserId) return;
    const run = () => {
      void warmPrimaryQueries(
        queryClient,
        authenticatedUserId,
        getNativePrimaryHref(window.location.pathname)
      );
    };
    const idleWindow = window as Window & {
      requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number;
      cancelIdleCallback?: (handle: number) => void;
    };
    if (idleWindow.requestIdleCallback) {
      const idleId = idleWindow.requestIdleCallback(run, { timeout: 4_000 });
      return () => {
        idleWindow.cancelIdleCallback?.(idleId);
        void queryClient.cancelQueries({ queryKey: ["native", "primary", authenticatedUserId] });
      };
    }
    const timeoutId = setTimeout(run, 500);
    return () => {
      clearTimeout(timeoutId);
      void queryClient.cancelQueries({ queryKey: ["native", "primary", authenticatedUserId] });
    };
  }, [authenticatedUserId, queryClient]);

  const value = useMemo<NativeAuthContextValue>(() => ({
    state,
    async signIn() {
      const result = await apiFetch<{ externalAuthUrl: string }>("/api/native/v1/auth/attempt", {
        method: "POST",
        authenticated: false,
        body: JSON.stringify({ platform: "IOS", redirectTo: "/rewards" }),
      });
      await Browser.open({ url: result.externalAuthUrl, presentationStyle: "fullscreen" });
    },
    async logout() {
      const userId = state.status === "authenticated" ? state.bootstrap.user.id : null;
      try { await apiFetch("/api/native/v1/logout", { method: "POST" }); } catch { /* Local logout always wins. */ }
      await clearNativeSessionToken();
      if (userId) await queryClient.cancelQueries({ queryKey: ["native", "primary", userId] });
      if (userId) await clearUserCache(userId);
      await clearUserCache("current");
      queryClient.clear();
      setState({ status: "signed-out" });
    },
    async retry() { setState({ status: "initializing" }); await bootstrap(); },
  }), [bootstrap, queryClient, state]);

  return <QueryClientProvider client={queryClient}><NativeAuthContext.Provider value={value}>{children}</NativeAuthContext.Provider></QueryClientProvider>;
}

export function useNativeAuth() {
  const value = useContext(NativeAuthContext);
  if (!value) throw new Error("useNativeAuth must be used inside NativeAuthProvider");
  return value;
}

export function NativeAuthGate({ children }: { children: ReactNode }) {
  const { state, signIn, retry } = useNativeAuth();
  if (state.status === "authenticated") return children;
  return (
    <main className="native-auth-gate">
      <p className="native-eyebrow">Local Calistheni</p>
      <h1>{state.status === "signed-out" ? "Sign in to continue" : state.status === "recoverable" ? "Connection needed" : "Opening your app"}</h1>
      <p>{state.status === "signed-out" ? state.message ?? "Use your existing Calistheni Google account." : state.status === "recoverable" ? state.message : "Checking your secure session…"}</p>
      {state.status === "signed-out" ? <button onClick={() => void signIn()}>Continue with Google</button> : null}
      {state.status === "recoverable" ? <button onClick={() => void retry()}>Try again</button> : null}
    </main>
  );
}
