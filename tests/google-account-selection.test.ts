import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("explicit Google sign-in asks Google to select an account on web and native", async () => {
  const [button, nativeStart] = await Promise.all([
    readFile(
      new URL("components/auth/NativeGoogleSignInButton.tsx", root),
      "utf8"
    ),
    readFile(new URL("app/mobile/auth/start/page.tsx", root), "utf8"),
  ]);

  for (const source of [button, nativeStart]) {
    assert.match(
      source,
      /signIn\([\s\S]*"google"[\s\S]*prompt:\s*"select_account"/
    );
    assert.doesNotMatch(source, /prompt:\s*["']none["']/);
  }
});

test("a fresh native login clears only Calistheni's stale Browser session before account selection", async () => {
  const [
    button,
    attempt,
    browserStart,
    nativeStart,
    complete,
    accountMenu,
    mobileUtilities,
  ] = await Promise.all([
    readFile(
      new URL("components/auth/NativeGoogleSignInButton.tsx", root),
      "utf8"
    ),
    readFile(new URL("app/api/native-auth/attempt/route.ts", root), "utf8"),
    readFile(
      new URL("app/api/native-auth/browser-start/route.ts", root),
      "utf8"
    ),
    readFile(new URL("app/mobile/auth/start/page.tsx", root), "utf8"),
    readFile(new URL("app/api/auth/mobile/complete/route.ts", root), "utf8"),
    readFile(new URL("components/navigation/AccountMenu.tsx", root), "utf8"),
    readFile(
      new URL("components/profile/MobileAccountUtilities.tsx", root),
      "utf8"
    ),
  ]);

  assert.match(button, /intent: "login"/);
  assert.match(attempt, /body\.intent !== "login"/);
  assert.match(attempt, /startUrl\.searchParams\.set\("intent", "login"\)/);
  assert.match(browserStart, /intent !== "login"/);
  assert.match(browserStart, /getAuthSessionCookieName/);
  assert.match(
    browserStart,
    /response\.cookies\.set\(getAuthSessionCookieName\(\), ""/
  );
  assert.doesNotMatch(browserStart, /google\.com|accounts\.google\.com/);
  assert.match(
    nativeStart,
    /callbackUrl\.pathname = "\/api\/native-auth\/complete"/
  );
  assert.match(complete, /getAuthSessionCookieName/);
  assert.match(complete, /tx\.session\.create/);
  assert.match(accountMenu, /signOut\(\{ callbackUrl: "\/" \}\)/);
  assert.match(mobileUtilities, /signOut\(\{ callbackUrl: "\/" \}\)/);
});
