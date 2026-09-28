"use client";

import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { createContext, useContext, useLayoutEffect, useMemo, useState } from "react";
import {
  createPrimaryPresentation,
  decodePrimaryPresentation,
  primaryPresentationKeys,
  primaryPresentationNames,
  primarySchemas,
  type PrimaryPresentationData,
  type PrimaryPresentationName,
} from "@/lib/primary-presentation";

const STORAGE_PREFIX = "calistheni:primary-presentation:v1";
const PresentationContext = createContext<{ userId: string; hydrated: boolean } | null>(null);

export function primaryPresentationStorageKey(userId: string, name: PrimaryPresentationName) {
  return `${STORAGE_PREFIX}:${encodeURIComponent(userId)}:${name}`;
}

export function readPersistedPrimaryPresentation<Name extends PrimaryPresentationName>(userId: string, name: Name): PrimaryPresentationData[Name] | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const raw = window.localStorage.getItem(primaryPresentationStorageKey(userId, name));
    return raw ? decodePrimaryPresentation(JSON.parse(raw), userId, name) : undefined;
  } catch { return undefined; }
}

export function persistPrimaryPresentation<Name extends PrimaryPresentationName>(userId: string, name: Name, data: unknown) {
  const record = createPrimaryPresentation(userId, name, data);
  try {
    window.localStorage.setItem(primaryPresentationStorageKey(userId, name), JSON.stringify(record));
  } catch {
    // A storage quota/privacy failure must not turn a valid network response
    // into a failed query or discard the in-memory last-known-good value.
  }
  return record.data as PrimaryPresentationData[Name];
}

function nutritionDate() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

async function fetchPresentation<Name extends PrimaryPresentationName>(userId: string, name: Name, signal?: AbortSignal): Promise<PrimaryPresentationData[Name]> {
  const suffix = name === "nutrition" ? `?date=${nutritionDate()}` : "";
  const response = await fetch(`/api/native/v1/${name}${suffix}`, { credentials: "same-origin", signal, headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`Unable to refresh ${name} (${response.status}).`);
  const parsed = primarySchemas[name].parse(await response.json()) as PrimaryPresentationData[Name];
  persistPrimaryPresentation(userId, name, parsed);
  return parsed;
}

function PrimaryPresentationWarmup({ userId, hydrated }: { userId: string; hydrated: boolean }) {
  return <>{primaryPresentationNames.map((name) => <PrimaryPresentationQuery key={name} userId={userId} name={name} enabled={hydrated} />)}</>;
}

function PrimaryPresentationQuery({ userId, name, enabled }: { userId: string; name: PrimaryPresentationName; enabled: boolean }) {
  useQuery({ queryKey: primaryPresentationKeys.snapshot(userId, name), queryFn: ({ signal }) => fetchPresentation(userId, name, signal), enabled, staleTime: 0, gcTime: Infinity, retry: 1 });
  return null;
}

export function PrimaryPresentationProvider({ userId, children }: { userId: string; children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { staleTime: 0, gcTime: Infinity, retry: 1 } } }));
  const [hydrated, setHydrated] = useState(false);

  useLayoutEffect(() => {
    for (const name of primaryPresentationNames) {
      const data = readPersistedPrimaryPresentation(userId, name);
      if (data !== undefined) queryClient.setQueryData(primaryPresentationKeys.snapshot(userId, name), data);
    }
    // This intentional pre-paint state transition prevents a persisted
    // returning-user snapshot from flashing through the cold standby branch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHydrated(true);
  }, [queryClient, userId]);

  const context = useMemo(() => ({ userId, hydrated }), [userId, hydrated]);
  return <QueryClientProvider client={queryClient}><PresentationContext.Provider value={context}><PrimaryPresentationWarmup userId={userId} hydrated={hydrated} />{children}</PresentationContext.Provider></QueryClientProvider>;
}

export function usePrimaryPresentation<Name extends PrimaryPresentationName>(name: Name) {
  const context = useContext(PresentationContext);
  if (!context) throw new Error("Primary presentation data requires PrimaryPresentationProvider.");
  return useQuery({ queryKey: primaryPresentationKeys.snapshot(context.userId, name), queryFn: ({ signal }) => fetchPresentation(context.userId, name, signal), enabled: context.hydrated, staleTime: 0, gcTime: Infinity, retry: 1 });
}
