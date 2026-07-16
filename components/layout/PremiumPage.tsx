import Link from "next/link";
import { ArrowRight, type LucideIcon } from "lucide-react";

export function PremiumEyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-semibold tracking-[0.18em] text-primary uppercase">
      {children}
    </p>
  );
}

export function PremiumSectionHeading({
  id,
  eyebrow,
  title,
  description,
  action,
}: {
  id: string;
  eyebrow?: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-7 flex items-end justify-between gap-4 sm:mb-9">
      <div>
        {eyebrow ? <PremiumEyebrow>{eyebrow}</PremiumEyebrow> : null}
        <h2
          id={id}
          className={`${eyebrow ? "mt-3" : ""} text-2xl font-bold tracking-[-0.025em] sm:text-3xl lg:text-4xl`}
        >
          {title}
        </h2>
        {description ? (
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base sm:leading-7">
            {description}
          </p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

export function PremiumLinkCard({
  href,
  icon: Icon,
  title,
  description,
}: {
  href: string;
  icon: LucideIcon;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="group flex min-h-36 items-end justify-between gap-5 rounded-2xl border border-border/80 bg-card/70 p-5 transition-colors hover:border-primary/40 hover:bg-card sm:p-6"
    >
      <div>
        <span className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Icon className="size-5" aria-hidden="true" />
        </span>
        <h3 className="mt-5 text-lg font-semibold sm:text-xl">{title}</h3>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {description}
        </p>
      </div>
      <ArrowRight className="size-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-primary" />
    </Link>
  );
}
