"use client";

import { createContext, useContext } from "react";

export type AppShellUser = {
  name?: string | null;
  email?: string | null;
  unreadCommunityActivity?: number;
};

const AppShellUserContext = createContext<AppShellUser | null>(null);

export const AppShellUserProvider = AppShellUserContext.Provider;

export function useAppShellUser() {
  return useContext(AppShellUserContext);
}
