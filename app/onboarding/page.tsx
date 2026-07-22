import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { OnboardingFlow } from "@/components/onboarding/OnboardingFlow";
import { formatDateOfBirth } from "@/lib/date-of-birth";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = {
  title: "Onboarding",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function OnboardingPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const user = await prisma.user.findUnique({
    where: {
      id: session.user.id,
    },
    select: {
      bodyweightKg: true,
      dateOfBirth: true,
      onboardingCompleted: true,
      trainingStyle: true,
      primaryGoal: true,
    },
  });

  if (user?.onboardingCompleted) {
    redirect("/home");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <OnboardingFlow
        initialBodyweightKg={user?.bodyweightKg ?? null}
        initialDateOfBirth={formatDateOfBirth(user?.dateOfBirth)}
        initialTrainingStyle={user?.trainingStyle ?? null}
        initialPrimaryGoal={user?.primaryGoal ?? null}
      />
    </main>
  );
}
