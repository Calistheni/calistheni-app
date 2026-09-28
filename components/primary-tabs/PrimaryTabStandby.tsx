"use client";

import Link from "next/link";
import {
  ArrowRight,
  Coins,
  Dumbbell,
  Gift,
  ListChecks,
  MapPin,
  Scale,
  Target,
  Trophy,
  UsersRound,
  Utensils,
} from "lucide-react";
import { CommunityTabs } from "@/components/community/CommunityTabs";
import { HomeWorkoutActions } from "@/components/home/HomeWorkoutOverview";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { usePrimaryPresentation } from "@/components/primary-tabs/PrimaryPresentationProvider";

export type PrimaryTabName =
  | "home"
  | "nutrition"
  | "parks"
  | "community"
  | "rewards"
  | "profile";

function StandbyHeading({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div className="mb-6 sm:mb-8">
      <p className="text-xs font-semibold tracking-[0.16em] text-primary uppercase">
        {eyebrow}
      </p>
      <h2 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">
        {title}
      </h2>
    </div>
  );
}

function HomeStandby() {
  const { data } = usePrimaryPresentation("home");
  if (data) {
    const metrics = [["Workouts", data.week.workouts], ["Completed sets", data.week.completedSets], ["Volume", data.week.totalVolumeKg === null ? "Not recorded" : `${Math.round(data.week.totalVolumeKg).toLocaleString()} kg`], ["Active days", data.week.activeDays]] as const;
    return <main data-primary-tab-shell="home" data-primary-tab-data="ready" className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 lg:px-8"><header className="pb-12"><p className="text-xs font-semibold tracking-[0.18em] text-muted-foreground uppercase">Home</p><h1 className="mt-5 text-4xl font-bold">Welcome back, {data.greetingName}.</h1><p className="mt-3 text-muted-foreground">{data.streakDays > 0 ? `${data.streakDays} day streak` : "Ready for your next workout."}</p><div className="mt-8"><HomeWorkoutActions /></div></header><StandbyHeading eyebrow="Your momentum" title="Weekly report" /><Card><CardContent className="grid grid-cols-2 p-0 lg:grid-cols-4">{metrics.map(([label, value]) => <div key={label} className="min-h-28 border p-5"><p className="text-xs font-semibold text-muted-foreground uppercase">{label}</p><p className="mt-3 text-2xl font-bold">{value}</p></div>)}</CardContent></Card><section className="mt-12"><StandbyHeading eyebrow="Latest session" title="Recent Activity" /><Card><CardContent className="p-6">{data.recentWorkout ? <><p className="font-semibold">{data.recentWorkout.title}</p><p className="text-sm text-muted-foreground">Your most recent completed workout</p></> : <p className="text-muted-foreground">No completed workouts yet.</p>}</CardContent></Card></section></main>;
  }
  const sections = [
    ["Your momentum", "Weekly report"],
    ["Consistency", "Training activity"],
    ["Ready when you are", "Routines"],
    ["Latest session", "Recent Activity"],
    ["Longer-term view", "Progress Snapshot"],
    ["Beyond your workouts", "Explore"],
  ] as const;

  return (
    <main
      data-primary-tab-shell="home"
      data-primary-tab-data="pending"
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
        <div className="mt-8"><HomeWorkoutActions /></div>
      </header>

      <div className="space-y-16 sm:space-y-20 lg:space-y-24">
        <section aria-label={sections[0][1]}>
          <StandbyHeading eyebrow={sections[0][0]} title={sections[0][1]} />
          <Card className="rounded-2xl py-0 shadow-none">
            <CardContent className="grid grid-cols-2 p-0 lg:grid-cols-4">
              {["Workouts", "Completed sets", "Volume", "Active days"].map((label) => (
                <div key={label} className="min-h-28 border p-5 lg:min-h-32 lg:p-8">
                  <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{label}</p>
                  <p className="mt-3 text-sm font-medium text-muted-foreground">Syncing your dashboard…</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </section>

        <section aria-label={sections[1][1]}>
          <StandbyHeading eyebrow={sections[1][0]} title={sections[1][1]} />
          <Card className="min-h-56 rounded-2xl shadow-none">
            <CardContent className="grid min-h-56 place-items-center text-sm text-muted-foreground">
              Your training calendar will appear here.
            </CardContent>
          </Card>
        </section>

        <section aria-label={sections[2][1]}>
          <StandbyHeading eyebrow={sections[2][0]} title={sections[2][1]} />
          <div className="grid gap-4 lg:grid-cols-3">
            {["Recent routine", "Training plan", "Saved routine"].map((title) => (
              <Card key={title} className="min-h-48 rounded-2xl shadow-none">
                <CardContent className="p-6">
                  <ListChecks className="size-5 text-primary" aria-hidden="true" />
                  <p className="mt-6 font-semibold">{title}</p>
                  <p className="mt-2 text-sm text-muted-foreground">Details will appear here.</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <section aria-label={sections[3][1]}>
          <StandbyHeading eyebrow={sections[3][0]} title={sections[3][1]} />
          <Card className="min-h-32 rounded-2xl shadow-none">
            <CardContent className="flex min-h-32 items-center gap-4 p-6 text-muted-foreground">
              <Dumbbell className="size-5 text-primary" aria-hidden="true" />
              Your latest workout will appear here.
            </CardContent>
          </Card>
        </section>

        <section aria-label={sections[4][1]}>
          <StandbyHeading eyebrow={sections[4][0]} title={sections[4][1]} />
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[Scale, Trophy, Target, Dumbbell].map((Icon, index) => (
              <Card key={index} className="min-h-40 rounded-2xl shadow-none">
                <CardContent className="p-5">
                  <Icon className="size-5 text-primary" aria-hidden="true" />
                  <p className="mt-8 text-sm font-medium text-muted-foreground">Syncing your dashboard…</p>
                  <p className="mt-2 text-sm text-muted-foreground">Training metric</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <section aria-label={sections[5][1]}>
          <StandbyHeading eyebrow={sections[5][0]} title={sections[5][1]} />
          <div className="grid gap-4 md:grid-cols-2">
            {["Rewards", "Discover Parks", "Community"].map((title) => (
              <Card key={title} className="min-h-36 rounded-2xl shadow-none">
                <CardContent className="p-6">
                  <p className="text-xl font-semibold">{title}</p>
                  <p className="mt-2 text-sm text-muted-foreground">Your latest details will appear here.</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}

function NutritionStandby() {
  const { data } = usePrimaryPresentation("nutrition");
  if (data) {
    const number = (key: string) => typeof data.totals[key] === "number" ? data.totals[key] : 0;
    return <main data-primary-tab-shell="nutrition" data-primary-tab-data="ready" className="mx-auto w-full max-w-3xl space-y-5 p-4 pb-24 sm:p-6"><header><h1 className="text-3xl font-bold">Nutrition</h1><p className="text-sm text-muted-foreground">{data.date} · {data.entryCount} logged {data.entryCount === 1 ? "entry" : "entries"}</p></header><Card><CardContent className="p-4"><p className="font-semibold">Consumed</p><div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">{[["Calories", number("caloriesKcal")], ["Protein", `${number("proteinGrams")} g`], ["Carbs", `${number("carbohydrateGrams")} g`], ["Fat", `${number("fatGrams")} g`]].map(([label, value]) => <div key={label}><p className="text-xs text-muted-foreground">{label}</p><p className="text-xl font-semibold">{value}</p></div>)}</div></CardContent></Card><Card><CardContent className="p-4"><p className="font-semibold">Nutrition goal</p><p className="mt-1 text-sm text-muted-foreground">{data.goal ? "Daily targets are set." : "No daily target has been set yet."}</p></CardContent></Card></main>;
  }
  return (
    <main
      data-primary-tab-shell="nutrition"
      data-primary-tab-data="pending"
      className="mx-auto w-full max-w-3xl space-y-5 p-4 pb-24 sm:p-6"
    >
      <header><h1 className="text-3xl font-bold">Nutrition</h1><p className="text-sm text-muted-foreground">Your daily food log</p></header>
      <section className="space-y-2" aria-label="Nutrition date navigation">
        <p className="text-sm font-medium text-muted-foreground">This week</p>
        <div className="grid grid-cols-7 gap-1">
          {["M", "T", "W", "T", "F", "S", "S"].map((day, index) => (
            <div key={`${day}-${index}`} className="grid h-12 place-items-center rounded-md border text-sm">{day}</div>
          ))}
        </div>
      </section>
      <Card><CardContent className="flex min-h-24 items-center justify-between p-4"><div><p className="font-semibold">Nutrition goal</p><p className="mt-1 text-sm text-muted-foreground">Daily targets will appear here.</p></div><Button size="sm" variant="outline" disabled>Set goal</Button></CardContent></Card>
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between"><p className="font-semibold">Consumed</p><Utensils className="size-5 text-primary" aria-hidden="true" /></div>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {["Calories", "Protein", "Carbs", "Fat"].map((label) => <div key={label}><p className="text-xs text-muted-foreground">{label}</p><p className="text-sm font-medium text-muted-foreground">Syncing today’s log…</p></div>)}
          </div>
        </CardContent>
      </Card>
      <div className="space-y-3">
        {["Breakfast", "Lunch", "Dinner", "Snacks"].map((meal) => (
          <Card key={meal}><CardContent className="flex min-h-24 items-center justify-between p-4"><div><p className="font-semibold">{meal}</p><p className="text-sm text-muted-foreground">Waiting for the initial nutrition sync.</p></div><Button size="icon-sm" disabled aria-label={`Add food to ${meal}`}>+</Button></CardContent></Card>
        ))}
      </div>
    </main>
  );
}

function ParksStandby() {
  const { data } = usePrimaryPresentation("parks");
  return (
    <main data-parks-page data-primary-tab-shell="parks" data-primary-tab-data={data ? "ready" : "pending"} className="relative flex h-full min-h-0 w-full flex-col overflow-hidden bg-background">
      <div className="relative min-h-0 flex-1 overflow-hidden bg-muted/30">
        <div className="absolute top-3 left-3 flex h-10 items-center gap-2 rounded-full border bg-card/95 px-4 shadow-sm"><MapPin className="size-4 text-primary" aria-hidden="true" /><span className="text-sm font-medium">{data ? `${data.publicParkCount.toLocaleString()} public parks` : "Syncing parks…"}</span></div>
        <div className="absolute top-3 right-3 flex size-10 items-center justify-center rounded-full border bg-card/95 shadow-sm"><span className="size-2 rounded-full bg-primary" /></div>
      </div>
    </main>
  );
}

function CommunityStandby() {
  const { data } = usePrimaryPresentation("community");
  return (
    <main data-primary-tab-shell="community" data-primary-tab-data={data ? "ready" : "pending"} className="mx-auto w-full max-w-4xl p-4 sm:p-6 lg:p-8">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h1 className="text-3xl font-bold">Workout Feed</h1><p className="text-sm text-muted-foreground">Completed public workouts from people you follow.</p></div><Button asChild variant="outline"><Link href="/workouts/new">Start Workout</Link></Button></div>
      <CommunityTabs active="feed" />
      {data ? <div className="space-y-3">{data.items.length ? data.items.map((item) => <Card key={item.id}><CardContent className="p-5"><p className="font-semibold">{item.title}</p><p className="text-sm text-muted-foreground">{item.athlete.name ?? "Athlete"} · {item.exerciseCount} exercises · {item.setCount} sets</p></CardContent></Card>) : <Card><CardContent className="p-6 text-muted-foreground">No followed workouts yet.</CardContent></Card>}</div> : <Card className="min-h-48"><CardContent className="flex min-h-48 items-center gap-3 p-6 text-sm text-muted-foreground"><UsersRound className="size-5 text-primary" aria-hidden="true" />Syncing your feed…</CardContent></Card>}
    </main>
  );
}

function RewardsStandby() {
  const { data } = usePrimaryPresentation("rewards");
  if (data) return <main data-primary-tab-shell="rewards" data-primary-tab-data="ready" className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 lg:px-8"><section className="grid items-center gap-12 pb-12 lg:grid-cols-2"><div><p className="text-xs font-semibold tracking-[0.16em] text-primary uppercase">Calis Points</p><h1 className="mt-5 text-5xl font-bold">Train. Earn. <span className="text-primary">Unlock.</span></h1><p className="mt-4 text-muted-foreground">{data.entitlement.isPro ? "Pro membership active" : "Build points through your training."}</p></div><Card className="w-full rounded-3xl"><CardContent className="p-7"><p className="text-sm text-muted-foreground">Current balance</p><div className="mt-3 flex items-center gap-2"><Coins className="size-6 text-primary" /><span className="text-4xl font-bold">{data.balance.toLocaleString()}</span></div></CardContent></Card></section><h2 className="mb-5 text-2xl font-bold">Available rewards</h2>{data.rewards.length ? <div className="grid gap-4 md:grid-cols-3">{data.rewards.map((reward) => <Card key={reward.id}><CardContent className="p-6"><p className="font-semibold">{reward.title}</p><p className="text-sm text-muted-foreground">{reward.partnerName}</p><p className="mt-4 font-medium text-primary">{reward.pointsCost.toLocaleString()} points</p></CardContent></Card>)}</div> : <Card><CardContent className="p-6 text-muted-foreground">No rewards are currently available.</CardContent></Card>}</main>;
  return (
    <main data-primary-tab-shell="rewards" data-primary-tab-data="pending" className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8 lg:py-16">
      <section className="grid items-center gap-12 pb-16 lg:grid-cols-[minmax(0,1fr)_minmax(22rem,0.72fr)]"><div><p className="text-xs font-semibold tracking-[0.16em] text-primary uppercase">Calis Points</p><h1 className="mt-5 text-5xl leading-[0.98] font-bold tracking-[-0.045em] sm:text-6xl lg:text-7xl">Train. Earn.<span className="block text-primary">Unlock.</span></h1></div><Card className="mx-auto w-full max-w-md rounded-3xl"><CardContent className="p-7 text-muted-foreground">Syncing your rewards…</CardContent></Card></section>
      <div className="space-y-16 sm:space-y-20 lg:space-y-24">
        <section><h2 className="mb-6 text-2xl font-bold">Rewards</h2><Card><CardContent className="p-6 text-muted-foreground"><Gift className="mb-4 size-5 text-primary" />Your first rewards snapshot is being synchronized.</CardContent></Card></section>
        <section className="rounded-3xl border border-primary/20 bg-primary/5 p-6 sm:p-8"><h2 className="text-2xl font-bold">Partner with Calistheni</h2><Button asChild className="mt-6"><Link href="/partners">Become a partner <ArrowRight /></Link></Button></section>
      </div>
    </main>
  );
}

function ProfileStandby() {
  const { data } = usePrimaryPresentation("profile");
  if (!data) return <main data-primary-tab-shell="profile" data-primary-tab-data="pending" className="mx-auto w-full max-w-4xl p-6"><h1 className="text-3xl font-bold">Profile</h1><p className="mt-4 text-muted-foreground">Syncing your profile…</p></main>;
  return <main data-primary-tab-shell="profile" data-primary-tab-data="ready" className="mx-auto w-full max-w-4xl p-6"><header><p className="text-sm text-muted-foreground">Profile</p><h1 className="text-3xl font-bold">{data.user.name ?? data.user.username ?? "Athlete"}</h1><p className="text-muted-foreground">{data.user.username ? `@${data.user.username}` : data.entitlement.isPro ? "Calistheni Pro" : "Calistheni athlete"}</p></header><div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">{[["Workouts", data.stats.workouts], ["Completed sets", data.stats.completedSets], ["Followers", data.stats.followers], ["Calis Points", data.stats.rewardPoints]].map(([label, value]) => <Card key={label}><CardContent className="p-5"><p className="text-xs text-muted-foreground uppercase">{label}</p><p className="mt-2 text-2xl font-bold">{value}</p></CardContent></Card>)}</div></main>;
}

export function PrimaryTabStandby({ tab }: { tab: PrimaryTabName }) {
  if (tab === "nutrition") return <NutritionStandby />;
  if (tab === "parks") return <ParksStandby />;
  if (tab === "community") return <CommunityStandby />;
  if (tab === "rewards") return <RewardsStandby />;
  if (tab === "profile") return <ProfileStandby />;
  return <HomeStandby />;
}
