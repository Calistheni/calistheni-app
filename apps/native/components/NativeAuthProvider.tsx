"use client";

import { App } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { QueryClientProvider } from "@tanstack/react-query";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { apiFetch, NativeApiError } from "@native/lib/api";
import { clearUserCache, readUserCache, writeUserCache } from "@native/lib/cache";
import {
  ensurePrimaryQueriesReady,
  forgetPrimarySnapshots,
  hydratePrimarySnapshots,
  missingPrimaryQueries,
  primaryKeys,
  revalidatePrimaryQueries,
} from "@native/lib/primary-data";
import {
  clearNativeSessionToken,
  getNativeSessionToken,
  setNativeSessionToken,
} from "@native/lib/secure-session";
import type { NativeBootstrap } from "@native/lib/types";
import { getNativeQueryClient } from "@native/lib/query-client";
import { recordNativeAuth } from "@native/lib/runtime-diagnostics";

type AuthState =
  | { status: "initializing" }
  | { status: "signed-out"; message?: string }
  | { status: "recoverable"; message: string }
  | { status: "authenticated"; bootstrap: NativeBootstrap; offline: boolean };

type NativeAuthContextValue = {
  state: AuthState;
  authStage: string;
  authFailure: string | null;
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
  const queryClient = getNativeQueryClient();
  const [state, setState] = useState<AuthState>({ status: "initializing" });
  const [authStage, setAuthStage] = useState("initializing");
  const [authFailure, setAuthFailure] = useState<string | null>(null);
  const exchangingCodesRef = useRef(new Set<string>());
  const consumedCodesRef = useRef(new Set<string>());
  const authenticatedUserId = state.status === "authenticated" ? state.bootstrap.user.id : null;

  const updateAuthStage = useCallback((stage: string, detail?: string) => {
    setAuthStage(stage);
    if (stage !== "failed") setAuthFailure(null);
    recordNativeAuth(stage, detail);
  }, []);

  const failAuth = useCallback((category: string) => {
    setAuthStage("failed");
    setAuthFailure(category);
    recordNativeAuth("failed", category);
  }, []);

  const bootstrap = useCallback(async () => {
    updateAuthStage("keychain-read");
    let token: string | null;
    try {
      token = await getNativeSessionToken();
    } catch {
      failAuth("keychain-read");
      setState({ status: "signed-out", message: "Secure session storage is unavailable. Please try again." });
      return;
    }
    if (!token) {
      updateAuthStage("signed-out");
      setState({ status: "signed-out" });
      return;
    }
    const cached = await readUserCache<NativeBootstrap>("current", bootstrapCacheKey);
    let cachedIsReady = false;
    if (cached) {
      try {
        await hydratePrimarySnapshots(queryClient, cached.user.id);
        updateAuthStage("primary-cache-hydrated");
        await ensurePrimaryQueriesReady(queryClient, cached.user.id);
        cachedIsReady = true;
        setState({ status: "authenticated", bootstrap: cached, offline: true });
      } catch {
        // A partial/empty first-install cache is not presentation-ready. The
        // authenticated shell remains behind the one-time synchronization gate.
      }
    }
    try {
      updateAuthStage("bootstrap-request");
      const value = await apiFetch<NativeBootstrap>("/api/native/v1/bootstrap");
      const previousId = cached?.user.id;
      if (previousId && previousId !== value.user.id) {
        await clearUserCache(previousId);
        forgetPrimarySnapshots(previousId);
        queryClient.removeQueries({ queryKey: primaryKeys.user(previousId) });
      }
      await writeUserCache("current", bootstrapCacheKey, value);
      if (!cachedIsReady || previousId !== value.user.id) {
        updateAuthStage("primary-sync");
        await hydratePrimarySnapshots(queryClient, value.user.id);
        await ensurePrimaryQueriesReady(queryClient, value.user.id);
      }
      updateAuthStage("authenticated");
      setState({ status: "authenticated", bootstrap: value, offline: false });
    } catch (error) {
      if (error instanceof NativeApiError && error.status === 401) {
        await clearNativeSessionToken();
        if (cached) await queryClient.cancelQueries({ queryKey: primaryKeys.user(cached.user.id) });
        if (cached) await clearUserCache(cached.user.id);
        if (cached) forgetPrimarySnapshots(cached.user.id);
        await clearUserCache("current");
        queryClient.clear();
        failAuth("bootstrap-unauthorized");
        setState({ status: "signed-out", message: "Your session expired. Please sign in again." });
      } else if (!cachedIsReady) {
        failAuth(error instanceof NativeApiError ? `bootstrap-http-${error.status}` : "bootstrap-network");
        setState({ status: "recoverable", message: "Calistheni could not synchronize the initial app data. Connect to the internet and try again." });
      }
    }
  }, [failAuth, queryClient, updateAuthStage]);

  const exchange = useCallback(async (rawUrl: string) => {
    const code = nativeCode(rawUrl);
    if (!code) return;
    if (consumedCodesRef.current.has(code) || exchangingCodesRef.current.has(code)) {
      recordNativeAuth("callback-duplicate-ignored");
      return;
    }
    exchangingCodesRef.current.add(code);
    updateAuthStage("callback-received", rawUrl.startsWith("calistheni:") ? "custom-scheme" : "universal-link");
    await Browser.close().catch(() => undefined);
    try {
      updateAuthStage("exchange-request");
      const result = await apiFetch<{ token: string }>("/api/native/v1/auth/exchange", {
        method: "POST",
        authenticated: false,
        body: JSON.stringify({ code }),
      });
      const previous = await readUserCache<NativeBootstrap>("current", bootstrapCacheKey);
      if (previous) await clearUserCache(previous.user.id);
      if (previous) forgetPrimarySnapshots(previous.user.id);
      await clearUserCache("current");
      queryClient.clear();
      updateAuthStage("keychain-write");
      await setNativeSessionToken(result.token);
      consumedCodesRef.current.add(code);
      updateAuthStage("keychain-write-success");
      setState({ status: "initializing" });
      await bootstrap();
    } catch (error) {
      failAuth(error instanceof NativeApiError ? `exchange-http-${error.status}:${error.code ?? "unknown"}` : "exchange-or-keychain");
      setState({ status: "signed-out", message: error instanceof Error ? error.message : "Sign-in failed." });
    } finally {
      exchangingCodesRef.current.delete(code);
    }
  }, [bootstrap, failAuth, queryClient, updateAuthStage]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => { void bootstrap(); });
    return () => window.cancelAnimationFrame(frame);
  }, [bootstrap]);
  useEffect(() => {
    const unauthorized = () => {
      void clearNativeSessionToken().finally(async () => {
        const userId = state.status === "authenticated" ? state.bootstrap.user.id : null;
        if (userId) {
          await queryClient.cancelQueries({ queryKey: primaryKeys.user(userId) });
        }
        await Promise.all([
          clearUserCache("current"),
          ...(userId ? [clearUserCache(userId)] : []),
        ]);
        if (userId) forgetPrimarySnapshots(userId);
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
    void App.getLaunchUrl()
      .then((launch) => { if (active && launch?.url) void exchange(launch.url); })
      .catch(() => failAuth("launch-url-read"));
    void App.addListener("appUrlOpen", ({ url }) => { if (active) void exchange(url); })
      .then((handle) => { listener = handle; })
      .catch(() => failAuth("app-url-listener"));
    return () => { active = false; void listener?.remove(); };
  }, [exchange, failAuth]);
  useEffect(() => {
    if (!authenticatedUserId) return;
    const run = () => {
      void revalidatePrimaryQueries(queryClient, authenticatedUserId);
    };
    const idleWindow = window as Window & {
      requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number;
      cancelIdleCallback?: (handle: number) => void;
    };
    if (idleWindow.requestIdleCallback) {
      const idleId = idleWindow.requestIdleCallback(run, { timeout: 4_000 });
      return () => {
        idleWindow.cancelIdleCallback?.(idleId);
        void queryClient.cancelQueries({ queryKey: primaryKeys.user(authenticatedUserId) });
      };
    }
    const timeoutId = setTimeout(run, 500);
    return () => {
      clearTimeout(timeoutId);
      void queryClient.cancelQueries({ queryKey: primaryKeys.user(authenticatedUserId) });
    };
  }, [authenticatedUserId, queryClient]);

  const value = useMemo<NativeAuthContextValue>(() => ({
    state,
    authStage,
    authFailure,
    async signIn() {
      try {
        updateAuthStage("attempt-request");
        const result = await apiFetch<{ externalAuthUrl: string }>("/api/native/v1/auth/attempt", {
          method: "POST",
          authenticated: false,
          body: JSON.stringify({ platform: "IOS", redirectTo: "/home" }),
        });
        const external = new URL(result.externalAuthUrl);
        if (external.protocol !== "https:" || external.origin !== "https://calistheni.app") {
          throw new Error("Native authentication returned an unexpected browser origin.");
        }
        updateAuthStage("attempt-created");
        await Browser.open({ url: external.toString(), presentationStyle: "fullscreen" });
        updateAuthStage("browser-open");
      } catch (error) {
        failAuth(error instanceof NativeApiError ? `attempt-http-${error.status}:${error.code ?? "unknown"}` : "browser-open");
        setState({ status: "signed-out", message: error instanceof Error ? error.message : "Unable to start sign-in." });
      }
    },
    async logout() {
      const userId = state.status === "authenticated" ? state.bootstrap.user.id : null;
      try { await apiFetch("/api/native/v1/logout", { method: "POST" }); } catch { /* Local logout always wins. */ }
      await clearNativeSessionToken();
      if (userId) await queryClient.cancelQueries({ queryKey: primaryKeys.user(userId) });
      if (userId) await clearUserCache(userId);
      if (userId) forgetPrimarySnapshots(userId);
      await clearUserCache("current");
      queryClient.clear();
      updateAuthStage("signed-out");
      setState({ status: "signed-out" });
    },
    async retry() { setState({ status: "initializing" }); await bootstrap(); },
  }), [authFailure, authStage, bootstrap, failAuth, queryClient, state, updateAuthStage]);

  return <QueryClientProvider client={queryClient}><NativeAuthContext.Provider value={value}>{children}</NativeAuthContext.Provider></QueryClientProvider>;
}

export function useNativeAuth() {
  const value = useContext(NativeAuthContext);
  if (!value) throw new Error("useNativeAuth must be used inside NativeAuthProvider");
  return value;
}

export function NativeAuthGate({ children }: { children: ReactNode }) {
  const { state, signIn, retry } = useNativeAuth();
  if (state.status === "authenticated") {
    const missing = missingPrimaryQueries(getNativeQueryClient(), state.bootstrap.user.id);
    if (!missing.length) return children;
    return (
      <main className="native-auth-gate" data-primary-ready-invariant="failed">
        <p className="native-eyebrow">Local Calistheni</p>
        <h1>App data unavailable</h1>
        <p>Calistheni could not prepare the required data: {missing.join(", ")}.</p>
        <button onClick={() => void retry()}>Try again</button>
      </main>
    );
  }
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
