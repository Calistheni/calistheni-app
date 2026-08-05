import Link from "next/link";
import { cookies } from "next/headers";
import { NativeAuthErrorRedirect } from "@/components/auth/NativeAuthErrorRedirect";
import {
  NATIVE_AUTH_BROWSER_COOKIE,
  parseNativeAuthAttemptCookie,
} from "@/lib/auth/native-auth-server";

export default async function NativeAuthErrorPage() {
  const cookieStore = await cookies();
  const attempt = parseNativeAuthAttemptCookie(
    cookieStore.get(NATIVE_AUTH_BROWSER_COOKIE)?.value
  );

  if (attempt) {
    return <NativeAuthErrorRedirect />;
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <section className="w-full max-w-sm rounded-xl border bg-background p-6 text-center shadow-sm">
        <h1 className="text-lg font-semibold">Sign-in failed</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          We could not complete Google sign-in. Please try again.
        </p>
        <ButtonLink />
      </section>
    </main>
  );
}

function ButtonLink() {
  return (
    <Link
      href="/login"
      className="mt-4 inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
    >
      Back to sign in
    </Link>
  );
}
