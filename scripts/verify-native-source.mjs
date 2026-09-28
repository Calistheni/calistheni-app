import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);
const nativeRoot = path.join(repositoryRoot, "apps/native");
const sourceExtensions = new Set([".js", ".jsx", ".mjs", ".ts", ".tsx"]);
const forbiddenImports = [
  /^@\//,
  /^server-only$/,
  /^next-auth(?:\/|$)/,
  /^stripe(?:\/|$)/,
  /^@prisma(?:\/|$)/,
  /^@aws-sdk(?:\/|$)/,
  /(?:^|\/)auth(?:\.ts)?$/,
  /(?:^|\/)lib\/prisma(?:\.ts)?$/,
  /(?:^|\/)lib\/server-/,
  /(?:^|\/)lib\/stripe/,
  /(?:^|\/)lib\/apple-iap\//,
  /(?:^|\/)lib\/r2(?:\.ts)?$/,
  /(?:^|\/)lib\/[^/]*email/,
  /(?:^|\/)lib\/admin-/,
  /(?:^|\/)lib\/nutrition\/providers\//,
  /^(?:\.\.\/){3,}/,
];
const allowedEnvironmentVariables = new Set([
  "NEXT_PUBLIC_CALISTHENI_API_ORIGIN",
  "NEXT_PUBLIC_CALISTHENI_NATIVE_DIAGNOSTICS",
  "CALISTHENI_NATIVE_DIAGNOSTICS",
]);
const forbiddenSecretNames = /\b(?:DATABASE_URL|AUTH_SECRET|NEXTAUTH_SECRET|GOOGLE_CLIENT_SECRET|AUTH_GOOGLE_SECRET|STRIPE_SECRET_KEY|STRIPE_WEBHOOK_SECRET|APPLE_IAP_PRIVATE_KEY|R2_SECRET_ACCESS_KEY|OPENAI_API_KEY)\b/g;

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries
      .filter((entry) => entry.name !== ".next" && entry.name !== "out")
      .map(async (entry) => {
        const entryPath = path.join(directory, entry.name);
        if (entry.isDirectory()) return sourceFiles(entryPath);
        return sourceExtensions.has(path.extname(entry.name)) ? [entryPath] : [];
      })
  );
  return nested.flat();
}

function importedSpecifiers(source) {
  const values = [];
  const patterns = [
    /\b(?:import|export)\s+(?:[^"']*?\s+from\s+)?["']([^"']+)["']/g,
    /\bimport\(\s*["']([^"']+)["']\s*\)/g,
    /\brequire\(\s*["']([^"']+)["']\s*\)/g,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) values.push(match[1]);
  }
  return values;
}

export async function verifyNativeSource() {
  const violations = [];

  for (const file of await sourceFiles(nativeRoot)) {
    const source = await readFile(file, "utf8");
    const relativeFile = path.relative(repositoryRoot, file);

    for (const specifier of importedSpecifiers(source)) {
      if (forbiddenImports.some((pattern) => pattern.test(specifier))) {
        violations.push(`${relativeFile}: forbidden server import ${specifier}`);
      }
    }

    for (const match of source.matchAll(/process\.env\.([A-Z0-9_]+)/g)) {
      const name = match[1];
      if (!allowedEnvironmentVariables.has(name)) {
        violations.push(`${relativeFile}: forbidden environment variable ${name}`);
      }
    }
    if (forbiddenSecretNames.test(source)) {
      violations.push(`${relativeFile}: references a server secret identifier`);
    }
    forbiddenSecretNames.lastIndex = 0;
  }

  if (violations.length) {
    throw new Error(
      `Native client boundary verification failed:\n${violations
        .map((violation) => `- ${violation}`)
        .join("\n")}`
    );
  }
}

const isDirectExecution =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectExecution) {
  verifyNativeSource()
    .then(() => {
      console.info("[native-build] Client-safe source boundary verified.");
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    });
}
