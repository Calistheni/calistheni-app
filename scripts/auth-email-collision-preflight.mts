import { pathToFileURL } from "node:url";
import { Client, type ClientConfig } from "pg";
import { summarizeEmailCollisions, type EmailIdentity } from "../lib/auth/email-collision-preflight";

type Mode = "--pre-migration" | "--post-migration";
type Environment = Record<string, string | undefined>;
type ConnectionConfig = ClientConfig & { enableChannelBinding: boolean };

class PreflightSchemaError extends Error {}
class RequiredChannelBindingError extends Error {}

async function inspectEmailCollisions(client: Client, mode: Mode) {
  await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ, READ ONLY");
  try {
    // Fail if row-level security would hide any rows from the inspection role.
    await client.query("SET LOCAL row_security = off");
    const postMigration = mode === "--post-migration";
    const { rows: [schema] } = await client.query<{ has_users: boolean; has_credentials: boolean }>(`
      SELECT pg_catalog.to_regclass('public."User"') IS NOT NULL AS has_users,
             ${postMigration ? `pg_catalog.to_regclass('public."PasswordCredential"') IS NOT NULL` : "FALSE"} AS has_credentials
    `);
    if (!schema?.has_users) {
      throw new PreflightSchemaError('Verify the target schema contains a readable public."User" table.');
    }
    if (postMigration && !schema.has_credentials) {
      throw new PreflightSchemaError('Post-migration verification requires public."PasswordCredential". Verify the authentication migration was applied.');
    }

    const { rows: users } = await client.query<EmailIdentity>(
      'SELECT id AS "userId", email FROM public."User"'
    );
    const credentials = postMigration
      ? (await client.query<EmailIdentity>(
          'SELECT "userId", "emailNormalized" AS email FROM public."PasswordCredential"'
        )).rows
      : [];

    return {
      usersInspected: users.length,
      credentialsInspected: postMigration ? credentials.length : undefined,
      ...summarizeEmailCollisions(users.concat(credentials)),
    };
  } finally {
    await client.query("ROLLBACK");
  }
}

function connectionConfig(env: Environment): ConnectionConfig | undefined {
  const connectionString = env.AUTH_EMAIL_PREFLIGHT_DATABASE_URL;
  const expectedHost = env.AUTH_EMAIL_PREFLIGHT_EXPECTED_HOST;
  if (!connectionString || !expectedHost) return;

  const url = new URL(connectionString);
  const user = decodeURIComponent(url.username);
  const password = decodeURIComponent(url.password);
  const database = decodeURIComponent(url.pathname.slice(1));
  if (!["postgresql:", "postgres:"].includes(url.protocol) ||
      url.hostname !== expectedHost || !user || !password || !database || database.includes("/") ||
      [...url.searchParams.keys()].some((key) => !["sslmode", "channel_binding", "schema"].includes(key)) ||
      (url.searchParams.has("schema") && url.searchParams.get("schema") !== "public")) return;

  if (url.searchParams.getAll("channel_binding").some((value) => value.trim().toLowerCase() === "require")) {
    throw new RequiredChannelBindingError();
  }

  const loopback = ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
  return {
    host: url.hostname === "[::1]" ? "::1" : url.hostname,
    port: url.port ? Number(url.port) : 5432,
    user,
    password,
    database,
    ssl: loopback && url.searchParams.get("sslmode") === "disable" ? false : { rejectUnauthorized: true },
    enableChannelBinding: true,
    connectionTimeoutMillis: 10_000,
  };
}

const inspectionFailure = "FAIL: Inspection did not complete. Verify database access and required schema, then retry before proceeding.";

export async function runEmailCollisionPreflight(
  args: string[],
  {
    env = process.env,
    output = console,
    createClient = (config: ConnectionConfig) => new Client(config),
  }: {
    env?: Environment;
    output?: { log: (line: string) => void; error: (line: string) => void };
    createClient?: (config: ConnectionConfig) => Client;
  } = {},
) {
  const [mode] = args;
  if (args.length !== 1 || (mode !== "--pre-migration" && mode !== "--post-migration")) {
    output.error("FAIL: Specify exactly one mode, --pre-migration or --post-migration.");
    return 1;
  }

  let config: ConnectionConfig | undefined;
  try {
    config = connectionConfig(env);
  } catch (error) {
    if (error instanceof RequiredChannelBindingError) {
      output.error("FAIL: This PostgreSQL driver cannot enforce required channel binding. If channel binding is mandatory, stop and arrange an approved preflight using a client that enforces it.");
      return 1;
    }
    // URL parsing errors can contain the original connection string.
  }
  if (!config) {
    output.error("FAIL: Supply an approved read-only connection in AUTH_EMAIL_PREFLIGHT_DATABASE_URL and its independently verified hostname in AUTH_EMAIL_PREFLIGHT_EXPECTED_HOST.");
    return 1;
  }

  try {
    const client = createClient(config);
    let connectionFailed = false;
    client.on("error", () => { connectionFailed = true; });
    let result;
    try {
      await client.connect();
      result = await inspectEmailCollisions(client, mode);
    } finally {
      await client.end();
    }
    if (connectionFailed) {
      output.error(inspectionFailure);
      return 1;
    }

    output.log(`Users inspected: ${result.usersInspected}`);
    if (result.credentialsInspected !== undefined) {
      output.log(`Credentials inspected: ${result.credentialsInspected}`);
    }
    output.log(`Collision groups: ${result.collisionGroups}`);
    output.log(`Affected records: ${result.affectedRecords}`);
    if (result.collisionGroups > 0) {
      output.error("FAIL: Stop the rollout and resolve conflicting ownership through a separately reviewed procedure before rerunning this check.");
      return 2;
    }
    output.log("PASS");
    return 0;
  } catch (error) {
    output.error(error instanceof PreflightSchemaError ? `FAIL: ${error.message}` : inspectionFailure);
    return 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  process.exitCode = await runEmailCollisionPreflight(process.argv.slice(2));
}
