import type { Metadata } from "next";
import { redirect } from "next/navigation";
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

  if (session?.user) redirect("/home");

  return <HomePage user={null} />;
}
