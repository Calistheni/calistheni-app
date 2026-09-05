import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  findPrimaryRouteScrollOwner,
  getPrimaryNavigationTapAction,
  scrollPrimaryRouteToTop,
} from "@/lib/navigation-scroll";

test("repeated primary navigation taps scroll while different destinations navigate", () => {
  for (const route of ["/home", "/nutrition", "/feed", "/profile"]) {
    assert.equal(getPrimaryNavigationTapAction(route, route, false), "scroll");
  }
  assert.equal(
    getPrimaryNavigationTapAction("/home", "/nutrition", false),
    "navigate"
  );
  assert.equal(getPrimaryNavigationTapAction("/parks", "/parks", true), "none");
});

test("the explicit current-page scroll owner is preferred over the shell", () => {
  const explicit = { scrollHeight: 900, clientHeight: 400, scrollTo() {} };
  const shell = { scrollHeight: 800, clientHeight: 400, scrollTo() {} };
  const documentObject = {
    querySelector(selector: string) {
      return selector === "[data-primary-route-scroll-owner]"
        ? explicit
        : shell;
    },
    scrollingElement: null,
    documentElement: {},
    body: {},
  };
  const windowObject = {
    getComputedStyle() {
      return { overflowY: "auto" };
    },
    scrollTo() {},
  };

  assert.equal(
    findPrimaryRouteScrollOwner(
      documentObject as never,
      windowObject as never
    ),
    explicit
  );
});

test("scroll-to-top uses a real internal owner and otherwise the window", () => {
  const elementCalls: ScrollToOptions[] = [];
  const windowCalls: ScrollToOptions[] = [];
  const shell = {
    scrollHeight: 900,
    clientHeight: 400,
    scrollTo(options: ScrollToOptions) {
      elementCalls.push(options);
    },
  };
  const makeDocument = (element: typeof shell | null) => ({
    querySelector(selector: string) {
      return selector === ".app-shell-content" ? element : null;
    },
    scrollingElement: null,
    documentElement: {},
    body: {},
  });
  const windowObject = {
    getComputedStyle() {
      return { overflowY: "auto" };
    },
    scrollTo(options: ScrollToOptions) {
      windowCalls.push(options);
    },
  };

  assert.equal(
    scrollPrimaryRouteToTop(
      makeDocument(shell) as never,
      windowObject as never
    ),
    "element"
  );
  assert.deepEqual(elementCalls, [{ top: 0, left: 0, behavior: "smooth" }]);

  assert.equal(
    scrollPrimaryRouteToTop(
      makeDocument(null) as never,
      windowObject as never
    ),
    "window"
  );
  assert.deepEqual(windowCalls, [{ top: 0, left: 0, behavior: "smooth" }]);
});

test("mobile and desktop navigation share the same same-route click handler", () => {
  const shell = readFileSync(
    new URL("../components/navigation/AppShell.tsx", import.meta.url),
    "utf8"
  );
  assert.equal(
    shell.match(/handlePrimaryNavigationClick\(event, item\.href\)/g)?.length,
    2
  );
  assert.match(shell, /event\.preventDefault\(\)/);
  assert.doesNotMatch(shell, /window\.location|location\.reload/);
});
