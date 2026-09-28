import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  isNativeSessionUsable,
  parseNativeBearerHeader,
} from "@/lib/auth/native-session-core";
import { isAllowedNativeOrigin, NATIVE_APP_ORIGIN } from "@/lib/native-api-cors-core";
import { resolveProEntitlementGrants } from "@/lib/entitlement-resolution";

const root = new URL("../", import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), "utf8");
const token = "a".repeat(43);

test("bearer parsing distinguishes absent, valid, and explicitly invalid authorization", () => {
  assert.deepEqual(parseNativeBearerHeader(null), { supplied: false, token: null });
  assert.deepEqual(parseNativeBearerHeader(`Bearer ${token}`), { supplied: true, token });
  assert.deepEqual(parseNativeBearerHeader("Bearer invalid"), { supplied: true, token: null });
  assert.deepEqual(parseNativeBearerHeader(`Basic ${token}`), { supplied: true, token: null });
});

test("expired and revoked native sessions are unusable", () => {
  const now = new Date("2026-09-27T12:00:00Z");
  assert.equal(isNativeSessionUsable({ expiresAt: new Date("2026-09-27T13:00:00Z"), revokedAt: null }, now), true);
  assert.equal(isNativeSessionUsable({ expiresAt: new Date("2026-09-27T11:00:00Z"), revokedAt: null }, now), false);
  assert.equal(isNativeSessionUsable({ expiresAt: new Date("2026-09-27T13:00:00Z"), revokedAt: now }, now), false);
});

test("request principal rejects an invalid supplied bearer instead of falling back to cookies", () => {
  const source = read("lib/user-auth.ts");
  const resolver = read("lib/auth/native-session.ts");
  assert.match(source, /if \(bearer\.supplied\)[\s\S]*if \(!bearer\.token\) return null/);
  assert.match(source, /resolveNativeSession\(bearer\.token\)/);
  assert.match(resolver, /tokenHash: hashNativeAuthSecret\(token\)/);
  assert.match(resolver, /select: \{ id: true, userId: true,[^}]*lastUsedAt: true,[^}]*expiresAt: true,[^}]*revokedAt: true \}/);
  assert.match(source, /const session = await auth\(\)/);
  assert.ok(source.indexOf("if (bearer.supplied)") < source.indexOf("const session = await auth()"));
});

test("native sessions store a token hash, explicit expiry, and revocation only", () => {
  const schema = read("prisma/schema.prisma");
  const model = schema.match(/model NativeSession \{[\s\S]*?\n\}/)?.[0] ?? "";
  assert.match(model, /tokenHash\s+String\s+@unique/);
  assert.match(model, /expiresAt\s+DateTime/);
  assert.match(model, /revokedAt\s+DateTime\?/);
  assert.doesNotMatch(model, /\n\s+token\s+String/);
  const exchange = read("app/api/native/v1/auth/exchange/route.ts");
  assert.match(exchange, /tokenHash: hashNativeAuthSecret\(rawToken\)/);
});

test("handoff exchange is expiring and one-time", () => {
  const exchange = read("app/api/native/v1/auth/exchange/route.ts");
  assert.match(exchange, /consumedAt: null/);
  assert.match(exchange, /expiresAt: \{ gt: now \}/);
  assert.match(exchange, /updateMany\([\s\S]*consumedAt: null[\s\S]*consumedAt: now/);
  assert.match(exchange, /if \(consumed\.count !== 1\) return null/);
});

test("logout revokes only the current native session", () => {
  const route = read("app/api/native/v1/logout/route.ts");
  const sessions = read("lib/auth/native-session.ts");
  assert.match(route, /principal\.authority !== "native"/);
  assert.match(route, /revokeNativeSession\(principal\.nativeSessionId\)/);
  assert.match(sessions, /data: \{ revokedAt: now \}/);
});

test("native CORS accepts only the exact Capacitor origin and never wildcard", () => {
  assert.equal(NATIVE_APP_ORIGIN, "capacitor://localhost");
  assert.equal(isAllowedNativeOrigin("capacitor://localhost"), true);
  assert.equal(isAllowedNativeOrigin("https://evil.example"), false);
  const cors = read("lib/native-api-cors.ts");
  assert.match(cors, /Authorization, Content-Type/);
  assert.match(cors, /GET, POST, OPTIONS/);
  assert.doesNotMatch(cors, /Allow-Origin[\s\S]*["']\*["']/);
  assert.match(cors, /Vary/);

  for (const route of [
    "app/api/native/v1/auth/attempt/route.ts",
    "app/api/native/v1/auth/exchange/route.ts",
    "app/api/native/v1/bootstrap/route.ts",
    "app/api/native/v1/logout/route.ts",
    "app/api/native/v1/home/route.ts",
    "app/api/native/v1/nutrition/route.ts",
    "app/api/native/v1/community/route.ts",
    "app/api/native/v1/parks/route.ts",
    "app/api/native/v1/rewards/route.ts",
    "app/api/native/v1/profile/route.ts",
  ]) {
    assert.match(read(route), /rejectDisallowedNativeOrigin\(request\)/);
  }
});

test("bootstrap, Rewards, and Profile require request-aware auth and expose bounded DTOs", () => {
  const bootstrap = read("app/api/native/v1/bootstrap/route.ts");
  const rewards = read("app/api/native/v1/rewards/route.ts");
  const profile = read("app/api/native/v1/profile/route.ts");
  assert.match(bootstrap, /getAuthenticatedUserId\(request\)/);
  assert.match(rewards, /getAuthenticatedUserId\(request\)/);
  assert.match(bootstrap, /select: \{ id: true, name: true, username: true, image: true, onboardingCompleted: true \}/);
  assert.doesNotMatch(bootstrap, /email|password|sessionToken|tokenHash/);
  assert.match(rewards, /where: \{ userId \}/);
  assert.match(rewards, /getUserEntitlements\(userId\)/);
  assert.match(profile, /getAuthenticatedUserId\(request\)/);
  assert.match(profile, /where: \{ id: userId \}/);
  assert.match(profile, /getUserEntitlements\(userId\)/);
  assert.doesNotMatch(profile, /password|sessionToken|tokenHash|stripeCustomerId/);
});

test("canonical Stripe entitlement remains Pro for native bootstrap and Rewards", () => {
  const result = resolveProEntitlementGrants({
    subscription: { plan: "PRO_YEARLY", status: "ACTIVE", lifetimePurchasedAt: null },
    applePurchases: [],
  });
  assert.equal(result.isPro, true);
  assert.equal(result.grants[0]?.provider, "STRIPE");
});

test("native API client preserves caller options and never patches global fetch", () => {
  const source = read("apps/native/lib/api.ts");
  assert.match(source, /new Headers\(inputHeaders\)/);
  assert.match(source, /fetch\(apiUrl\(path\), \{ \.\.\.init, headers \}\)/);
  assert.match(source, /Authorization.*Bearer/);
  assert.match(source, /authenticated && response\.status === 401/);
  assert.doesNotMatch(source, /globalThis\.fetch|window\.fetch\s*=/);
});

test("bundled login starts the production HTTPS browser flow without navigating the WebView", () => {
  const provider = read("apps/native/components/NativeAuthProvider.tsx");
  assert.match(provider, /apiFetch<\{ externalAuthUrl: string \}>\("\/api\/native\/v1\/auth\/attempt"/);
  assert.match(provider, /external\.protocol !== "https:" \|\| external\.origin !== "https:\/\/calistheni\.app"/);
  assert.match(provider, /Browser\.open\(\{ url: external\.toString\(\), presentationStyle: "fullscreen" \}\)/);
  assert.doesNotMatch(provider, /window\.location\.(?:assign|replace)|window\.location\.href\s*=/);
});

test("warm and cold native callbacks share one replay-safe exchange owner", () => {
  const provider = read("apps/native/components/NativeAuthProvider.tsx");
  assert.match(provider, /App\.getLaunchUrl\(\)/);
  assert.match(provider, /App\.addListener\("appUrlOpen"/);
  assert.match(provider, /exchangingCodesRef = useRef\(new Set<string>\(\)\)/);
  assert.match(provider, /consumedCodesRef = useRef\(new Set<string>\(\)\)/);
  assert.match(provider, /consumedCodesRef\.current\.has\(code\) \|\| exchangingCodesRef\.current\.has\(code\)/);
  assert.match(provider, /callback-duplicate-ignored/);
  assert.match(provider, /setNativeSessionToken\(result\.token\)/);
  assert.ok(provider.indexOf("setNativeSessionToken(result.token)") < provider.indexOf("await bootstrap()"));
});

test("auth diagnostics are available before login and never include credentials", () => {
  const shell = read("apps/native/components/NativeAppShell.tsx");
  const provider = read("apps/native/components/NativeAuthProvider.tsx");
  const diagnostics = read("apps/native/components/NativeRuntimeDiagnostics.tsx");
  assert.match(shell, /<NativeAuthGate><NativePrimaryTabHost \/><\/NativeAuthGate>[\s\S]*<NativeRuntimeDiagnostics \/>/);
  for (const stage of ["attempt-request", "browser-open", "callback-received", "exchange-request", "keychain-write-success", "bootstrap-request", "authenticated"]) {
    assert.match(provider, new RegExp(stage));
  }
  assert.match(diagnostics, /authStage/);
  assert.match(diagnostics, /authFailure/);
  assert.doesNotMatch(diagnostics, /result\.token|handoffCode|authorization/i);
});

test("Keychain is the only native credential persistence", () => {
  const bridge = read("apps/native/lib/secure-session.ts");
  const swift = read("ios/App/App/CalistheniSecureSessionPlugin.swift");
  const cache = read("apps/native/lib/cache.ts");
  assert.match(swift, /kSecClassGenericPassword/);
  assert.match(swift, /kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly/);
  assert.match(swift, /kSecAttrSynchronizable[\s\S]*kCFBooleanFalse/);
  assert.doesNotMatch(bridge + cache, /localStorage|sessionStorage/);
  assert.doesNotMatch(cache, /token|Authorization|handoff/i);
});

test("Keychain plugin survives Capacitor sync registration", () => {
  const project = read("ios/App/App.xcodeproj/project.pbxproj");
  assert.match(project, /CalistheniSecureSessionPlugin\.swift in Sources/);
  assert.match(project, /packageClassList\.12 -string CalistheniSecureSessionPlugin/);
});

test("local Rewards structure and stale-while-revalidate cache are data-independent", () => {
  const surface = read("apps/native/components/NativeRewardsSurface.tsx");
  const provider = read("apps/native/components/NativeAuthProvider.tsx");
  assert.match(surface, /Current balance/);
  assert.match(surface, /Available rewards/);
  assert.match(surface, /usePrimarySnapshot\(userId, "rewards", active\)/);
  assert.match(provider, /hydratePrimarySnapshots\(queryClient, value\.user\.id\)/);
  assert.doesNotMatch(surface, /Skeleton|Suspense/);
});

test("StoreKit calls are bearer-ready only for bundled origin", () => {
  const storeKit = read("lib/native/apple-storekit.ts");
  const fetcher = read("lib/native/authenticated-fetch.ts");
  assert.match(storeKit, /nativeAuthenticatedFetch\("\/api\/billing\/apple\/config"/);
  assert.match(storeKit, /nativeAuthenticatedFetch\("\/api\/billing\/apple\/transactions\/sync"/);
  assert.match(fetcher, /window\.location\.protocol !== "capacitor:"/);
  assert.match(fetcher, /SecureSession\.getSessionToken/);
});

test("staged enrollment is opt-in and stores the issued credential in Keychain", () => {
  const enrollment = read("lib/native/native-session-enrollment.ts");
  assert.match(enrollment, /api\/native\/v1\/auth\/enroll/);
  assert.match(enrollment, /credentials: "include"/);
  assert.match(enrollment, /SecureSession\.setSessionToken/);
  assert.doesNotMatch(enrollment, /useEffect|setTimeout/);
});
