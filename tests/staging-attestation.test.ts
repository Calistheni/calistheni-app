import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import test from "node:test";
import { attestStaging } from "../scripts/staging-attestation/handler";

const now = Date.parse("2026-11-19T18:00:00Z");
const deploymentHost = "calistheni-staging-test-team.vercel.app";
const neonHost = "ep-floral-violet-bb5i81e9-pooler.fixture.neon.tech";
const token = randomBytes(32).toString("base64url");
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const fixtureUrl = new URL(`postgresql://${neonHost}/neondb?sslmode=require`);
fixtureUrl.username = "neondb_owner";
fixtureUrl.password = randomBytes(16).toString("hex");
const connection = fixtureUrl.toString();
const environment = {
  VERCEL: "1",
  VERCEL_URL: deploymentHost,
  VERCEL_DEPLOYMENT_ID: "dpl_stagingFixture",
  VERCEL_PROJECT_ID: "prj_YtsOroWMJGSHWTxyJJzYkvnW5jf9",
  VERCEL_ENV: "production",
  CALISTHENI_DEPLOYMENT_TARGET: "staging",
  STAGING_ATTESTATION_EXPIRES_AT: new Date(now + 600_000).toISOString(),
  STAGING_ATTESTATION_TOKEN_SHA256: digest(token),
  STAGING_ATTESTATION_DATABASE_SHA256: digest(connection),
  STAGING_ATTESTATION_NEON_HOST: neonHost,
  DATABASE_URL: connection,
};
const accepted = new Request(`https://${deploymentHost}/api/attest`, {
  method: "POST",
  headers: { Authorization: `Bearer ${token}` },
});

test("accepts only an authenticated HTTPS POST to the immutable staging URL", async () => {
  const rejectConnection = async () => assert.fail("rejected requests must never reach PostgreSQL");
  for (const [request, env] of [
    [new Request(accepted.url, { method: "POST" }), environment],
    [new Request(accepted, { headers: { Authorization: `Bearer ${randomBytes(32).toString("base64url")}` } }), environment],
    [new Request(accepted.url, { headers: accepted.headers }), environment],
    [new Request(accepted, { body: "{}" }), environment],
    [new Request(accepted.url + "?credential=ignored", accepted), environment],
    [new Request("https://calistheni-staging.vercel.app/api/attest", accepted), environment],
    [accepted, { ...environment, VERCEL_PROJECT_ID: "prj_other" }],
    [accepted, { ...environment, VERCEL_DEPLOYMENT_ID: "" }],
    [accepted, { ...environment, STAGING_ATTESTATION_EXPIRES_AT: new Date(now).toISOString() }],
    [accepted, { ...environment, STAGING_ATTESTATION_EXPIRES_AT: new Date(now + 1_800_001).toISOString() }],
  ] as const) {
    const response = await attestStaging(request, env, rejectConnection, now);
    assert.equal(response.status, 404);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.equal(await response.text(), "");
  }
});

test("rejects inherited, mismatched and overridden database configuration before connecting", async () => {
  let connectionAttempts = 0;
  const inspect = async () => {
    connectionAttempts += 1;
    return false;
  };
  for (const env of [
    { ...environment, STAGING_ATTESTATION_DATABASE_SHA256: undefined },
    { ...environment, STAGING_ATTESTATION_DATABASE_SHA256: digest("another connection") },
    { ...environment, STAGING_ATTESTATION_NEON_HOST: undefined },
    { ...environment, VERCEL_ENV: "preview" },
    { ...environment, PGOPTIONS: "-c role=other" },
    ...[
      connection.replace("ep-floral-violet-bb5i81e9-pooler", "ep-dark-dew-aizz21ag"),
      connection.replace("neondb_owner", "other_role"),
      connection.replace("/neondb?", "/other?"),
      connection.replace("/neondb?", ":6543/neondb?"),
      connection + "&host=other.invalid",
      connection + "&options=route",
    ].map(databaseUrl => ({
      ...environment,
      DATABASE_URL: databaseUrl,
      STAGING_ATTESTATION_DATABASE_SHA256: digest(databaseUrl),
      STAGING_ATTESTATION_NEON_HOST: new URL(databaseUrl).hostname,
    })),
  ]) {
    assert.equal((await attestStaging(accepted, env, inspect, now)).status, 503);
  }
  assert.equal(connectionAttempts, 0);
});

test("reports allowlisted runtime identity over verified TLS and sanitizes database errors", async () => {
  const response = await attestStaging(accepted, environment, async (config) => {
    assert.equal(config.host, neonHost);
    assert.equal(config.database, "neondb");
    assert.equal(config.user, "neondb_owner");
    assert.deepEqual(config.ssl, { rejectUnauthorized: true });
    return true;
  }, now);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    match: true,
    deploymentId: environment.VERCEL_DEPLOYMENT_ID,
    vercelProjectId: environment.VERCEL_PROJECT_ID,
    environment: "staging",
    endpoint: "ep-floral-violet-bb5i81e9",
    hostname: neonHost,
    database: "neondb",
    role: "neondb_owner",
  });

  const mismatch = await attestStaging(accepted, environment, async () => false, now);
  assert.equal(mismatch.status, 503);
  assert.deepEqual(await mismatch.json(), { match: false });

  const error = await attestStaging(accepted, environment, async () => { throw Error(connection); }, now);
  assert.equal(error.status, 503);
  assert.deepEqual(await error.json(), { match: false });
});
