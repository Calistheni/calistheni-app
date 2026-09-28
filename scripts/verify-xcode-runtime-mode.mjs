import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function optionalText(file) {
  return readFile(file, "utf8").catch(() => null);
}

export async function verifyXcodeRuntimeMode(root = repositoryRoot) {
  const iosRoot = path.join(root, "ios/App");
  const expected = (await optionalText(path.join(iosRoot, ".calistheni-runtime-mode")))?.trim();
  if (expected !== "bundled" && expected !== "remote") {
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

  if (!config.server?.url) throw new Error("Remote Xcode build blocked: server.url is absent.");
  console.info(`[Capacitor] Xcode remote runtime verified: ${config.server.url}.`);
  return { mode: expected, serverUrl: config.server.url };
}

const direct = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (direct) {
  verifyXcodeRuntimeMode().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
