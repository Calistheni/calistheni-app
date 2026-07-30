import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("native launch has a bounded splash fallback and local retry page", async () => {
  const [config, fallback] = await Promise.all([
    readFile(new URL("capacitor.config.ts", root), "utf8"),
    readFile(new URL("mobile-web/error.html", root), "utf8"),
  ]);

  assert.match(config, /launchAutoHide:\s*true/);
  assert.match(config, /launchShowDuration:\s*1_200/);
  assert.match(config, /errorPath:\s*"error\.html"/);
  assert.match(fallback, /Calistheni is unavailable/);
  assert.match(fallback, /Try again/);
  assert.match(fallback, /getServerUrl/);
});

test("NativeShell requests a guarded splash hide without blocking web rendering", async () => {
  const [shell, layout, platform] = await Promise.all([
    readFile(new URL("components/native/NativeShell.tsx", root), "utf8"),
    readFile(new URL("app/layout.tsx", root), "utf8"),
    readFile(new URL("lib/native/platform.ts", root), "utf8"),
  ]);

  assert.match(layout, /<NativeShell\s*\/>/);
  assert.match(shell, /"use client"/);
  assert.match(shell, /isNativePluginAvailable\("SplashScreen"\)/);
  assert.match(shell, /SplashScreen\.hide\(\)/);
  assert.match(shell, /splash hide succeeded/);
  assert.match(shell, /splash hide failed/);
  assert.match(platform, /Capacitor\.isPluginAvailable/);
});
