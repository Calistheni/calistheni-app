import { PageSkeleton } from "@/components/loading/PageSkeleton";
import { WorkoutRouteLoading } from "@/components/workouts/WorkoutRouteLoading";

export default function WorkoutDetailLoading() {
  return (
    <WorkoutRouteLoading>
      <PageSkeleton cards={3} />
    </WorkoutRouteLoading>
  );
}
