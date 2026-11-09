"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";

export function EmailVerification({ token }: { token?: string }) {
  const [state, setState] = useState<"working" | "success" | "error">(token ? "working" : "error");
  const [message, setMessage] = useState(token ? "Verifying your email…" : "This verification link is invalid.");

  useEffect(() => {
    if (!token) return;
    window.history.replaceState(null, "", "/verify-email");
    const controller = new AbortController();
    void fetch("/api/auth/password/verify-email", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
      signal: controller.signal,
    }).then(async (response) => {
      const result = (await response.json()) as { error?: string };
      setState(response.ok ? "success" : "error");
      setMessage(response.ok ? "Your email is verified. You can now sign in." : result.error ?? "This verification link is invalid or expired.");
    }).catch((error) => {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setState("error");
      setMessage("Email verification could not be completed.");
    });
    return () => controller.abort();
  }, [token]);

  return (
    <div className="space-y-4 text-center">
      {state === "working" ? <Loader2 className="mx-auto size-6 animate-spin text-primary" /> : null}
      <p role="status" className={state === "error" ? "text-destructive" : "text-muted-foreground"}>{message}</p>
      {state !== "working" ? <Link className="text-sm font-medium text-primary hover:underline" href="/login">Go to sign in</Link> : null}
    </div>
  );
}
