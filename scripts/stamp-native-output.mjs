import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(repositoryRoot, "apps/native/out/native-runtime.json");
const manifest = {
  runtime: "bundled-native",
  buildId: randomUUID(),
  builtAt: new Date().toISOString(),
};

await writeFile(output, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.info(`[native-build] Bundled runtime ${manifest.buildId} stamped at ${manifest.builtAt}.`);
