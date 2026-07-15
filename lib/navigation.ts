export const desktopPrimaryNavigation = [
  { key: "home", label: "Home", href: "/home" },
  { key: "train", label: "Train", href: "/workouts" },
  { key: "parks", label: "Parks", href: "/parks" },
  { key: "community", label: "Community", href: "/feed" },
  { key: "rewards", label: "Rewards", href: "/rewards" },
  { key: "pricing", label: "Pricing", href: "/pro" },
  { key: "profile", label: "Profile", href: "/profile" },
] as const;

export const mobilePrimaryNavigation = desktopPrimaryNavigation.filter(
  ({ key }) => key !== "community" && key !== "pricing"
);

export type PrimaryNavigationKey =
  (typeof desktopPrimaryNavigation)[number]["key"];

function matchesRoute(pathname: string, route: string) {
  return pathname === route || pathname.startsWith(`${route}/`);
}

export function getActivePrimaryNavigation(
  pathname: string
): PrimaryNavigationKey | null {
  if (matchesRoute(pathname, "/home")) return "home";

  if (
    matchesRoute(pathname, "/workouts") ||
    matchesRoute(pathname, "/routines") ||
    matchesRoute(pathname, "/exercises") ||
    matchesRoute(pathname, "/profile/records")
  ) {
    return "train";
  }

  if (
    matchesRoute(pathname, "/parks") ||
    matchesRoute(pathname, "/my-parks") ||
    matchesRoute(pathname, "/submit-park")
  ) {
    return "parks";
  }

  if (matchesRoute(pathname, "/feed") || matchesRoute(pathname, "/users")) {
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
  "/parks",
  "/my-parks",
  "/submit-park",
  "/feed",
  "/users",
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
