import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import HomePage from "@/components/HomePage";
import {
  getPrimaryTabHrefFromCookie,
  PRIMARY_TAB_COOKIE_NAME,
} from "@/lib/navigation";

export const metadata: Metadata = {
  alternates: {
    canonical: "/",
  },
  openGraph: {
    url: "/",
  },
};

export default async function Page() {
  const [session, cookieStore] = await Promise.all([auth(), cookies()]);

  if (session?.user) {
    redirect(
      getPrimaryTabHrefFromCookie(
        cookieStore.get(PRIMARY_TAB_COOKIE_NAME)?.value
      ) ?? "/home"
    );
  }

  return <HomePage user={null} />;
}
