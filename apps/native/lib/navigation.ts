export const nativePrimaryTabs = [
  { key: "home", label: "Home", href: "/home", symbol: "H" },
  { key: "nutrition", label: "Nutrition", href: "/nutrition", symbol: "N" },
  { key: "parks", label: "Parks", href: "/parks", symbol: "P" },
  { key: "community", label: "Community", href: "/feed", symbol: "C" },
  { key: "rewards", label: "Rewards", href: "/rewards", symbol: "R" },
] as const;

export type NativePrimaryHref = (typeof nativePrimaryTabs)[number]["href"];

export type NativeNavigationIntent = {
  generation: number;
  href: NativePrimaryHref;
};

export function getNativePrimaryHref(pathname: string): NativePrimaryHref {
  return (
    nativePrimaryTabs.find(
      ({ href }) => pathname === href || pathname.startsWith(`${href}/`)
    )?.href ?? "/home"
  );
}

export function beginNativeNavigationIntent(
  generation: number,
  href: NativePrimaryHref
): NativeNavigationIntent {
  return { generation: generation + 1, href };
}
