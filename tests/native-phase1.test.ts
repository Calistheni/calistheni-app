import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import test from "node:test";
import {
  BUNDLED_CAPACITOR_WEB_DIR,
  DEFAULT_CAPACITOR_SERVER_URL,
  REMOTE_CAPACITOR_WEB_DIR,
  resolveCapacitorRuntimeMode,
} from "@/lib/capacitor-runtime-mode";

const root = new URL("../", import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), "utf8");

test("the root web app remains a normal dynamic Next.js build", () => {
  const config = read("next.config.ts");
  const rootLayout = read("app/layout.tsx");

  assert.doesNotMatch(config, /output\s*:\s*["']export["']/);
  assert.match(rootLayout, /dynamic = "force-dynamic"/);
});

test("the isolated native app uses strict static export settings", () => {
  const config = read("apps/native/next.config.ts");

  assert.match(config, /output: "export"/);
  assert.match(config, /trailingSlash: true/);
  assert.match(config, /unoptimized: true/);
  assert.match(config, /turbopack:[\s\S]*root: path\.resolve\(__dirname, "\.\.\/\.\."\)/);
});

test("Capacitor defaults to the existing remote runtime", () => {
  assert.deepEqual(resolveCapacitorRuntimeMode({}), {
    kind: "remote",
    webDir: REMOTE_CAPACITOR_WEB_DIR,
    serverUrl: DEFAULT_CAPACITOR_SERVER_URL,
  });
  assert.deepEqual(
    resolveCapacitorRuntimeMode({ CAPACITOR_SERVER_URL: "http://127.0.0.1:3000" }),
    {
      kind: "remote",
      webDir: REMOTE_CAPACITOR_WEB_DIR,
      serverUrl: "http://127.0.0.1:3000",
    }
  );
});

test("explicit bundled mode selects native output and has no server URL", () => {
  const bundled = resolveCapacitorRuntimeMode({
    CALISTHENI_BUNDLED_NATIVE: "1",
    CAPACITOR_SERVER_URL: "https://calistheni.app",
  });

  assert.deepEqual(bundled, {
    kind: "bundled",
    webDir: BUNDLED_CAPACITOR_WEB_DIR,
  });
  assert.equal("serverUrl" in bundled, false);
  assert.throws(
    () => resolveCapacitorRuntimeMode({ CALISTHENI_BUNDLED_NATIVE: "yes" }),
    /must be 1/
  );
});

test("all six persistent destination route entries exist", () => {
  for (const route of ["home", "nutrition", "parks", "feed", "rewards", "profile"]) {
    assert.equal(
      existsSync(new URL(`apps/native/app/${route}/page.tsx`, root)),
      true,
      `missing native /${route} route`
    );
  }
});

test("native host owns local surfaces without loading or skeleton UI", () => {
  const host = read("apps/native/components/NativePrimaryTabHost.tsx");
  const navigation = read("apps/native/lib/navigation.ts");

  for (const route of ["/home", "/nutrition", "/parks", "/feed", "/rewards", "/profile"]) {
    assert.match(navigation, new RegExp(`href: "${route}"`));
  }
  for (const surface of ["Home", "Nutrition", "Parks", "Community", "Rewards", "Profile"]) {
    assert.match(host, new RegExp(`Native${surface}Surface`));
  }
  assert.match(host, /intent\?\.href \?\? committedHref/);
  assert.match(host, /window\.addEventListener\("popstate"/);
  assert.match(host, /window\.history\.pushState/);
  assert.doesNotMatch(host, /next\/link|<Link/);
  assert.doesNotMatch(host, /Skeleton|Suspense|setTimeout|fetch\(/);
});

test("bundled build, sync, and open scripts verify the exact copied runtime", () => {
  const packageJson = JSON.parse(read("package.json")) as { scripts: Record<string, string> };
  assert.match(packageJson.scripts["build:native"], /stamp-native-output/);
  assert.match(packageJson.scripts["build:native"], /verify-native-output/);
  assert.match(packageJson.scripts["mobile:sync:ios:bundled"], /verify-bundled-ios/);
  assert.match(packageJson.scripts["mobile:sync:ios:bundled"], /set-ios-runtime-expectation\.mjs bundled/);
  assert.match(packageJson.scripts["mobile:sync:ios:bundled"], /verify-xcode-runtime-mode/);
  assert.match(packageJson.scripts["mobile:open:ios:bundled"], /^node scripts\/verify-bundled-ios\.mjs/);
  assert.match(packageJson.scripts["mobile:ios:bundled"], /build:native[\s\S]*sync:ios:bundled[\s\S]*open:ios:bundled/);
  assert.match(read("scripts/verify-built-ios-app.mjs"), /CalistheniSecureSessionPlugin/);
});

test("Xcode build phase blocks runtime-mode drift before copying resources", () => {
  const project = read("ios/App/App.xcodeproj/project.pbxproj");
  const nodeResolver = read("scripts/run-with-node.sh");
  const verifier = read("scripts/verify-xcode-runtime-mode.mjs");
  const artifactVerifier = read("scripts/verify-built-ios-app.mjs");
  assert.match(project, /verify-xcode-runtime-mode\.mjs/);
  assert.match(project, /\/bin\/sh .*scripts\/run-with-node\.sh/);
  assert.doesNotMatch(project, /\/usr\/bin\/env node/);
  assert.match(nodeResolver, /\/opt\/homebrew\/bin\/node/);
  assert.match(nodeResolver, /\/usr\/local\/bin\/node/);
  assert.match(nodeResolver, /VOLTA_HOME/);
  assert.match(nodeResolver, /FNM_MULTISHELL_PATH/);
  assert.match(nodeResolver, /NVM_DIR/);
  assert.match(nodeResolver, /Node\.js 22 or newer/);
  assert.match(verifier, /Bundled Xcode build blocked/);
  assert.match(artifactVerifier, /compiled server\.url/);
  assert.match(artifactVerifier, /public\/(?:\$\{route\}|profile)/);
});

test("Xcode Node resolver works with an intentionally restricted PATH", () => {
  const result = spawnSync("/bin/sh", ["scripts/run-with-node.sh", "-e", "process.stdout.write(process.execPath)"], {
    cwd: new URL("../", import.meta.url),
    encoding: "utf8",
    env: {
      HOME: process.env.HOME,
      PATH: "/usr/bin:/bin",
      CALISTHENI_NODE_BINARY: process.execPath,
    },
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(result.stdout, process.execPath);
});

test("native source passes the server-only import and secret environment guard", () => {
  const result = spawnSync(process.execPath, ["scripts/verify-native-source.mjs"], {
    cwd: new URL("../", import.meta.url),
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("bundled sync fails clearly when native output is missing", () => {
  const missingOutput = `/tmp/calistheni-native-output-missing-${process.pid}`;
  const result = spawnSync(process.execPath, ["scripts/verify-native-output.mjs"], {
    cwd: new URL("../", import.meta.url),
    encoding: "utf8",
    env: {
      ...process.env,
      CALISTHENI_NATIVE_OUTPUT_DIR: missingOutput,
    },
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /npm run build:native/);
});

test("native source references only the approved public API-origin variable", () => {
  const config = read("apps/native/lib/config.ts");
  assert.match(config, /NEXT_PUBLIC_CALISTHENI_API_ORIGIN/);
  assert.doesNotMatch(
    config,
    /DATABASE_URL|AUTH_SECRET|GOOGLE_CLIENT_SECRET|STRIPE_SECRET|APPLE_IAP_PRIVATE_KEY|R2_SECRET|OPENAI_API_KEY/
  );
});
