"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";

export function PeopleSearchInput({ initialQuery }: { initialQuery: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(initialQuery);
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    const timeout = window.setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      const normalized = query.trim();

      if (normalized) params.set("q", normalized);
      else params.delete("q");
      params.delete("page");

      const next = params.size ? `${pathname}?${params}` : pathname;
      router.replace(next, { scroll: false });
    }, 350);

    return () => window.clearTimeout(timeout);
  }, [pathname, query, router, searchParams]);

  return (
    <div className="relative">
      <label htmlFor="people-search" className="sr-only">
        Search people by name or username
      </label>
      <Search
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        id="people-search"
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search name or username"
        className="h-11 pl-9"
        autoComplete="off"
      />
      <p className="mt-2 text-xs text-muted-foreground">
        Search begins after two characters. Email addresses are never searchable.
      </p>
    </div>
  );
}
