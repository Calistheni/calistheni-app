import type { Metadata } from "next";
import { auth } from "@/auth";
import HomePage from "@/components/HomePage";

export const metadata: Metadata = {
  alternates: {
    canonical: "/",
  },
  openGraph: {
    url: "/",
  },
};

export default async function Page() {
  const session = await auth();

  return (
    <HomePage
      user={
        session?.user
          ? {
              name: session.user.name,
              email: session.user.email,
            }
          : null
      }
    />
  );
}
