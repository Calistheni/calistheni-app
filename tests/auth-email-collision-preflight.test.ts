import assert from "node:assert/strict";
import test from "node:test";
import { Client } from "pg";

const preflight = import("../scripts/auth-email-collision-preflight.mts");

const env = {
  AUTH_EMAIL_PREFLIGHT_DATABASE_URL: "postgresql://reader:fixture-password@localhost/calistheni_test?sslmode=disable",
  AUTH_EMAIL_PREFLIGHT_EXPECTED_HOST: "localhost",
};
const begin = "BEGIN ISOLATION LEVEL REPEATABLE READ, READ ONLY";
const usersOnly = { has_users: true, has_credentials: false };
const migrated = { has_users: true, has_credentials: true };

async function runFixture(
  mode: "--pre-migration" | "--post-migration",
  responses: readonly (readonly object[] | Error)[],
) {
  const client = new Client();
  const queries: string[] = [];
  const calls: string[] = [];
  const output: string[] = [];
  let nextResponse = 0;
  client.connect = async () => {
    calls.push("connect");
    return client;
  };
  client.end = async () => { calls.push("end"); };
  client.query = (async (sql: string) => {
    queries.push(sql);
    if (sql === "SET LOCAL row_security = off") return { rows: [] };
    const response = responses[nextResponse++];
    if (response instanceof Error) throw response;
    return { rows: response ?? [] };
  }) as Client["query"];
  const { runEmailCollisionPreflight } = await preflight;
  const exitCode = await runEmailCollisionPreflight([mode], {
    env,
    createClient: () => client,
    output: { log: (line) => output.push(line), error: (line) => output.push(line) },
  });
  assert.deepEqual(calls, ["connect", "end"]);
  assert.equal(queries[0], begin);
  assert.equal(queries[1], "SET LOCAL row_security = off");
  assert.equal(queries.at(-1), "ROLLBACK");
  return { exitCode, output, queries };
}

test("pre-migration inspects User only and handles absent, blank, and malformed emails", async () => {
  const result = await runFixture("--pre-migration", [[], [usersOnly], [
    { userId: "fixture-user-1", email: null },
    { userId: "fixture-user-2", email: "" },
    { userId: "fixture-user-3", email: " \t " },
    { userId: "fixture-user-4", email: "not-an-address" },
    { userId: "fixture-user-5", email: "unique@example.invalid" },
  ]]);
  assert.equal(result.exitCode, 0);
  assert.deepEqual(result.output, ["Users inspected: 5", "Collision groups: 0", "Affected records: 0", "PASS"]);
  assert.equal(result.queries.length, 5);
  assert.doesNotMatch(result.queries.join("\n"), /PasswordCredential/);
});

test("pre-migration reports normalized collisions as counts without disclosing records", async () => {
  const result = await runFixture("--pre-migration", [[], [usersOnly], [
    { userId: "fixture-user-1", email: " \u212B@Example.Invalid " },
    { userId: "fixture-user-2", email: "\u00C5@example.invalid" },
    { userId: "fixture-user-3", email: " Broken Address " },
    { userId: "fixture-user-4", email: "broken address" },
  ]]);
  assert.equal(result.exitCode, 2);
  assert.deepEqual(result.output.slice(0, 3), ["Users inspected: 4", "Collision groups: 2", "Affected records: 4"]);
  assert.match(result.output[3], /^FAIL:.*separately reviewed procedure/);
  assert.doesNotMatch(result.output.join("\n"), /fixture-user|example\.invalid|broken address/i);
});

test("post-migration accepts matching User and credential rows for the same owner", async () => {
  const result = await runFixture("--post-migration", [[], [migrated],
    [{ userId: "fixture-user", email: "Example@Example.Invalid" }],
    [{ userId: "fixture-user", email: "example@example.invalid" }],
  ]);
  assert.equal(result.exitCode, 0);
  assert.deepEqual(result.output, [
    "Users inspected: 1", "Credentials inspected: 1", "Collision groups: 0", "Affected records: 0", "PASS",
  ]);
  assert.match(result.queries[4], /SELECT "userId", "emailNormalized" AS email FROM public\."PasswordCredential"/);
});

test("post-migration detects normalized credential ownership conflicts across records", async () => {
  const result = await runFixture("--post-migration", [[], [migrated],
    [{ userId: "owner-a", email: "Example@Example.Invalid" }],
    [
      { userId: "owner-a", email: "example@example.invalid" },
      { userId: "owner-b", email: "EXAMPLE@example.invalid" },
    ],
  ]);
  assert.equal(result.exitCode, 2);
  assert.ok(result.output.includes("Collision groups: 1"));
  assert.ok(result.output.includes("Affected records: 3"));
  assert.doesNotMatch(result.output.join("\n"), /owner-[ab]|example\.invalid/i);
});

test("required tables missing from the schema fail before reading account records", async () => {
  const missingUsers = await runFixture("--pre-migration", [[], [{ ...usersOnly, has_users: false }]]);
  const missingCredentials = await runFixture("--post-migration", [[], [usersOnly]]);
  assert.equal(missingUsers.exitCode, 1);
  assert.equal(missingCredentials.exitCode, 1);
  assert.match(missingUsers.output.join(), /^FAIL:.*public\."User"/);
  assert.match(missingCredentials.output.join(), /^FAIL:.*public\."PasswordCredential"/);
  assert.equal(missingUsers.queries.length, 4);
  assert.equal(missingCredentials.queries.length, 4);
});

test("unexpected schema or query errors fail closed and suppress driver details", async () => {
  const error = new Error("fixture-user private@example.invalid postgresql://fixture-password");
  for (const responses of [[[], error], [[], [migrated], [], error]]) {
    const result = await runFixture("--post-migration", responses);
    assert.equal(result.exitCode, 1);
    assert.deepEqual(result.output, [
      "FAIL: Inspection did not complete. Verify database access and required schema, then retry before proceeding.",
    ]);
  }
});

test("an explicit mode and matching pinned host are required before constructing a client", async () => {
  const { runEmailCollisionPreflight } = await preflight;
  const fail = () => assert.fail("a client must not be constructed");
  const output: string[] = [];
  const options = { createClient: fail, output: { log: fail, error: (line: string) => output.push(line) } };
  assert.equal(await runEmailCollisionPreflight([], { ...options, env }), 1);
  assert.equal(await runEmailCollisionPreflight(["--pre-migration"], {
    ...options, env: { DATABASE_URL: env.AUTH_EMAIL_PREFLIGHT_DATABASE_URL },
  }), 1);
  assert.equal(await runEmailCollisionPreflight(["--pre-migration"], {
    ...options, env: { ...env, AUTH_EMAIL_PREFLIGHT_EXPECTED_HOST: "different.invalid" },
  }), 1);
  assert.equal(await runEmailCollisionPreflight(["--pre-migration"], {
    ...options, env: { ...env, AUTH_EMAIL_PREFLIGHT_DATABASE_URL: "invalid-url-with-fixture-password" },
  }), 1);
  assert.equal(output.length, 4);
  assert.doesNotMatch(output.join("\n"), /fixture-password|postgresql:\/\//);
});

test("both modes reject required channel binding before creating a database client", async () => {
  const { runEmailCollisionPreflight } = await preflight;
  const output: string[] = [];
  let clientCreations = 0;
  for (const [mode, options] of [
    ["--pre-migration", "channel_binding=require"],
    ["--post-migration", "channel_binding=prefer&channel_binding=%72equire"],
  ]) {
    const code = await runEmailCollisionPreflight([mode], {
      env: { ...env, AUTH_EMAIL_PREFLIGHT_DATABASE_URL: `${env.AUTH_EMAIL_PREFLIGHT_DATABASE_URL}&${options}` },
      createClient: () => {
        clientCreations++;
        throw new Error("fixture client must not be created");
      },
      output: { log: (line) => output.push(line), error: (line) => output.push(line) },
    });
    assert.equal(code, 1);
  }
  assert.equal(clientCreations, 0);
  assert.equal(output.length, 2);
  for (const line of output) {
    assert.match(line, /^FAIL:.*cannot enforce required channel binding.*approved preflight/);
    assert.doesNotMatch(line, /fixture-password|postgresql:\/\//);
  }
});

test("optional channel binding preserves verified TLS and the pinned remote host", async () => {
  const { runEmailCollisionPreflight } = await preflight;
  const hostname = "fixture.example.invalid";
  const observed: unknown[] = [];
  await runEmailCollisionPreflight(["--pre-migration"], {
    env: {
      AUTH_EMAIL_PREFLIGHT_DATABASE_URL: `postgresql://reader:fixture-password@${hostname}/calistheni_test?sslmode=require&channel_binding=prefer`,
      AUTH_EMAIL_PREFLIGHT_EXPECTED_HOST: hostname,
    },
    createClient: (config) => {
      observed.push({ host: config.host, ssl: config.ssl, enableChannelBinding: config.enableChannelBinding });
      throw new Error("fixture stops before connecting");
    },
    output: { log: () => {}, error: () => {} },
  });
  assert.deepEqual(observed, [{ host: hostname, ssl: { rejectUnauthorized: true }, enableChannelBinding: true }]);
});
