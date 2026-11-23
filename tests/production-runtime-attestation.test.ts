import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PRODUCTION_VERCEL_PROJECT_ID } from "../lib/deployment-identity";
import { createProductionAttestationHandler, inspectDatabaseIdentity } from "../lib/production-runtime-attestation";

const now = Date.parse("2026-11-23T12:00:00Z");
const token = "a".repeat(43);
const origin = "https://calistheni-candidate-fixture.vercel.app";
const path = "/api/internal/production-db-identity";
const env = {
  NODE_ENV: "production",
  VERCEL_PROJECT_ID: PRODUCTION_VERCEL_PROJECT_ID,
  VERCEL_ENV: "production",
  VERCEL_URL: new URL(origin).host,
  VERCEL_DEPLOYMENT_ID: "dpl_Fixture",
  PRODUCTION_DB_ATTESTATION_TOKEN_SHA256: createHash("sha256").update(token).digest("hex"),
  PRODUCTION_DB_ATTESTATION_EXPIRES_AT: "2026-11-23T12:05:00Z",
} as const;
const evidence = {
  hostname: "fixture.neon.tech", database: "neondb", loginRole: "neondb_owner",
  effectiveRole: "neondb_owner", schema: "public", tls: true, certificateAndHostnameVerified: true,
};

function request(url = origin + path, bearer: string | null = token, host = new URL(url).host) {
  return new Request(url, { method: "POST", headers: { host, ...(bearer ? { authorization: `Bearer ${bearer}` } : {}) } });
}

test("attestation denies disabled, expired, missing or invalid authentication before querying", async () => {
  const cases = [
    [{ NODE_ENV: "production" }, request()],
    [{ ...env, PRODUCTION_DB_ATTESTATION_EXPIRES_AT: "2026-11-23T12:00:00Z" }, request()],
    [{ ...env, PRODUCTION_DB_ATTESTATION_EXPIRES_AT: "2026-11-23T12:16:00Z" }, request()],
    [env, request(origin + path, null)],
    [env, request(origin + path, "b".repeat(43))],
  ] as const;
  for (const [fixture, incoming] of cases) {
    const response = await createProductionAttestationHandler({ env: fixture, now: () => now, attest: neverAttest })(incoming);
    assert.equal(response.status, 404);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
  }
});

test("a valid token is restricted to the exact generated HTTPS origin and production project", async () => {
  const cases = [
    [{ ...env, VERCEL_ENV: "preview" }, request()],
    [{ ...env, VERCEL_PROJECT_ID: "prj_staging" }, request()],
    [{ ...env, VERCEL_DEPLOYMENT_ID: undefined }, request()],
    [{ ...env, VERCEL_URL: "calistheni-app.vercel.app" }, request("https://calistheni-app.vercel.app" + path)],
    [env, request("https://calistheni.app" + path)],
    [env, request(origin.replace("https:", "http:") + path)],
    [env, request(origin + path, token, "unrelated.vercel.app")],
    [env, request(origin + path + "?sql=fixture")],
  ] as const;
  for (const [fixture, incoming] of cases) {
    assert.equal((await createProductionAttestationHandler({ env: fixture, now: () => now, attest: neverAttest })(incoming)).status, 404);
  }
});

async function neverAttest(): Promise<never> {
  assert.fail("Untrusted requests must never invoke the database check");
}

test("successful responses allowlist evidence, and failures reveal no database detail", async () => {
  const handler = createProductionAttestationHandler({ env, now: () => now, async attest() {
    return { ...evidence, unwanted: "private-fixture" };
  } });
  const response = await handler(request());
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal(response.headers.get("vercel-cdn-cache-control"), "no-store");
  assert.deepEqual(await response.json(), { deploymentId: env.VERCEL_DEPLOYMENT_ID, ...evidence });

  const failingHandler = createProductionAttestationHandler({ env, now: () => now, async attest() {
    throw new Error("private-fixture");
  } });
  const failure = await failingHandler(request());
  assert.equal(failure.status, 503);
  assert.equal(await failure.text(), "");
});

test("a wrong configured target is rejected before opening a connection", async (t) => {
  const pool = new Pool({ connectionString: "postgresql://owner:fixture@example.invalid/neondb?sslmode=verify-full" });
  const connect = t.mock.method(pool, "connect", neverAttest);
  try {
    await assert.rejects(inspectDatabaseIdentity(pool), /target mismatch/);
    assert.equal(connect.mock.callCount(), 0);
  } finally {
    await pool.end();
  }
});

const port = Number(process.env.ATTESTATION_TEST_TLS_PORT);
const caPath = process.env.ATTESTATION_TEST_TLS_CA;
test("checks a real TLS socket shared with PrismaPg and rolls back the identity transaction", { skip: !port || !caPath }, async () => {
  const connectionString = `postgresql://test_owner:fixture@localhost:${port}/calistheni_attestation_test`;
  const expected = { hostname: "localhost", port, database: "calistheni_attestation_test", role: "test_owner", schema: "public" };
  const pool = new Pool({ connectionString, max: 1, ssl: { ca: readFileSync(caPath!), rejectUnauthorized: true } });
  const adapter = await new PrismaPg(pool, { disposeExternalPool: true }).connect();
  try {
    const before = await adapter.queryRaw({ sql: "SELECT pg_backend_pid()", args: [], argTypes: [] });
    const result = await inspectDatabaseIdentity(pool, expected);
    assert.deepEqual(result, {
      ...evidence, hostname: "localhost", database: expected.database, loginRole: expected.role, effectiveRole: expected.role,
    });
    assert.equal(pool.totalCount, 1);
    const after = await adapter.queryRaw({ sql: "SELECT pg_backend_pid(), current_setting('transaction_read_only')", args: [], argTypes: [] });
    assert.deepEqual(after.rows[0], [before.rows[0][0], "off"]);
    await assert.rejects(inspectDatabaseIdentity(pool, { ...expected, schema: "unexpected" }), /session mismatch/);
  } finally {
    await adapter.dispose();
  }

  const unverified = new Pool({ connectionString, ssl: { rejectUnauthorized: false } });
  try {
    await assert.rejects(inspectDatabaseIdentity(unverified, expected), /TLS mismatch/);
  } finally {
    await unverified.end();
  }
});
