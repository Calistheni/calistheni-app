import type { Metadata } from "next";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { PasswordRecoveryForm } from "@/components/auth/PasswordRecoveryForm";

export const metadata: Metadata = { title: "Forgot password", robots: { index: false, follow: false } };

export default function ForgotPasswordPage() {
  return <main className="flex min-h-screen items-center justify-center bg-muted/30 p-4"><Card className="w-full max-w-md"><CardHeader><h1 className="text-2xl font-bold">Reset your password</h1><p className="text-sm text-muted-foreground">Enter your email and we’ll send a secure reset link if an account exists.</p></CardHeader><CardContent><PasswordRecoveryForm /></CardContent></Card></main>;
}
