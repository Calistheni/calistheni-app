"use client";

import { useEffect } from "react";

/** The shell already shows Home while this static-compatible redirect settles. */
export default function NativeRootPage() {
  useEffect(() => {
    window.history.replaceState(
      { ...window.history.state, calistheniPrimary: "/home" },
      "",
      "/home"
    );
  }, []);

  return null;
}
