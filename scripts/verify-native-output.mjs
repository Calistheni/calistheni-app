import { access, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);
const defaultOutput = path.join(repositoryRoot, "apps/native/out");
const requiredRoutes = ["home", "nutrition", "parks", "feed", "rewards", "profile"];
const forbiddenSecretNames = /\b(?:DATABASE_URL|AUTH_SECRET|NEXTAUTH_SECRET|GOOGLE_CLIENT_SECRET|AUTH_GOOGLE_SECRET|STRIPE_SECRET_KEY|STRIPE_WEBHOOK_SECRET|APPLE_IAP_PRIVATE_KEY|R2_SECRET_ACCESS_KEY|OPENAI_API_KEY)\b/;

async function filesBelow(directory) {
  const { readdir } = await import("node:fs/promises");
  const entries = await readdir(directory, { withFileTypes: true });
  return (await Promise.all(entries.map((entry) => {
    const item = path.join(directory, entry.name);
    return entry.isDirectory() ? filesBelow(item) : [item];
  }))).flat();
}

async function requireFile(file) {
  const details = await stat(file).catch(() => null);
  if (!details?.isFile() || details.size === 0) {
    throw new Error(`missing ${path.relative(repositoryRoot, file)}`);
  }
}

export async function verifyNativeOutput(outputDirectory = defaultOutput) {
  const missing = [];
  const expectedFiles = [
    path.join(outputDirectory, "index.html"),
    ...requiredRoutes.map((route) =>
      path.join(outputDirectory, route, "index.html")
    ),
  ];

  for (const file of expectedFiles) {
    try {
      await requireFile(file);
    } catch (error) {
      missing.push(error instanceof Error ? error.message : String(error));
    }
  }

  try {
    await access(path.join(outputDirectory, "_next/static"));
  } catch {
    missing.push("missing apps/native/out/_next/static");
  }

  if (!missing.length) {
    const home = await readFile(
      path.join(outputDirectory, "home/index.html"),
      "utf8"
    );
    if (!home.includes('data-native-bundled-shell="true"') || !home.includes("Local Calistheni")) {
      missing.push("Home export does not contain the bundled-native application shell");
    }
    for (const file of await filesBelow(outputDirectory)) {
      if (!/\.(?:html|js|txt)$/.test(file)) continue;
      if (forbiddenSecretNames.test(await readFile(file, "utf8"))) {
        missing.push(`export references a server secret identifier in ${path.relative(outputDirectory, file)}`);
        break;
      }
    }
  }

  if (missing.length) {
    throw new Error(
      `Bundled native output is unavailable or incomplete:\n${missing
        .map((item) => `- ${item}`)
        .join("\n")}\nRun \"npm run build:native\" before bundled sync.`
    );
  }
}

const isDirectExecution =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectExecution) {
  const configuredOutput = process.env.CALISTHENI_NATIVE_OUTPUT_DIR;
  verifyNativeOutput(
    configuredOutput ? path.resolve(configuredOutput) : defaultOutput
  )
    .then(() => {
      console.info(
        "[native-build] Static output verified for /home, /nutrition, /parks, /feed, /rewards, and /profile."
      );
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    });
}
