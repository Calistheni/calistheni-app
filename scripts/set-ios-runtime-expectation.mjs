import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const mode = process.argv[2];
const target = process.argv[3];
const logging = process.argv[4];

if (mode === "bundled") {
  await writeFile(path.join(repositoryRoot, "ios/App/.calistheni-runtime-mode"), "bundled\n", "utf8");
  console.info("[Capacitor] Xcode runtime expectation locked to bundled.");
} else if (
  mode === "remote" &&
  (target === "staging" || target === "production") &&
  logging === "none"
) {
  const expectation = `remote:${target}:${logging}`;
  await writeFile(path.join(repositoryRoot, "ios/App/.calistheni-runtime-mode"), `${expectation}\n`, "utf8");
  console.info(`[Capacitor] Xcode runtime expectation locked to ${target} (logging=${logging}).`);
} else {
  throw new Error(
    "Usage: node scripts/set-ios-runtime-expectation.mjs bundled | remote staging|production none"
  );
}
