import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { TLSSocket } from "node:tls";
import { fileURLToPath } from "node:url";
import { Client } from "pg";

export const RELEASE_SHA = "b81e5349cf28ea97f4aa375a555c0d38174ffc00";
export const APPROVED_PENDING = [
  "20261103120000_secure_multi_provider_auth",
  "20261103130000_account_deletion_foundation",
  "20261109120000_account_deletion_park_photo_lookup",
  "20261109123000_account_deletion_food_review_checkpoint",
  "20261109130000_auth_email_outbox_leases",
  "20261117210000_ugc_moderation",
  "20261119120000_harden_native_google_handoff",
] as const;

const baselineCount = 64;
const database = "neondb";
const engineRevision = "3c6e192761c0362d496ed980de936e2f3cebcd3a";
const root = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(import.meta.url);
const expectedDirectHost = /^ep-dark-dew-aizz21ag(?:\.[a-z0-9-]+)+\.neon\.tech$/;
const migrationPath = /^prisma\/migrations\/([0-9]{14}_[a-z0-9_]+)\/migration\.sql$/;
const historicalMigration = {
  name: "20260612215408_add_location_indexes",
  productionChecksum: "39da5fa21ae75fe764907d7045f49c111982b800490187af409ab81f998b6b3e",
  repositoryChecksum: "9a99895f0a06ef284f574f463e06b08774990d79067fa987776a63d873481af2",
} as const;
const historicalApprovalFlag = "--owner-approved-location-index-exception";

// Use actual catalog relationships, including production's lowercase sequence.
export const PARK_SCHEMA_ATTESTATION_SQL = `
  WITH target AS (
    SELECT to_regclass('public."Park"') AS park, to_regclass('public.park_id_seq') AS seq
  ), columns AS (
    SELECT a.attname, a.attnum, a.attnotnull, a.attidentity, a.atttypid, a.atttypmod,
           pg_get_expr(d.adbin, d.adrelid) AS default_expression
    FROM target
    JOIN pg_attribute AS a ON a.attrelid = target.park AND NOT a.attisdropped
    LEFT JOIN pg_attrdef AS d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
    WHERE a.attname IN ('id', 'deletedAt', 'lat', 'lon')
  ), indexes AS (
    SELECT c.relname, i.indisunique, i.indisprimary, i.indnatts, i.indnkeyatts,
           i.indkey, i.indoption
    FROM target
    JOIN pg_index AS i ON i.indrelid = target.park
    JOIN pg_class AS c ON c.oid = i.indexrelid
    JOIN pg_am AS am ON am.oid = c.relam
    WHERE i.indisvalid AND i.indisready AND i.indislive
      AND am.amname = 'btree' AND i.indexprs IS NULL AND i.indpred IS NULL
  )
  SELECT
    EXISTS (SELECT 1 FROM columns, target WHERE attname = 'id' AND attnotnull
      AND atttypid = 'integer'::regtype AND attidentity = ''
      AND default_expression = format('nextval(%L::regclass)', target.seq::text)) AS id_default,
    EXISTS (SELECT 1 FROM columns WHERE attname = 'deletedAt' AND NOT attnotnull
      AND format_type(atttypid, atttypmod) = 'timestamp(3) without time zone'
      AND default_expression IS NULL) AS deleted_at,
    (SELECT count(*) = 2 FROM columns WHERE attname IN ('lat', 'lon')
      AND atttypid = 'double precision'::regtype AND attnotnull) AS coordinates,
    EXISTS (SELECT 1 FROM target JOIN pg_sequence AS s ON s.seqrelid = target.seq
      WHERE s.seqtypid = 'bigint'::regtype AND s.seqincrement = 1 AND NOT s.seqcycle) AS sequence,
    EXISTS (SELECT 1 FROM target
      JOIN pg_depend AS d ON d.objid = target.seq AND d.refobjid = target.park
      JOIN columns AS col ON col.attnum = d.refobjsubid AND col.attname = 'id'
      WHERE d.classid = 'pg_class'::regclass AND d.refclassid = 'pg_class'::regclass
        AND d.objsubid = 0 AND d.deptype = 'a') AS sequence_owned_by_id,
    EXISTS (SELECT 1 FROM indexes WHERE relname = 'Park_pkey' AND indisunique AND indisprimary
      AND indnatts = 1 AND indnkeyatts = 1 AND indkey[0] = (SELECT attnum FROM columns WHERE attname = 'id')
      AND indoption[0] = 0) AS primary_index,
    EXISTS (SELECT 1 FROM indexes WHERE relname = 'park_lat_lon_idx' AND NOT indisunique
      AND indnatts = 2 AND indnkeyatts = 2 AND indkey[0] = (SELECT attnum FROM columns WHERE attname = 'lat')
      AND indkey[1] = (SELECT attnum FROM columns WHERE attname = 'lon')
      AND indoption[0] = 0 AND indoption[1] = 0) AS coordinate_index
`;

const parkChecks = ["id_default", "deleted_at", "coordinates", "sequence", "sequence_owned_by_id", "primary_index", "coordinate_index"] as const;

class MigrationGuardError extends Error {}

type Environment = Record<string, string | undefined>;
type Target = { host: string; role: string; password: string; prismaUrl: string };
type Release = { files: Map<string, Buffer>; checksums: Map<string, string> };
type MigrationRow = { migration_name: string; checksum: string; applied: boolean; rolled_back: boolean };
type ParkSchema = Record<(typeof parkChecks)[number], boolean>;
type ConnectionIdentity = { tls: boolean; database: string; login_role: string; effective_role: string; read_only: boolean };
type Attestation = ConnectionIdentity & { rows: MigrationRow[]; parkSchema?: ParkSchema };

function approvedOperation(args: string[]) {
  const [intent, releaseFlag, sha, mode, ...flags] = args;
  if (intent !== "--production" || releaseFlag !== "--release" || sha !== RELEASE_SHA) {
    throw new MigrationGuardError("Use explicit --production intent and the pinned --release SHA.");
  }
  const ownerApprovedHistory = flags.at(-1) === historicalApprovalFlag;
  const authorization = ownerApprovedHistory ? flags.slice(0, -1) : flags;
  if (mode === "--verify" && authorization.length === 0) return { mode, ownerApprovedHistory };
  if (mode === "--execute" && authorization.length === 1 && authorization[0] === "--authorize-production-migration") {
    return { mode, ownerApprovedHistory };
  }
  throw new MigrationGuardError("Verification requires --verify. Execution requires --execute --authorize-production-migration.");
}

function approvedTarget(env: Environment): Target {
  // Refuse ambient connection, deployment, engine, Git, and TLS overrides.
  if (Object.keys(env).some((key) => /^(DATABASE_URL(?:$|_)|DATABASE_DIRECT_URL$|DIRECT_URL$|SHADOW_DATABASE_URL$|POSTGRES_|PG[A-Z_]|VERCEL(?:$|_)|CALISTHENI_DEPLOYMENT_TARGET$|PRISMA_|GIT_|SSL_CERT_|NODE_(?:TLS_|EXTRA_CA_CERTS$|OPTIONS$))/.test(key))) {
    throw new MigrationGuardError("Use an isolated operator environment without inherited database, deployment, or TLS overrides.");
  }
  const host = env.PRODUCTION_MIGRATION_EXPECTED_HOST;
  const role = env.PRODUCTION_MIGRATION_EXPECTED_ROLE;
  const value = env.PRODUCTION_MIGRATION_DATABASE_URL;
  if (!host || !expectedDirectHost.test(host) || !role || !/^[A-Za-z_][A-Za-z0-9_-]{0,62}$/.test(role) || !value) {
    throw new MigrationGuardError("Provide the independently approved production direct hostname, migration role, and dedicated connection secret.");
  }
  const url = new URL(value);
  if (url.protocol !== "postgresql:" || url.hostname !== host || (url.port && url.port !== "5432") ||
      url.pathname !== "/neondb" || decodeURIComponent(url.username) !== role || !url.password || url.hash) {
    throw new MigrationGuardError("The connection does not match the approved direct host, database, and migration role.");
  }
  if (url.searchParams.getAll("sslmode").join(",") !== "verify-full" ||
      [...url.searchParams.keys()].some((key) => key !== "sslmode" && key !== "schema") ||
      (url.searchParams.has("schema") && url.searchParams.getAll("schema").join(",") !== "public")) {
    throw new MigrationGuardError("The connection requires sslmode=verify-full and allows only optional schema=public.");
  }

  // The pinned Prisma engine uses these two options for mandatory TLS and verified identity.
  const password = decodeURIComponent(url.password);
  url.search = "sslmode=require&sslaccept=strict&schema=public";
  return { host, role, password, prismaUrl: url.toString() };
}

function git(...args: string[]) {
  return execFileSync("git", args, {
    cwd: root,
    env: { PATH: "/opt/homebrew/bin:/usr/bin:/bin", NODE_ENV: "production", GIT_NO_REPLACE_OBJECTS: "1", GIT_NO_LAZY_FETCH: "1" },
    stdio: ["ignore", "pipe", "ignore"],
  });
}

function loadRelease(): Release {
  const schema = "prisma/schema.prisma";
  const lock = "prisma/migrations/migration_lock.toml";
  const files = new Map<string, Buffer>();
  const checksums = new Map<string, string>();
  for (const path of git("ls-tree", "-r", "--name-only", "-z", RELEASE_SHA, "--", schema, "prisma/migrations").toString().split("\0").filter(Boolean)) {
    const migration = migrationPath.exec(path)?.[1];
    if (!migration && path !== schema && path !== lock) throw new MigrationGuardError("Unexpected file in the pinned migration tree.");
    const contents = git("show", `${RELEASE_SHA}:${path}`);
    files.set(path, contents);
    if (migration) checksums.set(migration, createHash("sha256").update(contents).digest("hex"));
  }
  if (!files.has(schema) || !files.has(lock) || checksums.size !== baselineCount + APPROVED_PENDING.length) {
    throw new MigrationGuardError("The pinned release migration inventory is incomplete.");
  }
  return { files, checksums };
}

async function attestTarget(target: Target, ownerApprovedHistory: boolean): Promise<Attestation> {
  const client = new Client({
    host: target.host, user: target.role, password: target.password, database, port: 5432,
    ssl: { rejectUnauthorized: true, servername: target.host }, connectionTimeoutMillis: 10_000,
  });
  let disconnected = false;
  client.on("error", () => { disconnected = true; });
  try {
    await client.connect();
    const socket = client.connection.stream;
    if (!(socket instanceof TLSSocket) || !socket.encrypted || !socket.authorized) {
      throw new MigrationGuardError("The actual connection did not establish verified TLS.");
    }
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ, READ ONLY");
    try {
      await client.query("SET LOCAL statement_timeout = '10s'");
      await client.query("SET LOCAL row_security = off");
      await client.query("SET LOCAL search_path = pg_catalog");
      const { rows: [identity] } = await client.query<Omit<ConnectionIdentity, "tls">>(`
        SELECT pg_catalog.current_database() AS database, session_user AS login_role,
               current_user AS effective_role,
               pg_catalog.current_setting('transaction_read_only') = 'on' AS read_only
      `);
      requireIdentity({ ...identity, tls: true }, target);
      const { rows } = await client.query<MigrationRow>(`
        SELECT migration_name, checksum, finished_at IS NOT NULL AS applied,
               rolled_back_at IS NOT NULL AS rolled_back
        FROM public."_prisma_migrations"
      `);
      const parkSchema = ownerApprovedHistory
        ? (await client.query<ParkSchema>(PARK_SCHEMA_ATTESTATION_SQL)).rows[0]
        : undefined;
      if (disconnected) throw new MigrationGuardError("The attestation connection closed unexpectedly.");
      return { ...identity, tls: true, rows, parkSchema };
    } finally {
      await client.query("ROLLBACK");
    }
  } finally {
    await client.end();
  }
}

function requireIdentity(identity: ConnectionIdentity, target: Target) {
  if (!identity.tls || !identity.read_only || identity.database !== database ||
      identity.login_role !== target.role || identity.effective_role !== target.role) {
    throw new MigrationGuardError("Live TLS, database, role, or read-only attestation failed.");
  }
}

function requireApprovedHistory(checksums: Map<string, string>, { rows, parkSchema }: Attestation, ownerApprovedHistory: boolean) {
  const applied = new Set<string>();
  let usedHistoricalException = false;
  for (const row of rows) {
    const repositoryChecksum = checksums.get(row.migration_name);
    if (row.applied !== true || row.rolled_back !== false || applied.has(row.migration_name) ||
        !/^[a-f0-9]{64}$/.test(row.checksum) || repositoryChecksum === undefined) {
      throw new MigrationGuardError("Migration history contains an unexpected attempt, name, or checksum.");
    }
    if (repositoryChecksum !== row.checksum) {
      if (row.migration_name !== historicalMigration.name || row.checksum !== historicalMigration.productionChecksum ||
          repositoryChecksum !== historicalMigration.repositoryChecksum) {
        throw new MigrationGuardError("Migration history contains an unexpected checksum.");
      }
      if (!ownerApprovedHistory) throw new MigrationGuardError("The pinned historical discrepancy requires explicit owner approval.");
      const failedCheck = parkChecks.find((check) => parkSchema?.[check] !== true);
      if (failedCheck) throw new MigrationGuardError(`Live Park schema attestation failed: ${failedCheck}.`);
      usedHistoricalException = true;
    }
    applied.add(row.migration_name);
  }
  const pending = [...checksums.keys()].filter((name) => !applied.has(name)).sort();
  if (applied.size !== baselineCount || pending.join("\n") !== APPROVED_PENDING.join("\n")) {
    throw new MigrationGuardError("The pending migration set differs from the approved release.");
  }
  return usedHistoricalException;
}

function deployRelease(release: Release, target: Target) {
  const scratch = mkdtempSync(join(tmpdir(), "calistheni-production-migrate-"));
  try {
    for (const [path, contents] of release.files) {
      const file = join(scratch, path);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, contents);
    }
    const config = join(scratch, "prisma.config.mjs");
    writeFileSync(config, `export default {
      schema: "prisma/schema.prisma",
      migrations: { path: "prisma/migrations" },
      datasource: { url: process.env.PRODUCTION_MIGRATION_ATTESTED_URL },
    };\n`);
    const cli = join(dirname(require.resolve("prisma/package.json")), "build", "index.js");
    const result = spawnSync(process.execPath, [cli, "migrate", "deploy", "--config", config], {
      cwd: scratch,
      env: { PATH: "/usr/bin:/bin", NODE_ENV: "production", CHECKPOINT_DISABLE: "1", PRODUCTION_MIGRATION_ATTESTED_URL: target.prismaUrl },
      stdio: "ignore",
    });
    if (result.status !== 0) {
      throw new MigrationGuardError("Prisma did not finish successfully. Keep traffic gated and inspect migration history before retrying.");
    }
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

export async function runProductionMigration(args: string[], {
  env = process.env, snapshot = loadRelease, attest = attestTarget, deploy = deployRelease,
  output = (message: string) => console.log(message),
}: {
  env?: Environment;
  snapshot?: () => Release;
  attest?: (target: Target, ownerApprovedHistory: boolean) => Promise<Attestation>;
  deploy?: (release: Release, target: Target) => void;
  output?: (message: string) => void;
} = {}) {
  try {
    const { mode, ownerApprovedHistory } = approvedOperation(args);
    const target = approvedTarget(env);
    if (require("@prisma/engines-version").enginesVersion !== engineRevision) {
      throw new MigrationGuardError("The installed Prisma engine revision has not been reviewed for production TLS.");
    }
    const release = snapshot();
    const identity = await attest(target, ownerApprovedHistory);
    requireIdentity(identity, target);
    if (requireApprovedHistory(release.checksums, identity, ownerApprovedHistory)) {
      output(`NOTICE: Owner-approved exception used for ${historicalMigration.name}. The historical checksum discrepancy remains recorded.`);
    }
    if (mode === "--execute") {
      deploy(release, target);
      output("PASS: Prisma completed. Keep traffic gated until the runbook postflight passes.");
    } else {
      output("PASS: Production connection and the seven pending migrations verified.");
    }
    return 0;
  } catch (error) {
    output(`FAIL: ${error instanceof MigrationGuardError ? error.message : "Production migration verification or execution failed. Check the operator configuration and history."}`);
    return 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await runProductionMigration(process.argv.slice(2));
}
