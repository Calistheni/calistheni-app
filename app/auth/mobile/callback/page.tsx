import type { Metadata } from "next";
import Link from "next/link";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false } };

/** Browser fallback only. The code is deliberately never consumed in Safari. */
export default function MobileAuthCallbackPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <section className="w-full max-w-sm rounded-xl border bg-background p-6 text-center shadow-sm">
        <h1 className="text-lg font-semibold">Opening Calistheni</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          If Calistheni does not open automatically, return to the app to finish signing in.
        </p>
        <Link className="mt-4 inline-block text-sm underline" href="/login">
          Return to website sign in
        </Link>
      </section>
    </main>
  );
}
