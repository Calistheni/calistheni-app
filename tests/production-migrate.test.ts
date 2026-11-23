import assert from "node:assert/strict";
import test from "node:test";

const runner = import("../scripts/production-migrate.mts");
type Options = NonNullable<Parameters<Awaited<typeof runner>["runProductionMigration"]>[1]>;
type Attestation = Awaited<ReturnType<NonNullable<Options["attest"]>>>;

const host = "ep-dark-dew-aizz21ag.fixture.aws.neon.tech";
const role = "fixture_migrator";
const secret = "fixture-password";
const env = {
  PRODUCTION_MIGRATION_EXPECTED_HOST: host,
  PRODUCTION_MIGRATION_EXPECTED_ROLE: role,
  PRODUCTION_MIGRATION_DATABASE_URL: `postgresql://${role}:${secret}@${host}/neondb?sslmode=verify-full`,
};
const historicalName = "20260612215408_add_location_indexes";
const productionChecksum = "39da5fa21ae75fe764907d7045f49c111982b800490187af409ab81f998b6b3e";
const repositoryChecksum = "9a99895f0a06ef284f574f463e06b08774990d79067fa987776a63d873481af2";
const ownerApproval = "--owner-approved-location-index-exception";
const approvedSchema = {
  id_default: true, deleted_at: true, coordinates: true, sequence: true,
  sequence_owned_by_id: true, primary_index: true, coordinate_index: true,
};

async function fixture({
  args, changeEnv = {}, changeIdentity = {}, changeHistory = (rows) => rows, changeRelease = () => {},
}: {
  args?: string[];
  changeEnv?: Options["env"];
  changeIdentity?: Partial<Omit<Attestation, "rows">>;
  changeHistory?: (rows: Attestation["rows"]) => Attestation["rows"];
  changeRelease?: (checksums: Map<string, string>) => void;
} = {}) {
  const { RELEASE_SHA, APPROVED_PENDING, runProductionMigration } = await runner;
  const checksum = "1".repeat(64);
  const rows = Array.from({ length: 64 }, (_, i) => ({
    migration_name: i === 0 ? historicalName : `fixture_${i}`,
    checksum: i === 0 ? repositoryChecksum : checksum, applied: true, rolled_back: false,
  }));
  const release = {
    files: new Map<string, Buffer>(),
    checksums: new Map([
      ...rows.map((row): [string, string] => [row.migration_name, row.checksum]),
      ...APPROVED_PENDING.map((name): [string, string] => [name, checksum]),
    ]),
  };
  changeRelease(release.checksums);
  const events: string[] = [];
  const output: string[] = [];
  let prismaParameters: string | undefined;
  const code = await runProductionMigration(args ?? ["--production", "--release", RELEASE_SHA, "--verify"], {
    env: { ...env, ...changeEnv },
    snapshot: () => { events.push("snapshot"); return release; },
    attest: async (_target, ownerApprovedHistory) => {
      events.push("attest");
      return {
        tls: true, database: "neondb", login_role: role, effective_role: role, read_only: true,
        ...changeIdentity, rows: changeHistory(rows),
        parkSchema: ownerApprovedHistory ? changeIdentity.parkSchema : undefined,
      };
    },
    deploy: (_release, target) => {
      events.push("deploy");
      prismaParameters = new URL(target.prismaUrl).search;
    },
    output: (message) => output.push(message),
  });
  assert.doesNotMatch(output.join("\n"), /fixture-password|postgresql:\/\//);
  return { code, events, output, prismaParameters };
}

test("verification accepts the exact target and history without invoking deploy", async () => {
  assert.deepEqual(await fixture(), {
    code: 0,
    events: ["snapshot", "attest"],
    output: ["PASS: Production connection and the seven pending migrations verified."],
    prismaParameters: undefined,
  });
});

for (const [label, url] of [
  ["wrong host", env.PRODUCTION_MIGRATION_DATABASE_URL.replace(host, "other.neon.tech")],
  ["wrong database", env.PRODUCTION_MIGRATION_DATABASE_URL.replace("neondb", "other")],
  ["wrong role", env.PRODUCTION_MIGRATION_DATABASE_URL.replace(role, "other")],
  ["pooled endpoint", env.PRODUCTION_MIGRATION_DATABASE_URL.replace("aizz21ag.", "aizz21ag-pooler.")],
  ["missing TLS verification", env.PRODUCTION_MIGRATION_DATABASE_URL.replace("verify-full", "require")],
  ["routing override", env.PRODUCTION_MIGRATION_DATABASE_URL + "&host=other.neon.tech"],
]) {
  test(`rejects ${label} before connecting`, async () => {
    const result = await fixture({ changeEnv: { PRODUCTION_MIGRATION_DATABASE_URL: url } });
    assert.equal(result.code, 1);
    assert.deepEqual(result.events, []);
  });
}

test("rejects a pooled expected hostname even when the URL agrees", async () => {
  const result = await fixture({ changeEnv: {
    PRODUCTION_MIGRATION_EXPECTED_HOST: host.replace("aizz21ag.", "aizz21ag-pooler."),
    PRODUCTION_MIGRATION_DATABASE_URL: env.PRODUCTION_MIGRATION_DATABASE_URL.replace("aizz21ag.", "aizz21ag-pooler."),
  } });
  assert.deepEqual(result.events, []);
  assert.equal(result.code, 1);
});

test("rejects inherited connection variables and has no DATABASE_URL fallback", async () => {
  for (const changeEnv of [
    { DATABASE_URL: env.PRODUCTION_MIGRATION_DATABASE_URL },
    { DATABASE_URL: env.PRODUCTION_MIGRATION_DATABASE_URL, PRODUCTION_MIGRATION_DATABASE_URL: "" },
    { PGHOSTADDR: "fixture" },
    { VERCEL_ENV: "preview" },
  ]) {
    const result = await fixture({ changeEnv });
    assert.equal(result.code, 1);
    assert.deepEqual(result.events, []);
  }
});

test("rejects a wrong release or missing execution authorization before connecting", async () => {
  const { RELEASE_SHA } = await runner;
  for (const args of [
    ["--production", "--release", "0".repeat(40), "--verify"],
    ["--production", "--release", RELEASE_SHA, "--execute"],
    ["--release", RELEASE_SHA, "--verify"],
  ]) {
    const result = await fixture({ args });
    assert.equal(result.code, 1);
    assert.deepEqual(result.events, []);
  }
});

test("execution reattests live identity, including actual TLS and both roles", async () => {
  const { RELEASE_SHA } = await runner;
  const args = ["--production", "--release", RELEASE_SHA, "--execute", "--authorize-production-migration"];
  for (const changeIdentity of [
    { tls: false }, { database: "other" }, { login_role: "other" }, { effective_role: "other" }, { read_only: false },
  ]) {
    const result = await fixture({ args, changeIdentity });
    assert.equal(result.code, 1);
    assert.deepEqual(result.events, ["snapshot", "attest"]);
  }
  const result = await fixture({ args });
  assert.equal(result.code, 0);
  assert.deepEqual(result.events, ["snapshot", "attest", "deploy"]);
  assert.equal(result.prismaParameters, "?sslmode=require&sslaccept=strict&schema=public");
});

test("rejects unexpected, incomplete, duplicate, and changed history and pending sets", async () => {
  const { RELEASE_SHA, APPROVED_PENDING } = await runner;
  const args = ["--production", "--release", RELEASE_SHA, "--execute", "--authorize-production-migration"];
  const changes: NonNullable<Parameters<typeof fixture>[0]>["changeHistory"][] = [
    (rows) => rows.slice(1),
    (rows) => [rows[1], ...rows.slice(1)],
    (rows) => [{ ...rows[0], checksum: "0".repeat(64) }, ...rows.slice(1)],
    (rows) => [{ ...rows[0], applied: false }, ...rows.slice(1)],
    (rows) => [{ ...rows[0], rolled_back: true }, ...rows.slice(1)],
    (rows) => [{ ...rows[0], migration_name: "unexpected" }, ...rows.slice(1)],
    (rows) => [{ ...rows[0], migration_name: APPROVED_PENDING[0] }, ...rows.slice(1)],
  ];
  for (const changeHistory of changes) {
    const result = await fixture({ args, changeHistory });
    assert.equal(result.code, 1);
    assert.deepEqual(result.events, ["snapshot", "attest"]);
  }
});

const withHistoricalDiscrepancy = (rows: Attestation["rows"]) =>
  [{ ...rows[0], checksum: productionChecksum }, ...rows.slice(1)];

async function historicalArgs(...flags: string[]) {
  return ["--production", "--release", (await runner).RELEASE_SHA, ...flags];
}

test("accepts and reports the exact owner-approved exception after attestation in both modes", async () => {
  for (const flags of [["--verify"], ["--execute", "--authorize-production-migration"]]) {
    const result = await fixture({
      args: await historicalArgs(...flags, ownerApproval),
      changeIdentity: { parkSchema: approvedSchema },
      changeHistory: withHistoricalDiscrepancy,
    });
    assert.equal(result.code, 0);
    assert.deepEqual(result.events, flags[0] === "--verify" ? ["snapshot", "attest"] : ["snapshot", "attest", "deploy"]);
    assert.match(result.output[0], /Owner-approved exception used.*historical checksum discrepancy remains recorded/);
  }
});

test("requires the separate owner approval for the historical checksum", async () => {
  const result = await fixture({
    args: await historicalArgs("--execute", "--authorize-production-migration"),
    changeIdentity: { parkSchema: approvedSchema },
    changeHistory: withHistoricalDiscrepancy,
  });
  assert.equal(result.code, 1);
  assert.match(result.output[0], /requires explicit owner approval/);
  assert.deepEqual(result.events, ["snapshot", "attest"]);
});

test("historical approval cannot authorize execution or override the release pin or production identity", async () => {
  const verify = await historicalArgs("--verify", ownerApproval);
  for (const options of [
    { args: await historicalArgs("--execute", ownerApproval) },
    { args: verify.map((arg, i) => i === 2 ? "0".repeat(40) : arg) },
    { args: verify, changeEnv: {
      PRODUCTION_MIGRATION_EXPECTED_HOST: "ep-floral-violet-bb5i81e9.fixture.aws.neon.tech",
      PRODUCTION_MIGRATION_DATABASE_URL: env.PRODUCTION_MIGRATION_DATABASE_URL.replace(host, "ep-floral-violet-bb5i81e9.fixture.aws.neon.tech"),
    } },
  ]) {
    const result = await fixture({
      ...options, changeIdentity: { parkSchema: approvedSchema }, changeHistory: withHistoricalDiscrepancy,
    });
    assert.equal(result.code, 1);
    assert.deepEqual(result.events, []);
  }
});

test("blocks the exception if live Park attestation is missing or any property fails", async () => {
  const args = await historicalArgs("--execute", "--authorize-production-migration", ownerApproval);
  for (const parkSchema of [
    undefined,
    ...Object.keys(approvedSchema).map((check) => ({ ...approvedSchema, [check]: false })),
  ]) {
    const result = await fixture({ args, changeIdentity: { parkSchema }, changeHistory: withHistoricalDiscrepancy });
    assert.equal(result.code, 1);
    assert.match(result.output[0], /Live Park schema attestation failed/);
    assert.deepEqual(result.events, ["snapshot", "attest"]);
  }
});

test("does not exempt a different name, either wrong digest, a second mismatch, status, or pending set", async () => {
  const args = await historicalArgs("--execute", "--authorize-production-migration", ownerApproval);
  const base = { args, changeIdentity: { parkSchema: approvedSchema }, changeHistory: withHistoricalDiscrepancy };
  const changes: Parameters<typeof fixture>[0][] = [
    { changeHistory: (rows) => [{ ...rows[0], migration_name: "unexpected", checksum: productionChecksum }, ...rows.slice(1)] },
    { changeHistory: (rows) => [rows[0], { ...rows[1], checksum: productionChecksum }, ...rows.slice(2)] },
    { changeHistory: (rows) => [{ ...rows[0], checksum: "0".repeat(64) }, ...rows.slice(1)] },
    { changeRelease: (checksums) => { checksums.set(historicalName, "0".repeat(64)); } },
    { changeHistory: (rows) => [withHistoricalDiscrepancy(rows)[0], { ...rows[1], checksum: "0".repeat(64) }, ...rows.slice(2)] },
    { changeHistory: (rows) => [{ ...withHistoricalDiscrepancy(rows)[0], rolled_back: true }, ...rows.slice(1)] },
    { changeHistory: (rows) => [{ ...withHistoricalDiscrepancy(rows)[0], applied: false }, ...rows.slice(1)] },
    { changeRelease: (checksums) => { checksums.set("unexpected_pending", "1".repeat(64)); } },
  ];
  for (const change of changes) {
    const result = await fixture({ ...base, ...change });
    assert.equal(result.code, 1);
    assert.deepEqual(result.events, ["snapshot", "attest"]);
    assert.doesNotMatch(result.output.join("\n"), /Owner-approved exception used/);
  }
});
