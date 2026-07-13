import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { ProSuccessStatus } from "@/components/billing/ProSuccessStatus";
import { BackButton } from "@/components/navigation/BackButton";
import { getUserEntitlements } from "@/lib/entitlements";

export const metadata: Metadata = {
  title: "Activating Calistheni Pro",
  robots: { index: false, follow: false },
};

export default async function ProSuccessPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { entitlements } = await getUserEntitlements(session.user.id);
  return (
    <main className="mx-auto w-full max-w-2xl p-4 sm:p-6 lg:p-8">
      <BackButton fallbackHref="/pro" />
      <ProSuccessStatus initialIsPro={entitlements.isPro} />
    </main>
  );
}
