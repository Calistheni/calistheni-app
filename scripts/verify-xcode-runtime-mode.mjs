import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const remoteTargets = {
  staging: "https://calistheni-staging.vercel.app",
  production: "https://calistheni.app",
};

async function optionalText(file) {
  return readFile(file, "utf8").catch(() => null);
}

export async function verifyXcodeRuntimeMode(root = repositoryRoot) {
  const iosRoot = path.join(root, "ios/App");
  const expected = (await optionalText(path.join(iosRoot, ".calistheni-runtime-mode")))?.trim();
  const remoteExpectation = expected?.match(/^remote:(staging|production):(none)$/);
  if (expected !== "bundled" && !remoteExpectation) {
    throw new Error("Xcode runtime mode is not locked. Run a mobile:sync:ios:* script before building.");
  }

  const config = JSON.parse(await readFile(path.join(iosRoot, "App/capacitor.config.json"), "utf8"));
  const manifestText = await optionalText(path.join(iosRoot, "App/public/native-runtime.json"));
  const manifest = manifestText ? JSON.parse(manifestText) : null;

  if (expected === "bundled") {
    if (config.server?.url) throw new Error(`Bundled Xcode build blocked: server.url is ${config.server.url}.`);
    if (config.webDir !== "apps/native/out") throw new Error(`Bundled Xcode build blocked: webDir is ${config.webDir}.`);
    if (manifest?.runtime !== "bundled-native" || !manifest.buildId) {
      throw new Error("Bundled Xcode build blocked: copied native-runtime.json is missing.");
    }
    for (const route of ["home", "nutrition", "parks", "feed", "rewards", "profile"]) {
      const routeHtml = await optionalText(path.join(iosRoot, `App/public/${route}/index.html`));
      if (!routeHtml) throw new Error(`Bundled Xcode build blocked: /${route}/ is missing.`);
    }
    console.info(`[Capacitor] Xcode bundled runtime verified: ${manifest.buildId}.`);
    return { mode: expected, buildId: manifest.buildId };
  }

  const [, target, logging] = remoteExpectation;
  const expectedUrl = remoteTargets[target];
  if (config.server?.url !== expectedUrl) {
    throw new Error(
      `Remote Xcode build blocked: expected ${target} (${expectedUrl}), found ${config.server?.url ?? "no server.url"}.`
    );
  }
  if (config.loggingBehavior !== logging) {
    throw new Error(
      `Remote Xcode build blocked: expected logging=${logging}, found ${config.loggingBehavior ?? "unset"}.`
    );
  }
  if (config.webDir !== "mobile-web") {
    throw new Error(`Remote Xcode build blocked: webDir is ${config.webDir}.`);
  }
  const allowedHosts = config.server?.allowNavigation;
  const expectedHost = new URL(expectedUrl).hostname;
  if (!Array.isArray(allowedHosts) || allowedHosts.length !== 1 || allowedHosts[0] !== expectedHost) {
    throw new Error(
      `Remote Xcode build blocked: allowNavigation must contain only ${expectedHost}.`
    );
  }
  console.info(
    `[Capacitor] Xcode remote runtime verified: target=${target} url=${expectedUrl} logging=${logging}.`
  );
  return { mode: "remote", target, serverUrl: expectedUrl, logging };
}

const direct = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (direct) {
  verifyXcodeRuntimeMode().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
