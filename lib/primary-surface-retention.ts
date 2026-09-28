import { isValidElement, type ReactNode } from "react";

export function isPendingPrimarySurface(node: ReactNode): boolean {
  if (Array.isArray(node)) return node.some(isPendingPrimarySurface);
  if (!isValidElement(node)) return false;
  const props = node.props as { children?: ReactNode; "data-primary-tab-data"?: string };
  if (props["data-primary-tab-data"] === "pending") return true;
  return props.children !== undefined && isPendingPrimarySurface(props.children);
}

export function retainLastResolvedPrimarySurface(
  previous: ReactNode | undefined,
  candidate: ReactNode
) {
  return isPendingPrimarySurface(candidate) ? previous ?? candidate : candidate;
}

export function selectResolvedPrimaryHref({
  requestedHref,
  previousHref,
  requestedSurface,
}: {
  requestedHref: string | null;
  previousHref: string | null;
  requestedSurface: ReactNode;
}) {
  if (!requestedHref || isPendingPrimarySurface(requestedSurface)) {
    return previousHref;
  }

  return requestedHref;
}
