import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { ParkSubmissionForm } from "@/components/user/ParkSubmissionForm";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = {
  title: "Submit Park",
  description: "Submit a calisthenics park for admin review.",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function SubmitParkPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const equipment = await prisma.equipment.findMany({
    orderBy: {
      name: "asc",
    },
  });

  return (
    <main className="mx-auto w-full max-w-4xl p-4 sm:p-6 lg:p-8">
      <ParkSubmissionForm equipment={equipment} mode="create" />
    </main>
  );
}
