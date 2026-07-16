import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export function PublicSiteHeader({ signedIn }: { signedIn: boolean }) {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4 sm:px-6">
        <Link
          href="/"
          aria-label="Calistheni home"
          className="flex shrink-0 items-center gap-2 font-semibold tracking-tight"
        >
          <Image
            src="/icons/icon.png"
            alt=""
            width={28}
            height={28}
            className="size-7 rounded-md"
            priority
          />
          <span>Calistheni</span>
        </Link>

        <nav
          aria-label="Public navigation"
          className="ml-auto hidden items-center gap-1 sm:flex"
        >
          <Button asChild variant="ghost" size="sm">
            <Link href="/parks">Parks</Link>
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link href="/rewards">Rewards</Link>
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link href="/pro">Pricing</Link>
          </Button>
          <Button asChild variant="secondary" size="sm">
            <Link href="/partners" aria-current="page">
              Partners
            </Link>
          </Button>
        </nav>

        <Button asChild size="sm" variant={signedIn ? "outline" : "default"}>
          <Link href={signedIn ? "/home" : "/login"}>
            {signedIn ? "Open app" : "Log in"}
          </Link>
        </Button>
      </div>
    </header>
  );
}
