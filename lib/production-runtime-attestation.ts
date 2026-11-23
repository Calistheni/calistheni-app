import { createHash, timingSafeEqual } from "node:crypto";
import { checkServerIdentity, TLSSocket } from "node:tls";
import { Client, type Pool } from "pg";
import { PRODUCTION_VERCEL_PROJECT_ID, resolveDeploymentIdentity } from "@/lib/deployment-identity";

const productionDatabase = {
  hostname: "ep-dark-dew-aizz21ag-pooler.c-4.us-east-1.aws.neon.tech",
  port: 5432,
  database: "neondb",
  role: "neondb_owner",
  schema: "public",
};

export async function inspectDatabaseIdentity(pool: Pool, expected = productionDatabase) {
  const configured = new URL(pool.options.connectionString ?? "");
  if (configured.hostname !== expected.hostname || Number(configured.port || 5432) !== expected.port ||
      configured.pathname !== `/${expected.database}` || decodeURIComponent(configured.username) !== expected.role) {
    throw new Error("Database attestation target mismatch.");
  }

  const client = await pool.connect();
  let reusable = false;
  try {
    // This is the checked-out Prisma pool socket. pg_stat_ssl would only
    // describe the server-side connection behind a transaction pooler.
    if (!(client instanceof Client) || client.host !== expected.hostname || client.port !== expected.port) {
      throw new Error("Database attestation driver target mismatch.");
    }
    const socket = client.connection.stream;
    if (!(socket instanceof TLSSocket) || !socket.encrypted || !socket.authorized ||
        checkServerIdentity(expected.hostname, socket.getPeerCertificate())) {
      throw new Error("Database attestation TLS mismatch.");
    }

    await client.query("BEGIN READ ONLY");
    let identity;
    try {
      await client.query("SET LOCAL statement_timeout = '3s'");
      const { rows: [row] } = await client.query<{
        database: string; login_role: string; effective_role: string; schema: string; read_only: boolean;
      }>(`SELECT pg_catalog.current_database() AS database, session_user AS login_role,
            current_user AS effective_role, pg_catalog.current_schema() AS schema,
            pg_catalog.current_setting('transaction_read_only') = 'on' AS read_only`);
      if (!row || !row.read_only || row.database !== expected.database || row.login_role !== expected.role ||
          row.effective_role !== expected.role || row.schema !== expected.schema) {
        throw new Error("Database attestation session mismatch.");
      }
      identity = {
        hostname: client.host, database: row.database, loginRole: row.login_role,
        effectiveRole: row.effective_role, schema: row.schema, tls: true, certificateAndHostnameVerified: true,
      };
    } finally {
      await client.query("ROLLBACK");
    }
    reusable = true;
    return identity;
  } finally {
    client.release(!reusable);
  }
}

export function createProductionAttestationHandler({
  attest, env = process.env, now = Date.now,
}: {
  attest: () => ReturnType<typeof inspectDatabaseIdentity>;
  env?: NodeJS.ProcessEnv;
  now?: () => number;
}) {
  return async (request: Request) => {
    const headers = { "Cache-Control": "private, no-store", "Vercel-CDN-Cache-Control": "no-store" };
    const deny = () => new Response(null, { status: 404, headers });
    const token = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(request.headers.get("authorization") ?? "")?.[1];
    const digest = env.PRODUCTION_DB_ATTESTATION_TOKEN_SHA256;
    const expiresAt = Date.parse(env.PRODUCTION_DB_ATTESTATION_EXPIRES_AT ?? "");
    const remaining = expiresAt - now();
    if (request.method !== "POST" || !token || !digest || !/^[a-f0-9]{64}$/.test(digest) ||
        !(remaining > 0 && remaining <= 15 * 60_000) ||
        !timingSafeEqual(createHash("sha256").update(token).digest(), Buffer.from(digest, "hex"))) return deny();

    const host = env.VERCEL_URL;
    const deploymentId = env.VERCEL_DEPLOYMENT_ID;
    const url = new URL(request.url);
    if (env.VERCEL_PROJECT_ID !== PRODUCTION_VERCEL_PROJECT_ID || !deploymentId ||
        !/^dpl_[A-Za-z0-9]+$/.test(deploymentId) || !host || host === "calistheni-app.vercel.app" ||
        !/^[a-z0-9-]+\.vercel\.app$/.test(host) || url.origin !== `https://${host}` ||
        request.headers.get("host") !== host || url.pathname !== "/api/internal/production-db-identity" || url.search) return deny();

    try {
      const identity = resolveDeploymentIdentity(env);
      if (!identity.hosted || !identity.stable || identity.target !== "production") return deny();
    } catch {
      return deny();
    }

    try {
      const { hostname, database, loginRole, effectiveRole, schema, tls, certificateAndHostnameVerified } = await attest();
      return Response.json({ deploymentId, hostname, database, loginRole, effectiveRole, schema, tls, certificateAndHostnameVerified }, { headers });
    } catch {
      return new Response(null, { status: 503, headers });
    }
  };
}
