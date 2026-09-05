type ScrollTarget = {
  scrollTo(options: ScrollToOptions): void;
  scrollHeight: number;
  clientHeight: number;
};

type ScrollDocument = Pick<
  Document,
  "querySelector" | "scrollingElement" | "documentElement" | "body"
>;

type ScrollWindow = Pick<Window, "getComputedStyle" | "scrollTo">;

const SCROLLABLE_OVERFLOW = /^(auto|scroll|overlay)$/;

export function getPrimaryNavigationTapAction(
  pathname: string,
  href: string,
  isFullBleed: boolean
) {
  if (pathname !== href) return "navigate" as const;
  return isFullBleed ? ("none" as const) : ("scroll" as const);
}

/**
 * Primary routes normally use document scrolling, but this marker gives a
 * route with a real internal viewport one explicit scroll owner. The shell
 * fallback covers any route whose shell content itself becomes scrollable.
 */
export function findPrimaryRouteScrollOwner(
  documentObject: ScrollDocument = document,
  windowObject: ScrollWindow = window
): ScrollTarget | null {
  const explicitOwner = documentObject.querySelector<HTMLElement>(
    "[data-primary-route-scroll-owner]"
  );
  if (explicitOwner) return explicitOwner;

  const shellContent = documentObject.querySelector<HTMLElement>(
    ".app-shell-content"
  );
  if (
    shellContent &&
    SCROLLABLE_OVERFLOW.test(windowObject.getComputedStyle(shellContent).overflowY) &&
    shellContent.scrollHeight > shellContent.clientHeight
  ) {
    return shellContent;
  }

  return null;
}

export function scrollPrimaryRouteToTop(
  documentObject: ScrollDocument = document,
  windowObject: ScrollWindow = window
) {
  const scrollOwner = findPrimaryRouteScrollOwner(
    documentObject,
    windowObject
  );
  const options: ScrollToOptions = {
    top: 0,
    left: 0,
    behavior: "smooth",
  };

  if (scrollOwner) {
    scrollOwner.scrollTo(options);
    return "element" as const;
  }

  windowObject.scrollTo(options);
  return "window" as const;
}
