import { CommunityTabs } from "@/components/community/CommunityTabs";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export default function FeedLoading() {
  return (
    <main
      className="mx-auto w-full max-w-4xl p-4 sm:p-6 lg:p-8"
      aria-busy="true"
      aria-label="Loading community"
    >
      <div className="mb-6 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Workout Feed</h1>
          <p className="text-sm text-muted-foreground">
            Completed public workouts from people you follow.
          </p>
        </div>
        <Button variant="outline" disabled>
          Start Workout
        </Button>
      </div>
      <CommunityTabs active="feed" />
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, index) => (
          <Skeleton key={index} className="h-48 rounded-xl" />
        ))}
      </div>
    </main>
  );
}
