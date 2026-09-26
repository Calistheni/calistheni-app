export default function ParksLoading() {
  return (
    <main
      data-parks-page
      className="relative flex h-full min-h-0 w-full flex-col overflow-hidden bg-background"
      aria-busy="true"
      aria-label="Loading parks"
    >
      <div className="relative min-h-0 flex-1 overflow-hidden bg-muted/30">
        <div className="absolute top-3 left-3 h-10 w-[min(18rem,calc(100%-5rem))] animate-pulse rounded-full border bg-card/80" />
        <div className="absolute top-3 right-3 size-10 animate-pulse rounded-full border bg-card/80" />
        <div className="absolute right-3 bottom-3 size-11 animate-pulse rounded-full border bg-card/80" />
      </div>
    </main>
  );
}
