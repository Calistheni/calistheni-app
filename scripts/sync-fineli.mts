import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { prisma } from "../lib/prisma";
import { FINELI_BASIC_PACKAGE_2_URL, parseFineliBasicPackage, parseFineliCsv } from "../lib/nutrition/providers/fineli-dataset";
import { syncFineliDatasetFood } from "../lib/nutrition/provider-dataset-sync";

// Keep below the development database transaction-pool limit. Dataset sync is
// deliberately bounded, but still parallel enough to avoid serial round trips.
const SYNC_BATCH_SIZE = 8;

function argument(name: string) {
  const inline = process.argv.slice(2).find((value) => value.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function findFile(root: string, wanted: string): Promise<string | null> {
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      const nested = await findFile(path, wanted);
      if (nested) return nested;
    } else if (entry.name.toLowerCase() === wanted.toLowerCase()) return path;
  }
  return null;
}

async function officialArchive(destination: string) {
  const url = process.env.FINELI_DATASET_URL ?? FINELI_BASIC_PACKAGE_2_URL;
  const response = await fetch(url, { headers: { Accept: "application/zip, application/octet-stream" } });
  const bytes = new Uint8Array(await response.arrayBuffer());
  const zip = bytes[0] === 0x50 && bytes[1] === 0x4b;
  if (!response.ok || !zip) {
    const challenged = response.status === 403 || response.headers.get("cf-mitigated") === "challenge";
    throw new Error(challenged
      ? `Fineli blocked the official dataset download with a Cloudflare challenge. Download Basic Package 2 from ${url} in a browser and rerun with --archive /path/to/archive-or-extracted-folder.`
      : `Fineli dataset download failed (${response.status}) or was not a ZIP archive.`);
  }
  await writeFile(destination, bytes);
  return url;
}

async function run() {
  const temporary = await mkdtemp(join(tmpdir(), "calistheni-fineli-sync-"));
  try {
    const archiveArgument = argument("--archive") ?? process.env.FINELI_DATASET_ARCHIVE;
    const archive = archiveArgument ? resolve(archiveArgument) : join(temporary, "fineli-basic-package-2.zip");
    const source = archiveArgument ? `official archive ${basename(archive)}` : await officialArchive(archive);
    const archiveStats = await stat(archive);
    let extraction = archive;
    if (!archiveStats.isDirectory()) {
      const signature = await readFile(archive).then((value) => value.subarray(0, 2).toString("hex"));
      if (signature !== "504b") throw new Error(`${archive} is not a ZIP archive or extracted Fineli folder. No data was imported.`);
      extraction = join(temporary, "package");
      execFileSync("/usr/bin/unzip", ["-q", archive, "-d", extraction], { stdio: "inherit" });
    }
    const filenames = ["food.csv", "component_value.csv", "component.csv", "descript.txt", "foodname_EN.csv", "foodname_FI.csv", "foodname_SV.csv", "foodaddunit.csv", "eufdname_EN.csv"];
    const paths = new Map(await Promise.all(filenames.map(async (file) => [file, await findFile(extraction, file)] as const)));
    for (const file of ["food.csv", "component_value.csv", "component.csv", "descript.txt", "foodname_EN.csv"]) {
      if (!paths.get(file)) throw new Error(`The archive is not a complete Fineli Basic Package 2: ${file} is missing.`);
    }
    const readPackageText = (file: string) => readFile(paths.get(file)!, "latin1");
    const componentCsv = await readPackageText("component.csv");
    const componentCount = parseFineliCsv(componentCsv).length;
    if (componentCount !== 74) throw new Error(`Refusing to import this Fineli package: expected Basic Package 2 with 74 components, found ${componentCount}.`);
    const description = await readPackageText("descript.txt");
    const release = /Release\.\s*([0-9.]+)/i.exec(description)?.[1] ?? "unknown";
    const datasetVersion = `Fineli Basic Package 2 Release ${release}`;
    const records = parseFineliBasicPackage({
      foodCsv: await readPackageText("food.csv"),
      componentValueCsv: await readPackageText("component_value.csv"),
      componentCsv,
      foodAddUnitCsv: paths.get("foodaddunit.csv") ? await readPackageText("foodaddunit.csv") : undefined,
      foodNameEnCsv: await readPackageText("foodname_EN.csv"),
      foodNameFiCsv: paths.get("foodname_FI.csv") ? await readPackageText("foodname_FI.csv") : undefined,
      foodNameSvCsv: paths.get("foodname_SV.csv") ? await readPackageText("foodname_SV.csv") : undefined,
      componentNameEnCsv: paths.get("eufdname_EN.csv") ? await readPackageText("eufdname_EN.csv") : undefined,
      datasetVersion,
    });
    if (!records.length) throw new Error("Fineli package parsing produced no records; no database changes were made.");
    const counts = { CREATED: 0, UPDATED: 0, UNCHANGED: 0 };
    const existing = await prisma.food.findMany({
      where: { source: "FINELI" },
      select: { sourceExternalId: true, currentRevision: { select: { normalizedDataChecksum: true } } },
    });
    const existingChecksums = new Map(existing.map((food) => [food.sourceExternalId, food.currentRevision?.normalizedDataChecksum]));
    const pending = records.filter((record) => existingChecksums.get(record.externalId) !== record.checksum);
    counts.UNCHANGED = records.length - pending.length;
    for (let index = 0; index < pending.length; index += SYNC_BATCH_SIZE) {
      const outcomes = await Promise.all(pending.slice(index, index + SYNC_BATCH_SIZE).map(syncFineliDatasetFood));
      for (const outcome of outcomes) counts[outcome.status] += 1;
      const processed = counts.UNCHANGED + index + outcomes.length;
      if ((index + outcomes.length) % 240 === 0 || index + outcomes.length === pending.length) {
        console.info(`[Fineli sync] ${processed}/${records.length}`);
      }
    }
    console.info("[Fineli sync] complete", { source, datasetVersion, componentCount, parsed: records.length, foodRecords: records.filter((record) => record.searchMetadata.fineliType === "FOOD").length, dishRecords: records.filter((record) => record.searchMetadata.fineliType === "DISH").length, ...counts });
  } finally {
    await prisma.$disconnect();
    await rm(temporary, { recursive: true, force: true });
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await run();
}
