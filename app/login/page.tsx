import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, signIn } from "@/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Login",
  description: "Sign in to submit and manage calisthenics parks.",
  alternates: {
    canonical: "/login",
  },
};

export default async function LoginPage() {
  const session = await auth();

  if (session?.user) {
    redirect("/profile");
  }

  const isGoogleConfigured =
    Boolean(process.env.GOOGLE_CLIENT_ID) &&
    Boolean(process.env.GOOGLE_CLIENT_SECRET);

  async function loginWithGoogle() {
    "use server";

    await signIn("google", {
      redirectTo: "/profile",
    });
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-2">
          <p className="text-sm font-medium text-muted-foreground">
            Calistheni
          </p>
          <h1 className="text-3xl font-bold">Login</h1>
          <p className="text-sm text-muted-foreground">
            Sign in to submit parks and manage your contributions.
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
            <Link href="/">Back to Map</Link>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
