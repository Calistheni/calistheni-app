import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const mode = process.argv[2];

if (mode !== "bundled" && mode !== "remote") {
  throw new Error("Usage: node scripts/set-ios-runtime-expectation.mjs bundled|remote");
}

await writeFile(path.join(repositoryRoot, "ios/App/.calistheni-runtime-mode"), `${mode}\n`, "utf8");
console.info(`[Capacitor] Xcode runtime expectation locked to ${mode}.`);
