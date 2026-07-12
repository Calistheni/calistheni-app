import "server-only";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

export async function redirectIfOnboardingRequired(userId: string) {
  const user = await prisma.user.findUnique({
    where: {
      id: userId,
    },
    select: {
      onboardingCompleted: true,
    },
  });

  if (user && !user.onboardingCompleted) {
    redirect("/onboarding");
  }
}

export async function getPostLoginRedirect(userId: string) {
  const user = await prisma.user.findUnique({
    where: {
      id: userId,
    },
    select: {
      onboardingCompleted: true,
    },
  });

  return user?.onboardingCompleted ? "/home" : "/onboarding";
}
