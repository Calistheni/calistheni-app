import Link from "next/link";
import { cn } from "@/lib/utils";

type CommunityTab = "feed" | "people";

export function CommunityTabs({ active }: { active: CommunityTab }) {
  const tabs = [
    { key: "feed", label: "Feed", href: "/feed" },
    { key: "people", label: "People", href: "/users" },
  ] as const;

  return (
    <nav aria-label="Community sections" className="mb-6">
      <div className="grid w-full grid-cols-2 rounded-lg bg-muted p-1 sm:w-80">
        {tabs.map((tab) => (
          <Link
            key={tab.key}
            href={tab.href}
            aria-current={active === tab.key ? "page" : undefined}
            className={cn(
              "flex min-h-11 items-center justify-center rounded-md px-4 text-sm font-medium text-muted-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              active === tab.key && "bg-background text-foreground shadow-sm"
            )}
          >
            {tab.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
