function CardSkeleton({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-2xl border bg-card/70 ${className}`}
    />
  );
}

export default function HomeLoading() {
  return (
    <main
      className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8 lg:py-16"
      aria-busy="true"
      aria-label="Loading home"
    >
      <header className="max-w-4xl pb-16 sm:pb-20 lg:pb-24">
        <div className="h-3 w-36 animate-pulse rounded bg-muted" />
        <div className="mt-5 h-12 w-64 max-w-full animate-pulse rounded bg-muted sm:h-16" />
        <div className="mt-5 h-5 w-72 max-w-full animate-pulse rounded bg-muted" />
        <div className="mt-8 h-10 w-40 animate-pulse rounded-md bg-muted" />
      </header>
      <div className="space-y-16 sm:space-y-20">
        <CardSkeleton className="h-72" />
        <CardSkeleton className="h-64" />
        <CardSkeleton className="h-52" />
      </div>
    </main>
  );
}
