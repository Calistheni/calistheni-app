import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const appPath = process.argv[2];
if (!appPath) throw new Error("Usage: node scripts/verify-built-ios-app.mjs /path/to/App.app");

async function filesBelow(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return (await Promise.all(entries.map((entry) => {
    const item = path.join(directory, entry.name);
    return entry.isDirectory() ? filesBelow(item) : [item];
  }))).flat();
}

const config = JSON.parse(await readFile(path.join(appPath, "capacitor.config.json"), "utf8"));
const manifest = JSON.parse(await readFile(path.join(appPath, "public/native-runtime.json"), "utf8"));
const errors = [];

if (config.server?.url) errors.push(`compiled server.url is ${config.server.url}`);
if (config.webDir !== "apps/native/out") errors.push(`compiled webDir is ${config.webDir}`);
if (manifest.runtime !== "bundled-native" || !manifest.buildId) errors.push("compiled build marker is invalid");
if (manifest.diagnostics !== true) errors.push("compiled development runtime diagnostics are not enabled");
if (!config.packageClassList?.includes("CalistheniSecureSessionPlugin")) {
  errors.push("compiled Capacitor config is missing CalistheniSecureSessionPlugin");
}

for (const route of ["home", "nutrition", "parks", "feed", "rewards", "profile"]) {
  const source = await readFile(path.join(appPath, `public/${route}/index.html`), "utf8").catch(() => "");
  if (!source) errors.push(`compiled /${route}/ is missing`);
}

for (const file of await filesBelow(path.join(appPath, "public"))) {
  if (!/\.(?:html|js|txt)$/.test(file)) continue;
  const source = await readFile(file, "utf8");
  if (/Initial synchronization|Partner rewards are preparing|PrimaryTabStandby|PageSkeleton/.test(source)) {
    errors.push(`compiled bundle contains web-only loading UI in ${path.relative(appPath, file)}`);
    break;
  }
}

if (errors.length) throw new Error(`Compiled iOS application is not bundled-native:\n${errors.map((item) => `- ${item}`).join("\n")}`);
console.info(`[native-app] Compiled App.app verified as bundled-native build ${manifest.buildId}.`);
