import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { auth } from "@/auth";
import HomePage from "@/components/HomePage";

const geist = Geist({
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Parks",
  alternates: { canonical: "/parks" },
};

export default async function ParksPage() {
  const session = await auth();

  return (
    <div className={`${geist.className} contents`}>
      <HomePage
        inAppShell={Boolean(session?.user)}
        user={
          session?.user
            ? { name: session.user.name, email: session.user.email }
            : null
        }
      />
    </div>
  );
}
