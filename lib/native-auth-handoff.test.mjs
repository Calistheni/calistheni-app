import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("native handoff uses one-time hashes, official App/Browser plugins, and a secure Auth.js cookie", async () => {
  const [attempt, complete, completion, aasa, callback, handoff, plist, login] = await Promise.all([
    readFile(new URL("app/api/native-auth/attempt/route.ts", root), "utf8"),
    readFile(new URL("app/api/native-auth/complete/route.ts", root), "utf8"),
    readFile(new URL("app/api/auth/mobile/complete/route.ts", root), "utf8"),
    readFile(new URL("app/.well-known/apple-app-site-association/route.ts", root), "utf8"),
    readFile(new URL("components/auth/MobileAuthCallbackPage.tsx", root), "utf8"),
    readFile(new URL("components/auth/NativeAuthHandoff.tsx", root), "utf8"),
    readFile(new URL("ios/App/App/Info.plist", root), "utf8"),
    readFile(new URL("app/login/page.tsx", root), "utf8"),
  ]);

  assert.match(attempt, /nonceHash: hashNativeAuthSecret/);
  assert.match(complete, /handoffCodeHash: hashNativeAuthSecret/);
  assert.match(completion, /consumedAt: now/);
  assert.match(completion, /getAuthSessionCookieName/);
  assert.match(completion, /updateMany/);
  assert.match(completion, /Cache-Control.*no-store/);
  assert.match(aasa, /89RH6XL9R6\.com\.petershikrenov\.calistheni/);
  assert.match(aasa, /\/auth\/mobile\/\*/);
  assert.match(callback, /Open Calistheni/);
  assert.match(callback, /createNativeAuthCustomSchemeUrl/);
  assert.match(callback, /window\.location\.assign/);
  assert.doesNotMatch(callback, /\/home/);
  assert.match(handoff, /App\.getLaunchUrl/);
  assert.match(handoff, /App\.addListener\("appUrlOpen"/);
  assert.match(handoff, /Browser\.close/);
  assert.match(handoff, /parseNativeAuthCallbackUrl/);
  assert.match(plist, /CFBundleURLTypes/);
  assert.match(plist, /com\.petershikrenov\.calistheni/);
  assert.match(plist, /<string>calistheni<\/string>/);
  assert.match(login, /NativeGoogleSignInButton/);
});
