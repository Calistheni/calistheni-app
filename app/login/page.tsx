import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, signIn } from "@/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { getPostLoginRedirect } from "@/lib/onboarding";

export const metadata: Metadata = {
  title: "Login",
  description: "Sign in to submit and manage calisthenics parks.",
  alternates: {
    canonical: "/login",
  },
};

function getSafeCallbackUrl(value: string | string[] | undefined) {
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    value.startsWith("//")
  ) {
    return null;
  }

  return value;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{
    callbackUrl?: string | string[];
    intent?: string | string[];
  }>;
}) {
  const query = await searchParams;
  const callbackUrl = getSafeCallbackUrl(query.callbackUrl);
  const isCreatingAccount = query.intent === "signup";
  const session = await auth();

  if (session?.user) {
    redirect(callbackUrl ?? (await getPostLoginRedirect(session.user.id)));
  }

  const isGoogleConfigured =
    Boolean(process.env.GOOGLE_CLIENT_ID) &&
    Boolean(process.env.GOOGLE_CLIENT_SECRET);

  async function loginWithGoogle() {
    "use server";

    await signIn("google", {
      redirectTo: callbackUrl ?? "/onboarding",
    });
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-2">
          <p className="text-sm font-medium text-muted-foreground">
            Calistheni
          </p>
          <h1 className="text-3xl font-bold">
            {isCreatingAccount ? "Create your free account" : "Sign in"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {isCreatingAccount
              ? "Join Calistheni to contribute parks, save your training, and track progress."
              : "Sign in to submit parks and manage your contributions."}
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {isGoogleConfigured ? (
            <form action={loginWithGoogle}>
              <Button type="submit" className="w-full">
                Continue with Google
              </Button>
            </form>
          ) : (
            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm text-muted-foreground">
              Google login is not configured yet. Add OAuth environment
              variables before enabling user login.
            </div>
          )}

          <Button asChild variant="outline" className="w-full">
            <Link href={callbackUrl ?? "/"}>
              {callbackUrl === "/parks" ? "Back to parks" : "Back to Map"}
            </Link>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
