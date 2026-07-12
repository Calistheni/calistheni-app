import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { redirectIfOnboardingRequired } from "@/lib/onboarding";

export const metadata: Metadata = {
  title: "Home",
  robots: {
    index: false,
    follow: false,
  },
};

const sections = [
  {
    title: "Map",
    description: "Find outdoor workout parks near you and around the world.",
    actions: [{ label: "Open Map", href: "/" }],
  },
  {
    title: "Workout",
    description: "Track sessions, browse exercises, and review your history.",
    actions: [
      { label: "Start Workout", href: "/workouts/new" },
      { label: "Workout History", href: "/workouts" },
      { label: "Browse Exercises", href: "/exercises" },
    ],
  },
  {
    title: "Profile",
    description: "Manage your account, submitted parks, and training activity.",
    actions: [
      { label: "My Profile", href: "/profile" },
      { label: "My Parks", href: "/my-parks" },
      { label: "Workout Feed", href: "/feed" },
    ],
  },
];

export default async function HomeHubPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  await redirectIfOnboardingRequired(session.user.id);

  return (
    <main className="mx-auto w-full max-w-5xl p-4 sm:p-6 lg:p-8">
      <div className="mb-8">
        <p className="text-sm font-medium text-muted-foreground">
          Welcome back
        </p>
        <h1 className="text-4xl font-bold tracking-tight">
          {session.user.name ?? "Calistheni"}
        </h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          Your map, workouts, and profile tools are ready. Pick a lane and keep
          moving.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {sections.map((section) => (
          <Card key={section.title} className="h-full">
            <CardHeader>
              <h2 className="text-2xl font-bold">{section.title}</h2>
              <p className="text-sm text-muted-foreground">
                {section.description}
              </p>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {section.actions.map((action, index) => (
                <Button
                  key={action.href}
                  asChild
                  variant={index === 0 ? "default" : "outline"}
                >
                  <Link href={action.href}>{action.label}</Link>
                </Button>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    </main>
  );
}
