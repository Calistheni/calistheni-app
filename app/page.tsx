import type { Metadata } from "next";
import HomePage from "@/components/HomePage";
import { UserMenu } from "@/components/UserMenu";

export const metadata: Metadata = {
  alternates: {
    canonical: "/",
  },
  openGraph: {
    url: "/",
  },
};

export default function Page() {
  return (
    <>
      <HomePage />
      <UserMenu />
    </>
  );
}
