import { getActivePrimaryNavigation } from "@/lib/navigation";

export type PrimaryNavigationIntent = {
  generation: number;
  href: string;
};

export function beginPrimaryNavigationIntent(
  generation: number,
  href: string
): PrimaryNavigationIntent {
  return { generation: generation + 1, href };
}

export function settlePrimaryNavigationIntent(
  current: PrimaryNavigationIntent | null,
  settledGeneration: number,
  pathname: string
): PrimaryNavigationIntent | null {
  if (
    !current ||
    current.generation !== settledGeneration ||
    getActivePrimaryNavigation(pathname) !==
      getActivePrimaryNavigation(current.href)
  ) {
    return current;
  }

  return null;
}
