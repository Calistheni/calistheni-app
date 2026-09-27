import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const requiredRoutes = ["home", "nutrition", "parks", "feed", "rewards", "profile"];

async function json(file) {
  return JSON.parse(await readFile(file, "utf8"));
}

async function optionalJson(file) {
  try {
    return await json(file);
  } catch {
    return null;
  }
}

export async function verifyBundledIos(root = repositoryRoot) {
  const outputRoot = path.join(root, "apps/native/out");
  const publicRoot = path.join(root, "ios/App/App/public");
  const config = await optionalJson(path.join(root, "ios/App/App/capacitor.config.json"));
  const outputManifest = await optionalJson(path.join(outputRoot, "native-runtime.json"));
  const copiedManifest = await optionalJson(path.join(publicRoot, "native-runtime.json"));
  const errors = [];

  if (!config) errors.push("iOS capacitor.config.json is missing or invalid");
  if (config?.server?.url) errors.push(`server.url is still ${config.server.url}`);
  if (outputManifest?.runtime !== "bundled-native") errors.push("native output has no bundled runtime marker; run npm run build:native");
  if (copiedManifest?.runtime !== "bundled-native") errors.push("iOS public assets have no bundled runtime marker");
  if (outputManifest && copiedManifest && copiedManifest.buildId !== outputManifest.buildId) errors.push("iOS public assets do not match the latest native build ID");

  for (const route of requiredRoutes) {
    const relative = path.join(route, "index.html");
    const source = await readFile(path.join(outputRoot, relative), "utf8").catch(() => "");
    const copied = await readFile(path.join(publicRoot, relative), "utf8").catch(() => "");
    if (!source) errors.push(`native output is missing /${route}/`);
    if (!copied) errors.push(`iOS public assets are missing /${route}/`);
    if (copied && copied !== source) errors.push(`iOS /${route}/ does not match apps/native/out`);
  }

  const copiedHome = await readFile(path.join(publicRoot, "home/index.html"), "utf8").catch(() => "");
  if (!copiedHome.includes('data-native-runtime="bundled"')) {
    errors.push("iOS Home is not the bundled NativeAppShell");
  }

  if (errors.length) {
    throw new Error(
      `The iOS project is not ready to run the bundled native app:\n${errors.map((error) => `- ${error}`).join("\n")}\nRun "npm run mobile:sync:ios:bundled" before opening Xcode.`
    );
  }

  return outputManifest;
}

const direct = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (direct) {
  verifyBundledIos()
    .then((manifest) => console.info(`[native-sync] Verified bundled iOS runtime ${manifest.buildId} (${manifest.builtAt}).`))
    .catch((error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    });
}
