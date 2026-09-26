export default function NutritionLoading() {
  return (
    <main
      className="mx-auto w-full max-w-3xl space-y-5 p-4 pb-24 sm:p-6"
      aria-busy="true"
      aria-label="Loading nutrition"
    >
      <header>
        <h1 className="text-3xl font-bold">Nutrition</h1>
        <p className="text-sm text-muted-foreground">Your daily food log</p>
      </header>
      <section className="space-y-3 rounded-xl border p-4">
        <div className="h-5 w-36 animate-pulse rounded bg-muted" />
        <div className="grid grid-cols-7 gap-2">
          <div className="col-span-7 h-16 animate-pulse rounded-lg bg-muted" />
        </div>
      </section>
      <div className="h-44 animate-pulse rounded-xl border bg-card" />
      <div className="grid gap-3">
        <div className="h-24 animate-pulse rounded-xl border bg-card" />
        <div className="h-24 animate-pulse rounded-xl border bg-card" />
        <div className="h-24 animate-pulse rounded-xl border bg-card" />
      </div>
    </main>
  );
}
