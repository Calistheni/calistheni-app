import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { BackButton } from "@/components/navigation/BackButton";
import { MeasurementTracker } from "@/components/profile/MeasurementTracker";
import { getUserEntitlements } from "@/lib/entitlements";
import { prisma } from "@/lib/prisma";

export default async function MeasurementsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const [entitlementResult, profile] = await Promise.all([
    getUserEntitlements(session.user.id),
    prisma.user.findUnique({ where: { id: session.user.id }, select: { bodyFatSex: true, appleHealthBodyMeasurementExportEnabled: true } }),
  ]);
  return <main className="mx-auto w-full max-w-4xl p-4 pb-24 sm:p-6"><BackButton fallbackHref="/profile" /><div className="mb-6"><h1 className="text-3xl font-bold">Body Measurements</h1><p className="text-sm text-muted-foreground">Private check-ins can fluctuate; they do not diagnose health changes.</p></div><MeasurementTracker isPro={entitlementResult.entitlements.isPro} appleHealthBodyMeasurementExportEnabled={profile?.appleHealthBodyMeasurementExportEnabled ?? false} initialBodyFatSex={profile?.bodyFatSex ?? null} /></main>;
}
