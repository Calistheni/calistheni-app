import type { Metadata } from "next";
import Link from "next/link";
import { Flag, ShieldCheck, UserRoundX } from "lucide-react";
import { PublicSiteFooter } from "@/components/navigation/PublicSiteFooter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Community Guidelines",
  description: "Rules for safe and respectful participation in Calistheni.",
};

const rules = [
  ["Be respectful", "Do not harass, bully, threaten, stalk, or target others."],
  ["No hateful conduct", "Do not attack people based on protected characteristics or promote discrimination."],
  ["Keep content appropriate", "Do not post sexual, violent, exploitative, or otherwise abusive material."],
  ["Protect privacy", "Do not share another person's private information, location, or images without permission."],
  ["Be authentic", "Do not spam, impersonate others, manipulate engagement, or submit misleading park information."],
  ["Train safely", "Do not encourage dangerous activities, self-harm, illegal conduct, or unsafe use of equipment."],
] as const;

export default function CommunityGuidelinesPage() {
  return (
    <>
      <main className="mx-auto w-full max-w-4xl space-y-8 px-4 py-10 sm:px-6 sm:py-14">
        <section className="space-y-3">
          <p className="text-sm font-medium text-primary">Calistheni community safety</p>
          <h1 className="text-4xl font-bold tracking-tight">Community Guidelines</h1>
          <p className="max-w-3xl text-muted-foreground">
            Calistheni is for sharing training progress and useful park information in a safe,
            supportive environment. These rules apply to profiles, workouts, comments, park
            submissions, photos, and every other community surface.
          </p>
        </section>

        <section aria-labelledby="community-rules" className="space-y-4">
          <h2 id="community-rules" className="text-2xl font-bold">Our rules</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {rules.map(([title, description]) => (
              <Card key={title}>
                <CardHeader><h3 className="font-semibold">{title}</h3></CardHeader>
                <CardContent className="text-sm text-muted-foreground">{description}</CardContent>
              </Card>
            ))}
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader><Flag aria-hidden="true" /><h2 className="font-semibold">Report concerns</h2></CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Use the menu beside a workout, comment, or profile. Reports are confidential and
              the reported person is not shown who submitted them.
            </CardContent>
          </Card>
          <Card>
            <CardHeader><UserRoundX aria-hidden="true" /><h2 className="font-semibold">Block unwanted contact</h2></CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Blocking removes follow relationships and hides community content and interactions
              in both directions. Manage blocks from Profile → Blocked Users.
            </CardContent>
          </Card>
          <Card>
            <CardHeader><ShieldCheck aria-hidden="true" /><h2 className="font-semibold">How we enforce</h2></CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              We may hide content, restrict community access, or suspend accounts. Serious or
              repeated violations may result in account removal.
            </CardContent>
          </Card>
        </section>

        <section className="rounded-2xl border bg-muted/30 p-6">
          <h2 className="text-xl font-bold">Need help or want to appeal?</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Contact support with enough context for us to investigate. Do not include passwords,
            health details, or other sensitive information.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Button asChild>
              <a href="mailto:hello@calistheni.app">Contact Support</a>
            </Button>
            <Button asChild variant="outline"><Link href="/profile">Open Profile Settings</Link></Button>
          </div>
        </section>
      </main>
      <PublicSiteFooter />
    </>
  );
}
