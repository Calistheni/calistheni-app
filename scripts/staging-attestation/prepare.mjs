import { build } from "esbuild";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const lock = JSON.parse(await readFile(new URL("../../package-lock.json", import.meta.url), "utf8"));
const pgVersion = lock.packages["node_modules/pg"].version;
const candidate = await mkdtemp(join(tmpdir(), "calistheni-staging-attestation-"));
await mkdir(join(candidate, "api"));

await build({
  entryPoints: [fileURLToPath(new URL("handler.ts", import.meta.url))],
  outfile: join(candidate, "api", "attest.mjs"),
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  external: ["pg"],
});

await writeFile(join(candidate, "package.json"), JSON.stringify({
  name: "calistheni-staging-attestation",
  private: true,
  engines: { node: "22.x" },
  dependencies: { pg: pgVersion },
}, null, 2) + "\n");
await writeFile(join(candidate, "vercel.json"), JSON.stringify({
  framework: null,
  installCommand: "npm install --ignore-scripts --omit=dev",
  buildCommand: "",
  functions: { "api/attest.mjs": { maxDuration: 15 } },
  crons: [],
}, null, 2) + "\n");

// Only a local directory path is printed. The bundle has no project link or runtime inputs.
console.log(candidate);
