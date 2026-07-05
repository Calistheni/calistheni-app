import { redirect } from "next/navigation";
import { auth } from "@/auth";

export default async function EditSubmittedParkPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const { id } = await params;
  redirect(`/parks/${id}/edit`);
}
