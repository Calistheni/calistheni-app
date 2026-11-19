import { createHash, timingSafeEqual } from "node:crypto";
import { Client, type ClientConfig } from "pg";
import { resolveDeploymentIdentity, validateDatabaseIdentity } from "../../lib/deployment-identity";

const projectId = "prj_YtsOroWMJGSHWTxyJJzYkvnW5jf9";
const endpoint = "ep-floral-violet-bb5i81e9";
const database = "neondb";
const role = "neondb_owner";
const maxLifetimeMs = 30 * 60_000;
const headers = { "Cache-Control": "private, no-store" };
type IdentityConnection = ClientConfig & { enableChannelBinding: boolean };

function matchesDigest(value: string, digest?: string) {
  if (!digest || !/^[0-9a-f]{64}$/.test(digest)) return false;
  return timingSafeEqual(createHash("sha256").update(value).digest(), Buffer.from(digest, "hex"));
}

async function readIdentity(config: ClientConfig) {
  const client = new Client(config);
  try {
    await client.connect();
    await client.query("BEGIN READ ONLY");
    try {
      const { rows } = await client.query<{
        database: string;
        session_role: string;
        effective_role: string;
        read_only: string;
      }>(`
        SELECT current_database() AS database, session_user AS session_role,
               current_user AS effective_role, current_setting('transaction_read_only') AS read_only
      `);
      const row = rows[0];
      return row?.database === database && row.session_role === role &&
        row.effective_role === role && row.read_only === "on";
    } finally {
      await client.query("ROLLBACK");
    }
  } finally {
    await client.end();
  }
}

export async function attestStaging(
  request: Request,
  env: Record<string, string | undefined> = process.env,
  inspect: (config: IdentityConnection) => Promise<boolean> = readIdentity,
  now = Date.now(),
) {
  const url = new URL(request.url);
  const token = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(request.headers.get("authorization") ?? "")?.[1];
  const expiresAt = Date.parse(env.STAGING_ATTESTATION_EXPIRES_AT ?? "");
  if (request.method !== "POST" || request.body !== null || url.pathname !== "/api/attest" ||
      url.search || url.protocol !== "https:" || url.host !== env.VERCEL_URL ||
      !/^calistheni-staging-[a-z0-9-]+\.vercel\.app$/.test(url.host) ||
      env.VERCEL_PROJECT_ID !== projectId || env.VERCEL !== "1" ||
      !/^dpl_[a-zA-Z0-9]+$/.test(env.VERCEL_DEPLOYMENT_ID ?? "") ||
      !Number.isFinite(expiresAt) || expiresAt <= now || expiresAt - now > maxLifetimeMs ||
      !token || !matchesDigest(token, env.STAGING_ATTESTATION_TOKEN_SHA256)) {
    return new Response(null, { status: 404, headers });
  }

  try {
    const identity = resolveDeploymentIdentity(env);
    const connection = env.DATABASE_URL;
    if (identity.hosted && identity.target === "staging" && identity.stable &&
        connection && matchesDigest(connection, env.STAGING_ATTESTATION_DATABASE_SHA256) &&
        !env.PGOPTIONS && !env.PGSERVICE && !env.PGHOSTADDR) {
      const db = new URL(connection);
      validateDatabaseIdentity(db, env);
      if (/^ep-floral-violet-bb5i81e9(?:-pooler)?\.[a-z0-9.-]+\.neon\.tech$/.test(db.hostname) &&
          db.hostname === env.STAGING_ATTESTATION_NEON_HOST &&
          db.username === role && db.password &&
          [...db.searchParams.keys()].every(key => key === "sslmode" || key === "channel_binding") &&
          await inspect({
            host: db.hostname,
            port: 5432,
            database,
            user: role,
            password: decodeURIComponent(db.password),
            ssl: { rejectUnauthorized: true },
            enableChannelBinding: true,
            connectionTimeoutMillis: 3_000,
            statement_timeout: 3_000,
            query_timeout: 3_000,
          })) {
        return Response.json({
          match: true,
          deploymentId: env.VERCEL_DEPLOYMENT_ID,
          vercelProjectId: projectId,
          environment: "staging",
          endpoint,
          hostname: db.hostname,
          database,
          role,
        }, { headers });
      }
    }
  } catch {
    // Connection and provider errors may include details that must stay private.
  }
  return Response.json({ match: false }, { status: 503, headers });
}

const handler = {
  fetch(request: Request) {
    return attestStaging(request);
  },
};

export default handler;
