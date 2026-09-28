"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = { children: ReactNode };
type State = { error: Error | null };

export class NativeSurfaceErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[NativeSurface] render failed", { message: error.message, componentStack: info.componentStack });
  }

  render() {
    if (!this.state.error) return this.props.children;
    const diagnostics = process.env.NEXT_PUBLIC_CALISTHENI_NATIVE_DIAGNOSTICS === "1";
    return (
      <main className="native-auth-gate" data-native-surface-error>
        <p className="native-eyebrow">Local Calistheni</p>
        <h1>Screen unavailable</h1>
        <p>{diagnostics ? this.state.error.message : "Calistheni could not display this screen."}</p>
      </main>
    );
  }
}
