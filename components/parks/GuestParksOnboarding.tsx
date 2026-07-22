"use client";

import Image from "next/image";
import Link from "next/link";
import {
  Dumbbell,
  Gift,
  MapPin,
  MapPinned,
  TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type GuestParksOnboardingProps = {
  parkCount?: number;
  onExplore: () => void;
  createAccountHref: string;
  signInHref: string;
};

const benefits = [
  {
    icon: Dumbbell,
    label: "Track your training",
    description: "Log workouts, routines, sets, reps, and progress.",
  },
  {
    icon: TrendingUp,
    label: "Measure your progress",
    description: "Follow your consistency, volume, and personal records.",
  },
  {
    icon: Gift,
    label: "Earn real rewards",
    description: "Use activity points to unlock partner benefits.",
  },
] as const;

export function GuestParksOnboarding({
  parkCount,
  onExplore,
  createAccountHref,
  signInHref,
}: GuestParksOnboardingProps) {
  return (
    <div className="absolute inset-0 z-[60] flex items-end bg-background/45 p-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] sm:items-center sm:justify-center sm:bg-background/35 sm:p-6 md:justify-start md:p-8 lg:p-12">
      <Card
        className="w-full max-w-md border-border bg-card py-0 shadow-xl md:max-w-[26rem]"
        aria-labelledby="guest-parks-title"
        aria-describedby="guest-parks-description"
      >
        <CardContent className="space-y-3 p-5 sm:space-y-4 sm:p-6">
          <div className="flex items-center gap-2">
            <Image
              src="/icons/icon.png"
              alt=""
              width={28}
              height={28}
              className="size-7 rounded-md"
              priority
            />
            <p className="text-xs font-semibold tracking-[0.14em] text-primary uppercase">
              Welcome to Calistheni
            </p>
          </div>

          <div className="space-y-2">
            <h1
              id="guest-parks-title"
              className="text-2xl leading-tight font-semibold tracking-tight sm:text-3xl"
            >
              Train. Track. Earn.
            </h1>
            <p
              id="guest-parks-description"
              className="text-sm leading-relaxed text-muted-foreground"
            >
              <span className="sm:hidden">
                Track workouts, measure progress, discover parks, connect with
                athletes, and unlock partner rewards.
              </span>
              <span className="hidden sm:inline">
                Calistheni brings your training into one place. Track workouts,
                measure your progress, discover outdoor parks, connect with
                athletes, and unlock rewards from partner brands.
              </span>
            </p>
          </div>

          <ul
            className="grid gap-2"
            aria-label="What you can do with Calistheni"
          >
            {benefits.map(({ icon: Icon, label, description }) => (
              <li key={label} className="flex items-center gap-3 text-sm">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="size-4" aria-hidden="true" />
                </span>
                <span className="min-w-0">
                  <span className="block font-medium">{label}</span>
                  <span className="hidden text-xs text-muted-foreground sm:block">
                    {description}
                  </span>
                </span>
              </li>
            ))}
          </ul>

          <div className="flex items-center gap-3 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 sm:py-2.5">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-background text-primary sm:size-8">
              <MapPin className="size-4" aria-hidden="true" />
            </span>
            <span className="min-w-0 text-sm">
              <span className="block font-medium sm:hidden">
                Currently viewing: Parks
              </span>
              <span className="hidden font-medium sm:block">
                You are viewing Parks
              </span>
              <span className="hidden text-xs text-muted-foreground sm:block">
                Explore outdoor training locations and available equipment.
              </span>
            </span>
          </div>

          {parkCount && parkCount > 0 ? (
            <div className="flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              <MapPinned
                className="size-4 shrink-0 text-primary"
                aria-hidden="true"
              />
              <span>
                {parkCount.toLocaleString()} parks available worldwide
              </span>
            </div>
          ) : null}

          <div className="grid gap-2 pt-1">
            <Button type="button" size="lg" onClick={onExplore}>
              <MapPinned aria-hidden="true" />
              Explore the map
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link href={createAccountHref}>Get started free</Link>
            </Button>
            <Button asChild variant="ghost" size="lg">
              <Link href={signInHref}>Sign in</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
