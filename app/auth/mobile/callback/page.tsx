import type { Metadata } from "next";
import { MobileAuthCallbackPage } from "@/components/auth/MobileAuthCallbackPage";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false } };

/** Browser fallback only. The code is deliberately never consumed in Safari. */
export default function MobileAuthCallbackRoute() {
  return <MobileAuthCallbackPage />;
}
