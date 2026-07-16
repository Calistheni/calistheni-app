import Image from "next/image";
import Link from "next/link";

const links = [
  { label: "Parks", href: "/parks" },
  { label: "Rewards", href: "/rewards" },
  { label: "Pricing", href: "/pro" },
  { label: "Partners", href: "/partners" },
  { label: "Contact", href: "/partners#contact" },
];

export function PublicSiteFooter() {
  return (
    <footer className="border-t bg-muted/20">
      <div className="mx-auto flex max-w-7xl flex-col gap-5 px-4 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex items-center gap-3">
          <Image
            src="/icons/icon.png"
            alt=""
            width={28}
            height={28}
            className="size-7 rounded-md"
          />
          <p>© {new Date().getFullYear()} Calistheni</p>
        </div>
        <nav aria-label="Footer navigation" className="flex flex-wrap gap-x-5 gap-y-2">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="transition-colors hover:text-foreground"
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}
