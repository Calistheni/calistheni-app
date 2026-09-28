"use client";

import type { ReactNode } from "react";
import { NativePrimaryTabHost } from "./NativePrimaryTabHost";
import { NativeAuthGate, NativeAuthProvider } from "./NativeAuthProvider";
import { NativeSurfaceErrorBoundary } from "./NativeSurfaceErrorBoundary";
import { NativeRuntimeDiagnostics } from "./NativeRuntimeDiagnostics";

export function NativeAppShell({ children }: { children: ReactNode }) {
  return (
    <NativeAuthProvider>
      <div className="native-app-shell" data-native-bundled-shell data-native-runtime="bundled">
        <NativeSurfaceErrorBoundary>
          <NativeAuthGate><NativePrimaryTabHost /></NativeAuthGate>
        </NativeSurfaceErrorBoundary>
        <NativeRuntimeDiagnostics />
        <div hidden>{children}</div>
      </div>
    </NativeAuthProvider>
  );
}
