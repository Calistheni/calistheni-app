import { Skeleton } from "@/components/ui/skeleton";

export default function RewardsLoading() {
  return (
    <main
      className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8 lg:py-16"
      aria-busy="true"
      aria-label="Loading rewards"
    >
      <section className="grid items-center gap-12 pb-16 lg:grid-cols-[minmax(0,1fr)_minmax(22rem,0.72fr)]">
        <div>
          <p className="text-xs font-semibold tracking-[0.16em] text-primary uppercase">
            Calis Points
          </p>
          <h1 className="mt-5 text-5xl leading-[0.98] font-bold tracking-[-0.045em] sm:text-6xl lg:text-7xl">
            Train. Earn.
            <span className="block text-primary">Unlock.</span>
          </h1>
          <p className="mt-6 max-w-2xl text-base text-muted-foreground">
            Your rewards and membership details are loading.
          </p>
        </div>
        <Skeleton className="mx-auto h-72 w-full max-w-md rounded-3xl" />
      </section>
      <div className="grid gap-4 sm:grid-cols-3">
        <Skeleton className="h-36 rounded-2xl" />
        <Skeleton className="h-36 rounded-2xl" />
        <Skeleton className="h-36 rounded-2xl" />
      </div>
    </main>
  );
}
