import assert from "node:assert/strict";
import test from "node:test";
import { resolveDeploymentIdentity, validateDatabaseIdentity } from "../lib/deployment-identity.ts";
import { getStripeModeFromEnvironment, getStripeSecretFromEnvironment } from "../lib/stripe-config.ts";

const staging = { VERCEL_ENV: "production", VERCEL_PROJECT_ID: "prj_YtsOroWMJGSHWTxyJJzYkvnW5jf9", CALISTHENI_DEPLOYMENT_TARGET: "staging" };
const production = { VERCEL_ENV: "production", VERCEL_PROJECT_PRODUCTION_URL: "calistheni.app" };
const preview = { ...production, VERCEL_ENV: "preview" };
const stagingDatabase = new URL("postgresql://ep-floral-violet-bb5i81e9-pooler.eu-central-1.aws.neon.tech/neondb");
const productionDatabase = new URL("postgresql://ep-dark-dew-aizz21ag.us-east-1.aws.neon.tech/neondb");

test("database identity distinguishes deployment project, scope, endpoint and database", () => {
  assert.doesNotThrow(() => validateDatabaseIdentity(stagingDatabase, staging));
  assert.doesNotThrow(() => validateDatabaseIdentity(productionDatabase, production));
  assert.throws(() => validateDatabaseIdentity(productionDatabase, staging));
  assert.throws(() => validateDatabaseIdentity(stagingDatabase, production));
  assert.throws(() => validateDatabaseIdentity(productionDatabase, preview));
  assert.throws(() => validateDatabaseIdentity(productionDatabase, {}));
  assert.throws(() => validateDatabaseIdentity(new URL("postgresql://EP-DARK-DEW-AIZZ21AG.US-EAST-1.AWS.NEON.TECH./neondb"), {}));
  assert.throws(() => validateDatabaseIdentity(new URL("/other", stagingDatabase), staging));
  assert.throws(() => validateDatabaseIdentity(new URL("?host=another.invalid", stagingDatabase), staging));
  assert.throws(() => validateDatabaseIdentity(new URL("?options=endpoint%3Dother", stagingDatabase), staging));
  assert.throws(() => validateDatabaseIdentity(new URL("postgresql://ep-floral-violet-bb5i81e9.example.test/neondb"), staging));
  assert.throws(() => validateDatabaseIdentity(new URL("postgresql://ep-floral-violet-bb5i81e9.eu-central-1.aws.neon.tech:9876/neondb"), staging));
  assert.doesNotThrow(() => validateDatabaseIdentity(new URL("postgresql://127.0.0.1/test"), {}));
  assert.doesNotThrow(() => validateDatabaseIdentity(new URL("postgresql://127.0.0.1:55483/test"), { CALISTHENI_DEPLOYMENT_TARGET: "staging" }));
});

test("missing and conflicting hosted identities fail closed", () => {
  assert.throws(() => resolveDeploymentIdentity({ VERCEL_ENV: "production" }));
  assert.throws(() => resolveDeploymentIdentity({ VERCEL_PROJECT_ID: staging.VERCEL_PROJECT_ID }));
  assert.throws(() => resolveDeploymentIdentity({ ...staging, CALISTHENI_DEPLOYMENT_TARGET: "production" }));
  assert.throws(() => resolveDeploymentIdentity({ ...staging, VERCEL_PROJECT_PRODUCTION_URL: "calistheni.app" }));
  assert.throws(() => resolveDeploymentIdentity({ ...production, VERCEL_PROJECT_ID: "unknown" }));
  assert.throws(() => resolveDeploymentIdentity({ ...production, VERCEL_GIT_COMMIT_REF: "feature" }));
  assert.throws(() => validateDatabaseIdentity(productionDatabase, { ...production, VERCEL_TARGET_ENV: "preview" }));
  assert.doesNotThrow(() => resolveDeploymentIdentity({ ...production, VERCEL_GIT_COMMIT_REF: "main" }));
});

test("Stripe live mode is exclusive to the verified stable production project", () => {
  for (const environment of [staging, preview, {}, { NODE_ENV: "test" }, { NODE_ENV: "development" }]) {
    assert.equal(getStripeModeFromEnvironment({ ...environment, STRIPE_MODE: "test" }), "test");
    assert.throws(() => getStripeModeFromEnvironment({ ...environment, STRIPE_MODE: "live" }));
  }
  assert.equal(getStripeModeFromEnvironment({ ...production, STRIPE_MODE: "live" }), "live");
  assert.equal(getStripeSecretFromEnvironment({ ...production, STRIPE_SECRET_KEY: "rk_live_example" }, "live"), "rk_live_example");
  assert.throws(() => getStripeModeFromEnvironment({ ...production, STRIPE_MODE: "test" }));
  assert.throws(() => getStripeModeFromEnvironment(staging));
  assert.throws(() => getStripeSecretFromEnvironment(staging, "test"));
  assert.throws(() => getStripeSecretFromEnvironment({ ...staging, STRIPE_SECRET_KEY: "rk_live_example" }, "test"));
  assert.equal(getStripeSecretFromEnvironment({ ...staging, STRIPE_SECRET_KEY: "rk_test_example" }, "test"), "rk_test_example");
});
