"use client";

import { useEffect } from "react";

export function UserActivityHeartbeat() {
  useEffect(() => {
    const send = () => {
      if (document.visibilityState !== "visible") return;
      void fetch("/api/user/activity", { method: "POST", keepalive: true }).catch(() => {
        // Presence telemetry is best-effort and must never affect app use.
      });
    };
    send();
    const interval = window.setInterval(send, 10 * 60 * 1000);
    document.addEventListener("visibilitychange", send);
    return () => { window.clearInterval(interval); document.removeEventListener("visibilitychange", send); };
  }, []);
  return null;
}
