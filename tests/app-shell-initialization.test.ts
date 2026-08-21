import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("the signed-in application shell owns one shared active-workout initialization path", () => {
  const shell = read("components/navigation/AppShell.tsx");
  const provider = read("components/workouts/ActiveWorkoutProvider.tsx");
  assert.match(shell, /<ActiveWorkoutProvider>/);
  assert.match(provider, /readActiveWorkoutSummary\(\)/);
  assert.match(provider, /ACTIVE_WORKOUT_TIMER_EVENT/);
  assert.match(provider, /window\.addEventListener\("storage", sync\)/);
  assert.match(provider, /window\.addEventListener\("pageshow", sync\)/);
});

test("active workout lifecycle changes notify the shell without polling", () => {
  const session = read("lib/active-workout-session.ts");
  const timer = read("components/workouts/hooks/useWorkoutTimer.ts");
  assert.match(session, /notifyActiveWorkoutChanged\(sessionId\)/);
  assert.match(session, /clearActiveWorkoutSessionStorage[\s\S]*notifyActiveWorkoutChanged/);
  assert.match(timer, /writeStoredWorkoutTimer\(storageKey, timerState\)/);
  assert.doesNotMatch(providerSource(), /setInterval\([^,]+,\s*[^(]*[2-9]\d{3}/);
});

function providerSource() {
  return read("components/workouts/ActiveWorkoutProvider.tsx");
}

test("theme is server-initialized from a validated cookie and system mode has a root-layout initializer", () => {
  const layout = read("app/layout.tsx");
  const provider = read("components/ThemeProvider.tsx");
  assert.match(layout, /await cookies\(\)/);
  assert.match(layout, /export const dynamic = "force-dynamic"/);
  assert.match(layout, /export async function generateViewport/);
  assert.match(layout, /colorScheme: theme === "system" \? "light dark" : resolvedTheme/);
  assert.match(layout, /parseTheme/);
  // The initializer is intentionally emitted from the server-rendered head,
  // rather than through a client component or `next/script`.
  assert.match(layout, /<head>/);
  assert.match(layout, /id="calistheni-initial-theme"/);
  assert.match(layout, /initialTheme=\{theme\}/);
  assert.match(layout, /backgroundColor:\s*serverResolvedTheme === "dark" \? DARK_BACKGROUND : LIGHT_BACKGROUND/);
  assert.match(layout, /id="calistheni-critical-theme"/);
  assert.match(provider, /document\.cookie/);
  assert.match(provider, /SameSite=Lax/);
  assert.doesNotMatch(provider, /useState<Theme>\("light"\)/);
});

test("native startup surfaces use the same dark-safe fallback as the server root", () => {
  const capacitor = read("capacitor.config.ts");
  const nativeShell = read("components/native/NativeShell.tsx");
  const fallback = read("mobile-web/index.html");
  assert.match(capacitor, /backgroundColor: "#09090b"/);
  assert.match(capacitor, /style: "DARK"/);
  assert.match(nativeShell, /resolvedTheme/);
  assert.doesNotMatch(nativeShell, /Keyboard\.setScroll/);
  assert.match(fallback, /background: #09090b/);
});

test("normal routes keep native page scrolling while only full-bleed routes lock the shell", () => {
  const shell = read("components/navigation/AppShell.tsx");
  const navigation = read("lib/navigation.ts");
  const nativeShell = read("components/native/NativeShell.tsx");

  assert.match(shell, /const locksViewport = isFullBleed \|\| usesFocusedWorkoutMode/);
  assert.match(shell, /locksViewport && "h-dvh overflow-hidden"/);
  assert.match(navigation, /return pathname === "\/parks"/);
  assert.doesNotMatch(nativeShell, /Keyboard\.setScroll/);
  assert.match(nativeShell, /touchmove", handleTouchMove, \{ passive: true \}/);
  assert.doesNotMatch(nativeShell, /touchmove[\s\S]{0,200}preventDefault/);
});
