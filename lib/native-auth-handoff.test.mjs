import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("native handoff uses one-time hashes, official App/Browser plugins, and a secure Auth.js cookie", async () => {
  const [attempt, complete, exchange, handoff, login] = await Promise.all([
    readFile(new URL("app/api/native-auth/attempt/route.ts", root), "utf8"),
    readFile(new URL("app/api/native-auth/complete/route.ts", root), "utf8"),
    readFile(new URL("app/api/native-auth/exchange/route.ts", root), "utf8"),
    readFile(new URL("components/auth/NativeAuthHandoff.tsx", root), "utf8"),
    readFile(new URL("app/login/page.tsx", root), "utf8"),
  ]);

  assert.match(attempt, /nonceHash: hashNativeAuthSecret/);
  assert.match(complete, /handoffCodeHash: hashNativeAuthSecret/);
  assert.match(exchange, /consumedAt: now/);
  assert.match(exchange, /getAuthSessionCookieName/);
  assert.match(handoff, /App\.getLaunchUrl/);
  assert.match(handoff, /App\.addListener\("appUrlOpen"/);
  assert.match(handoff, /Browser\.close/);
  assert.match(login, /NativeGoogleSignInButton/);
});
