export const desktopPrimaryNavigation = [
  { key: "home", label: "Home", href: "/home" },
  { key: "nutrition", label: "Nutrition", href: "/nutrition" },
  { key: "parks", label: "Parks", href: "/parks" },
  { key: "community", label: "Community", href: "/feed" },
  { key: "rewards", label: "Rewards", href: "/rewards" },
  { key: "pricing", label: "Pricing", href: "/pro" },
  { key: "profile", label: "Profile", href: "/profile" },
] as const;

export const mobilePrimaryNavigation = desktopPrimaryNavigation.filter(
  ({ key }) => key !== "pricing"
);

export const primaryTabNavigation = [
  desktopPrimaryNavigation[0],
  desktopPrimaryNavigation[1],
  desktopPrimaryNavigation[2],
  desktopPrimaryNavigation[3],
  desktopPrimaryNavigation[4],
  desktopPrimaryNavigation[6],
] as const;

export type PrimaryTabHref = (typeof primaryTabNavigation)[number]["href"];

export const PRIMARY_TAB_COOKIE_NAME = "calistheni-primary-route";

export function getPrimaryTabHref(pathname: string): PrimaryTabHref | null {
  const tab = primaryTabNavigation.find(
    ({ href }) => pathname === href || pathname.startsWith(`${href}/`)
  );

  return tab?.href ?? null;
}

export function getPrimaryTabCookieValue(pathname: string) {
  return getPrimaryTabHref(pathname)?.slice(1) ?? null;
}

export function getPrimaryTabHrefFromCookie(
  value: string | undefined
): PrimaryTabHref | null {
  return (
    primaryTabNavigation.find(({ href }) => href.slice(1) === value)?.href ??
    null
  );
}

export type PrimaryNavigationKey =
  (typeof desktopPrimaryNavigation)[number]["key"];

function matchesRoute(pathname: string, route: string) {
  return pathname === route || pathname.startsWith(`${route}/`);
}

export function getActivePrimaryNavigation(
  pathname: string
): PrimaryNavigationKey | null {
  if (matchesRoute(pathname, "/home")) return "home";

  if (matchesRoute(pathname, "/nutrition")) return "nutrition";

  if (
    matchesRoute(pathname, "/parks") ||
    matchesRoute(pathname, "/my-parks") ||
    matchesRoute(pathname, "/submit-park")
  ) {
    return "parks";
  }

  if (matchesRoute(pathname, "/feed") || matchesRoute(pathname, "/users") || matchesRoute(pathname, "/activity")) {
    return "community";
  }

  if (matchesRoute(pathname, "/rewards")) return "rewards";

  if (matchesRoute(pathname, "/pro")) return "pricing";

  if (matchesRoute(pathname, "/profile")) return "profile";

  return null;
}

const signedInShellRoutes = [
  "/home",
  "/workouts",
  "/routines",
  "/exercises",
  "/nutrition",
  "/parks",
  "/my-parks",
  "/submit-park",
  "/feed",
  "/users",
  "/activity",
  "/profile",
  "/rewards",
  "/pro",
] as const;

export function usesSignedInAppShell(pathname: string) {
  if (matchesRoute(pathname, "/pro/success")) return false;

  return signedInShellRoutes.some((route) => matchesRoute(pathname, route));
}

export function isWorkoutBuilderRoute(pathname: string) {
  return (
    matchesRoute(pathname, "/workouts/new") ||
    /^\/workouts\/[^/]+\/edit(?:\/|$)/.test(pathname)
  );
}

export function isFullBleedAppRoute(pathname: string) {
  return pathname === "/parks";
}
