import { permanentRedirect } from "next/navigation";
import { getExerciseRecordHref } from "@/lib/exercise-routes";

/** Legacy public detail URL. Exercise records are the canonical destination. */
export default async function LegacyExerciseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  permanentRedirect(getExerciseRecordHref(id));
}
