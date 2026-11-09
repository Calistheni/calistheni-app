import type { Metadata } from "next";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { EmailVerification } from "@/components/auth/EmailVerification";

export const metadata: Metadata = { title: "Verify email", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return <main className="flex min-h-screen items-center justify-center bg-muted/30 p-4"><Card className="w-full max-w-md"><CardHeader><h1 className="text-2xl font-bold">Verify your email</h1></CardHeader><CardContent><EmailVerification token={typeof token === "string" ? token : undefined} /></CardContent></Card></main>;
}
