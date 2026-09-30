"use client";

import { createContext, useContext } from "react";

export type AppShellUser = {
  id: string;
  name?: string | null;
  email?: string | null;
};

const AppShellUserContext = createContext<AppShellUser | null>(null);
const PrimaryTabNavigationTargetContext = createContext<string | null>(null);

export const AppShellUserProvider = AppShellUserContext.Provider;
export const PrimaryTabNavigationTargetProvider =
  PrimaryTabNavigationTargetContext.Provider;

export function useAppShellUser() {
  return useContext(AppShellUserContext);
}

export function usePrimaryTabNavigationTarget() {
  return useContext(PrimaryTabNavigationTargetContext);
}
