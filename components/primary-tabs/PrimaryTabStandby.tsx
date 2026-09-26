import { Coins, MapPin, Utensils, UsersRound } from "lucide-react";
import { CommunityTabs } from "@/components/community/CommunityTabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export type PrimaryTabName =
  | "home"
  | "nutrition"
  | "parks"
  | "community"
  | "rewards";

export function PrimaryTabStandby({ tab }: { tab: PrimaryTabName }) {
  if (tab === "parks") {
    return (
      <main
        data-parks-page
        data-primary-tab-shell="parks"
        className="relative flex h-full min-h-0 w-full flex-col overflow-hidden bg-background"
      >
        <div className="relative min-h-0 flex-1 overflow-hidden bg-muted/30">
          <div className="absolute top-3 left-3 flex h-10 items-center gap-2 rounded-full border bg-card/95 px-4 shadow-sm">
            <MapPin className="size-4 text-primary" aria-hidden="true" />
            <span className="text-sm font-medium">Parks</span>
          </div>
          <div className="absolute top-3 right-3 flex size-10 items-center justify-center rounded-full border bg-card/95 shadow-sm">
            <span className="size-2 rounded-full bg-primary" />
          </div>
        </div>
      </main>
    );
  }

  if (tab === "nutrition") {
    return (
      <main
        data-primary-tab-shell="nutrition"
        className="mx-auto w-full max-w-3xl space-y-5 p-4 pb-24 sm:p-6"
      >
        <header>
          <h1 className="text-3xl font-bold">Nutrition</h1>
          <p className="text-sm text-muted-foreground">Your daily food log</p>
        </header>
        <Card>
          <CardHeader className="flex-row items-center gap-3">
            <Utensils className="size-5 text-primary" aria-hidden="true" />
            <CardTitle>Today</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-4 gap-3 text-center text-sm">
            {["Calories", "Protein", "Carbs", "Fat"].map((label) => (
              <div key={label} className="rounded-lg bg-muted/40 p-3">
                <p className="font-semibold tabular-nums">—</p>
                <p className="mt-1 text-xs text-muted-foreground">{label}</p>
              </div>
            ))}
          </CardContent>
        </Card>
        <div className="grid gap-3">
          {["Breakfast", "Lunch", "Dinner", "Snacks"].map((meal) => (
            <Card key={meal}>
              <CardContent className="flex min-h-20 items-center justify-between p-4">
                <span className="font-medium">{meal}</span>
                <span
                  className="text-sm text-muted-foreground"
                  aria-hidden="true"
                >
                  —
                </span>
              </CardContent>
            </Card>
          ))}
        </div>
      </main>
    );
  }

  if (tab === "community") {
    return (
      <main
        data-primary-tab-shell="community"
        className="mx-auto w-full max-w-4xl p-4 sm:p-6 lg:p-8"
      >
        <div className="mb-6">
          <h1 className="text-3xl font-bold">Workout Feed</h1>
          <p className="text-sm text-muted-foreground">
            Completed public workouts from people you follow.
          </p>
        </div>
        <CommunityTabs active="feed" />
        <Card>
          <CardContent className="flex min-h-40 items-center gap-3 p-6 text-sm text-muted-foreground">
            <UsersRound className="size-5 text-primary" aria-hidden="true" />
            Your feed will update here.
          </CardContent>
        </Card>
      </main>
    );
  }

  if (tab === "rewards") {
    return (
      <main
        data-primary-tab-shell="rewards"
        className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8 lg:py-16"
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
              Your rewards and membership details appear here.
            </p>
          </div>
          <Card className="mx-auto w-full max-w-md rounded-3xl">
            <CardContent className="p-7">
              <p className="text-sm text-muted-foreground">Current balance</p>
              <div className="mt-3 flex items-center gap-2">
                <Coins className="size-6 text-primary" aria-hidden="true" />
                <span className="text-4xl font-bold tabular-nums">—</span>
              </div>
            </CardContent>
          </Card>
        </section>
      </main>
    );
  }

  return (
    <main
      data-primary-tab-shell="home"
      className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8 lg:py-16"
    >
      <header className="max-w-4xl pb-16 sm:pb-20 lg:pb-24">
        <p className="text-xs font-semibold tracking-[0.18em] text-muted-foreground uppercase">
          Home
        </p>
        <h1 className="mt-5 text-4xl font-bold tracking-[-0.035em] sm:text-5xl lg:text-6xl">
          Welcome back.
        </h1>
        <p className="mt-5 text-base text-muted-foreground sm:text-lg">
          Keep your momentum going.
        </p>
      </header>
      <div className="grid gap-4 md:grid-cols-3">
        {["Continue training", "Weekly progress", "Recent activity"].map(
          (title) => (
            <Card key={title}>
              <CardHeader>
                <CardTitle>{title}</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                Your latest training details appear here.
              </CardContent>
            </Card>
          )
        )}
      </div>
    </main>
  );
}
