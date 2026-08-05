import { Button } from "@/components/ui/button";

/** Safe external-browser failure page; no identifiers are placed in a link. */
export function NativeAuthErrorRedirect() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <section className="w-full max-w-sm rounded-xl border bg-background p-6 text-center shadow-sm">
        <h1 className="text-lg font-semibold">Returning to Calistheni</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Your Google sign-in did not complete. Return to the app to try again.
        </p>
        <Button asChild className="mt-4">
          <a href="/login">Try again</a>
        </Button>
      </section>
    </main>
  );
}
