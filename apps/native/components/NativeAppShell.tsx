"use client";

import type { ReactNode } from "react";
import { NativePrimaryTabHost } from "./NativePrimaryTabHost";
import { NativeAuthGate, NativeAuthProvider } from "./NativeAuthProvider";

export function NativeAppShell({ children }: { children: ReactNode }) {
  return (
    <NativeAuthProvider>
      <div className="native-app-shell" data-native-bundled-shell>
        <NativeAuthGate><NativePrimaryTabHost /></NativeAuthGate>
        <div hidden>{children}</div>
      </div>
    </NativeAuthProvider>
  );
}
