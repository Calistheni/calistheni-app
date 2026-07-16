import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  Check,
  CheckCircle2,
  Coffee,
  Coins,
  Dumbbell,
  HeartPulse,
  MapPin,
  Megaphone,
  Salad,
  Shirt,
  UserRound,
  UsersRound,
  Zap,
} from "lucide-react";
import { auth } from "@/auth";
import { PublicSiteFooter } from "@/components/navigation/PublicSiteFooter";
import { PublicSiteHeader } from "@/components/navigation/PublicSiteHeader";
import { PartnerInterestForm } from "@/components/partners/PartnerInterestForm";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Partner with Calistheni",
  description:
    "Connect your fitness, wellness, or sports brand with active Calistheni users through meaningful rewards and partner campaigns.",
  alternates: { canonical: "/partners" },
  openGraph: {
    title: "Partner with Calistheni",
    description:
      "Connect your fitness, wellness, or sports brand with active Calistheni users through meaningful rewards and partner campaigns.",
    url: "/partners",
  },
};

const outcomes = [
  {
    title: "Reach active athletes",
    description:
      "Your reward appears to people already engaged in training.",
    icon: UsersRound,
  },
  {
    title: "Drive real customer visits",
    description: "Give users a reason to visit, enquire, or purchase.",
    icon: MapPin,
  },
  {
    title: "Build lasting brand awareness",
    description:
      "Become part of a useful reward experience instead of another generic ad.",
    icon: Megaphone,
  },
];

const rewardBenefits = [
  "Fully customize the offer",
  "Appears in the rewards experience",
  "Unlocked through eligible activity",
  "Redeemed with the partner",
];

const partnershipSteps = [
  {
    title: "Create your reward",
    description: "Choose the offer and conditions.",
  },
  {
    title: "Athletes train and earn",
    description: "Eligible activity builds their points.",
  },
  {
    title: "They unlock your reward",
    description: "Your offer becomes available.",
  },
  {
    title: "They visit your business",
    description: "Redemption brings them to you.",
  },
];

const partnerCategories = [
  { label: "Gyms and fitness studios", icon: Dumbbell },
  { label: "Supplement stores", icon: Salad },
  { label: "Sportswear brands", icon: Shirt },
  { label: "Recovery clinics", icon: HeartPulse },
  { label: "Healthy cafés", icon: Coffee },
  { label: "Personal trainers", icon: UserRound },
  { label: "Sports equipment", icon: Dumbbell },
  { label: "Wellness brands", icon: HeartPulse },
  { label: "Yoga studios", icon: UsersRound },
  { label: "Energy drinks", icon: Zap },
];

const trustPoints = [
  "No long-term commitment required",
  "You control the offer and conditions",
  "Partnership terms are discussed individually",
];

const faqs = [
  {
    question: "How much does it cost to become a partner?",
    answer:
      "Partnership terms are discussed individually based on the offer and collaboration.",
  },
  {
    question: "How will athletes find my reward?",
    answer:
      "Your offer can appear in the Calistheni rewards experience for eligible users to discover.",
  },
  {
    question: "Can I update or pause my reward?",
    answer:
      "Offer changes and pauses are handled with Calistheni according to the agreed campaign conditions.",
  },
  {
    question: "What rewards work best?",
    answer:
      "Clear, useful, and easy-to-redeem offers tend to be the strongest starting point.",
  },
  {
    question: "How is redemption verified?",
    answer:
      "The redemption approach is agreed with each partner before the reward launches.",
  },
];

function PartnerPhoneMockup() {
  const nearbyRewards = [
    { name: "Example Gym", offer: "Day pass", points: "1,000" },
    { name: "Example Recovery", offer: "First session", points: "600" },
  ];

  return (
    <div className="relative isolate mx-auto w-full max-w-[24rem] px-4 py-6 sm:px-6 sm:py-8">
      <div
        aria-hidden="true"
        className="absolute top-1/2 left-1/2 -z-20 h-[82%] w-[118%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(37,99,235,0.24)_0%,rgba(59,130,246,0.11)_42%,transparent_72%)] blur-2xl"
      />
      <div
        aria-hidden="true"
        className="absolute top-[14%] left-[18%] -z-10 h-1/2 w-1/2 rounded-full bg-primary/10 blur-3xl"
      />

      <div className="relative mx-auto aspect-[9/19.5] w-full max-w-[21rem] -translate-y-1 rounded-[3.45rem] bg-gradient-to-br from-zinc-400 via-zinc-950 to-zinc-600 p-[3px] shadow-[0_35px_80px_-28px_rgba(0,0,0,0.75),0_18px_48px_-26px_rgba(37,99,235,0.55)] lg:rotate-[2deg]">
        <span
          aria-hidden="true"
          className="absolute top-[18%] -left-[5px] h-8 w-1 rounded-l-sm bg-zinc-500 shadow-sm"
        />
        <span
          aria-hidden="true"
          className="absolute top-[27%] -left-[5px] h-14 w-1 rounded-l-sm bg-zinc-500 shadow-sm"
        />
        <span
          aria-hidden="true"
          className="absolute top-[36%] -left-[5px] h-14 w-1 rounded-l-sm bg-zinc-500 shadow-sm"
        />
        <span
          aria-hidden="true"
          className="absolute top-[29%] -right-[5px] h-20 w-1 rounded-r-sm bg-zinc-600 shadow-sm"
        />

        <div className="relative size-full rounded-[3.25rem] bg-black p-[6px] shadow-inner shadow-white/10">
          <div className="pointer-events-none absolute inset-[3px] z-30 rounded-[3.25rem] border border-white/15" />
          <div className="pointer-events-none absolute inset-y-10 left-[5px] z-30 w-px bg-gradient-to-b from-transparent via-white/35 to-transparent" />

          <div className="relative size-full overflow-hidden rounded-[2.8rem] border border-white/5 bg-background">
            <div
              aria-hidden="true"
              className="absolute top-3 left-1/2 z-30 flex h-7 w-24 -translate-x-1/2 items-center justify-center gap-2 rounded-full bg-black shadow-lg shadow-black/40"
            >
              <span className="h-1 w-8 rounded-full bg-zinc-800" />
              <span className="size-2 rounded-full bg-blue-950 ring-1 ring-zinc-700" />
            </div>

            <div className="h-full overflow-hidden px-5 pt-16 pb-8">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-medium text-muted-foreground">
                Example app preview
              </p>
              <h2 className="mt-1 text-xl font-bold">Rewards</h2>
            </div>
            <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-sm font-bold text-primary-foreground">
              C
            </span>
          </div>

          <div className="mt-5 rounded-2xl bg-primary p-4 text-primary-foreground">
            <p className="text-xs text-primary-foreground/75">
              Illustrative balance
            </p>
            <div className="mt-1 flex items-center gap-2">
              <Coins className="size-5" aria-hidden="true" />
              <span className="text-2xl font-bold">1,240</span>
              <span className="text-sm">Calis Points</span>
            </div>
          </div>

          <div className="mt-5 rounded-2xl border bg-card p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 font-bold text-primary">
                  EN
                </span>
                <div className="min-w-0">
                  <p className="truncate text-xs text-muted-foreground">
                    Example Nutrition
                  </p>
                  <p className="mt-0.5 leading-tight font-semibold">
                    15% off your next purchase
                  </p>
                </div>
              </div>
              <BadgeCheck
                className="size-5 shrink-0 text-primary"
                aria-hidden="true"
              />
            </div>
            <div className="mt-4 flex items-center justify-between gap-3 border-t pt-3">
              <span className="flex items-center gap-1.5 text-sm font-medium">
                <Coins className="size-4 text-primary" aria-hidden="true" />
                800 points
              </span>
              <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
                Unlocked
              </span>
            </div>
          </div>

          <p className="mt-5 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
            More example rewards
          </p>
          <div className="mt-2 space-y-2">
            {nearbyRewards.map((reward) => (
              <div
                key={reward.name}
                className="flex items-center gap-3 rounded-xl border bg-muted/20 px-3 py-2.5"
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-xs font-bold text-primary">
                  {reward.name === "Example Gym" ? "EG" : "ER"}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs text-muted-foreground">
                    {reward.name}
                  </p>
                  <p className="text-sm font-medium">{reward.offer}</p>
                </div>
                <span className="text-xs font-medium text-muted-foreground">
                  {reward.points}
                </span>
              </div>
            ))}
          </div>
            </div>

            <div
              aria-hidden="true"
              className="absolute bottom-2.5 left-1/2 h-1 w-24 -translate-x-1/2 rounded-full bg-foreground/75"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function PartnerRewardShowcase() {
  return (
    <div className="mx-auto w-full max-w-lg rounded-3xl border bg-card p-5 shadow-xl shadow-black/10 sm:p-7">
      <div className="flex items-center justify-between gap-4">
        <span className="text-xs font-semibold tracking-[0.16em] text-primary uppercase">
          Example partner reward
        </span>
        <span className="rounded-full border bg-muted/40 px-3 py-1 text-xs text-muted-foreground">
          Unlocked
        </span>
      </div>

      <div className="mt-7 flex items-start gap-4 sm:gap-5">
        <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-lg font-bold text-primary sm:size-16">
          EG
        </span>
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">Example Gym</p>
          <h3 className="mt-1 text-2xl leading-tight font-bold sm:text-3xl">
            Free day pass
          </h3>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Valid at participating example locations. Partner conditions apply.
          </p>
        </div>
      </div>

      <div className="mt-7 flex flex-col gap-3 border-t pt-5 min-[360px]:flex-row min-[360px]:items-center min-[360px]:justify-between">
        <span className="flex items-center gap-2 font-semibold">
          <Coins className="size-5 text-primary" aria-hidden="true" />
          1,000 Calis Points
        </span>
        <span className="inline-flex h-10 items-center justify-center rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground">
          Redeem with partner
        </span>
      </div>
      <p className="mt-4 text-xs text-muted-foreground">
        Illustrative reward — not a current partner offer
      </p>
    </div>
  );
}

export default async function PartnersPage() {
  const session = await auth();

  return (
    <div className="min-h-dvh bg-background">
      <PublicSiteHeader signedIn={Boolean(session?.user)} />

      <main>
        <section className="relative overflow-hidden border-b">
          <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_80%_20%,var(--color-primary),transparent_34%)] opacity-[0.08]" />
          <div className="mx-auto grid max-w-7xl items-center gap-14 px-4 py-16 sm:px-6 sm:py-20 lg:min-h-[calc(78dvh-3.5rem)] lg:grid-cols-[minmax(0,1fr)_minmax(22rem,0.78fr)] lg:gap-20 lg:py-24">
            <div className="text-center lg:text-left">
              <p className="text-xs font-semibold tracking-[0.18em] text-primary uppercase">
                Now open to early partner brands
              </p>
              <h1 className="mx-auto mt-6 max-w-3xl text-5xl leading-[0.98] font-bold tracking-[-0.045em] sm:text-6xl lg:mx-0 lg:text-7xl xl:text-8xl">
                Your brand.
                <span className="mt-1 block">
                  <span className="text-primary">Their next</span> reward.
                </span>
              </h1>
              <p className="mx-auto mt-8 max-w-2xl text-lg leading-8 text-muted-foreground lg:mx-0 lg:max-w-xl">
                Calistheni connects your business with people who actively
                train. Offer a useful reward and become part of their progress.
              </p>
              <div className="mt-10 flex flex-col items-center justify-center gap-4 min-[360px]:flex-row lg:justify-start">
                <Button asChild size="lg" className="min-w-44">
                  <Link href="#contact">
                    Become a partner
                    <ArrowRight aria-hidden="true" />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="ghost">
                  <Link href="#how-it-works">See how it works</Link>
                </Button>
              </div>
            </div>

            <div className="mx-auto w-full lg:mx-0 lg:justify-self-end">
              <PartnerPhoneMockup />
            </div>
          </div>
        </section>

        <section className="py-16 lg:py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="max-w-2xl">
              <p className="text-xs font-semibold tracking-[0.18em] text-primary uppercase">
                Why partner with Calistheni
              </p>
              <h2 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl">
                Marketing that moves with your customer
              </h2>
            </div>

            <div className="mt-12 grid gap-8 md:grid-cols-3 md:gap-10">
              {outcomes.map((outcome) => {
                const Icon = outcome.icon;
                return (
                  <div key={outcome.title} className="relative pt-6">
                    <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-primary/60 via-border to-transparent" />
                    <div className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                      <Icon className="size-6" aria-hidden="true" />
                    </div>
                    <h3 className="mt-6 text-xl font-semibold">
                      {outcome.title}
                    </h3>
                    <p className="mt-3 text-base leading-7 text-muted-foreground">
                      {outcome.description}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section className="bg-muted/25 py-20 lg:py-24">
          <div className="mx-auto grid max-w-7xl items-center gap-14 px-4 sm:px-6 md:grid-cols-2 md:gap-16 lg:gap-24">
            <PartnerRewardShowcase />

            <div>
              <p className="text-xs font-semibold tracking-[0.18em] text-primary uppercase">
                The reward experience
              </p>
              <h2 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl">
                A reward card that feels earned.
              </h2>
              <p className="mt-6 text-lg leading-8 text-muted-foreground">
                Your offer appears when users are already tracking progress and
                planning their next session — not inside a random advertisement.
              </p>

              <ul className="mt-8 space-y-4">
                {rewardBenefits.map((benefit) => (
                  <li key={benefit} className="flex items-center gap-3">
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <Check className="size-4" aria-hidden="true" />
                    </span>
                    <span className="text-base font-medium">{benefit}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section id="how-it-works" className="scroll-mt-20 py-16">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="text-center">
              <p className="text-xs font-semibold tracking-[0.18em] text-primary uppercase">
                Partnership flow
              </p>
              <h2 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">
                Simple by design
              </h2>
            </div>

            <div className="relative mt-12">
              <div
                aria-hidden="true"
                className="absolute top-5 right-[12.5%] left-[12.5%] hidden h-px bg-border md:block"
              />
              <ol className="grid gap-6 md:grid-cols-4 md:gap-8">
                {partnershipSteps.map((step, index) => (
                  <li
                    key={step.title}
                    className="relative flex items-start gap-4 md:block md:text-center"
                  >
                    <span className="relative z-10 flex size-10 shrink-0 items-center justify-center rounded-full border-2 border-primary/40 bg-background text-sm font-bold text-primary md:mx-auto">
                      {index + 1}
                    </span>
                    <div className="pt-0.5 md:mt-5 md:pt-0">
                      <h3 className="text-base font-semibold">{step.title}</h3>
                      <p className="mt-2 text-sm leading-6 text-muted-foreground">
                        {step.description}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </section>

        <section className="bg-muted/25 py-16 lg:py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="text-center">
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
                Is this your business?
              </h2>
              <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-muted-foreground">
                A good fit for businesses connected to fitness, wellness,
                recovery, nutrition, and active lifestyles.
              </p>
            </div>

            <div className="mx-auto mt-10 flex max-w-5xl flex-wrap justify-center gap-3">
              {partnerCategories.map((category) => {
                const Icon = category.icon;
                return (
                  <div
                    key={category.label}
                    className="inline-flex min-h-11 items-center gap-2.5 rounded-full border bg-background px-4 py-2.5"
                  >
                    <Icon
                      className="size-4 shrink-0 text-primary"
                      aria-hidden="true"
                    />
                    <span className="text-sm font-medium">{category.label}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section id="contact" className="scroll-mt-16 py-20 lg:py-24">
          <div className="mx-auto grid max-w-7xl gap-12 px-4 sm:px-6 lg:grid-cols-[minmax(0,0.8fr)_minmax(32rem,1fr)] lg:items-start lg:gap-20">
            <div className="lg:sticky lg:top-24">
              <p className="text-xs font-semibold tracking-[0.18em] text-primary uppercase">
                Early partner conversations
              </p>
              <h2 className="mt-4 text-3xl leading-tight font-bold tracking-tight sm:text-4xl lg:text-5xl">
                Let’s talk about your brand becoming a reward.
              </h2>
              <p className="mt-6 text-lg leading-8 text-muted-foreground">
                We are currently speaking with selected early partners. Tell us
                about your business and the kind of reward you would like to
                offer.
              </p>
              <ul className="mt-8 space-y-4">
                {trustPoints.map((point) => (
                  <li key={point} className="flex items-start gap-3">
                    <CheckCircle2
                      className="mt-0.5 size-5 shrink-0 text-primary"
                      aria-hidden="true"
                    />
                    <span className="text-base">{point}</span>
                  </li>
                ))}
              </ul>
            </div>

            <Card className="py-6 sm:py-8">
              <CardContent className="px-5 sm:px-8 lg:px-10">
                <PartnerInterestForm />
              </CardContent>
            </Card>
          </div>
        </section>

        <section className="border-t bg-muted/15 py-16">
          <div className="mx-auto max-w-4xl px-4 sm:px-6">
            <div className="text-center">
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
                Common questions
              </h2>
            </div>
            <Accordion type="single" collapsible className="mt-10">
              {faqs.map((faq, index) => (
                <AccordionItem key={faq.question} value={`faq-${index}`}>
                  <AccordionTrigger className="py-5 text-base sm:text-lg">
                    {faq.question}
                  </AccordionTrigger>
                  <AccordionContent className="pb-5 text-base leading-7 text-muted-foreground">
                    {faq.answer}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </section>
      </main>

      <PublicSiteFooter />
    </div>
  );
}
