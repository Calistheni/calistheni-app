import type { Metadata } from "next";
import { auth } from "@/auth";
import HomePage from "@/components/HomePage";

export const metadata: Metadata = {
  title: "Parks",
  alternates: { canonical: "/parks" },
};

export default async function ParksPage() {
  const session = await auth();

  return (
    <HomePage
      inAppShell={Boolean(session?.user)}
      user={
        session?.user
          ? { name: session.user.name, email: session.user.email }
          : null
      }
    />
  );
}
