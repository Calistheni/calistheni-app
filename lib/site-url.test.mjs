import assert from "node:assert/strict";
import test from "node:test";

import { getSiteUrl } from "./site-url.ts";

test("the existing Vercel production default stays pinned to calistheni.app", () => {
  assert.equal(getSiteUrl({ VERCEL_ENV: "production" }), "https://calistheni.app");
  assert.throws(
    () => getSiteUrl({ VERCEL_ENV: "production", AUTH_URL: "https://staging.example.test" }),
    /must resolve to https:\/\/calistheni\.app/
  );
});

test("an isolated staging Vercel project uses its explicit matching HTTPS origin", () => {
  assert.equal(
    getSiteUrl({
      VERCEL_ENV: "production",
      CALISTHENI_DEPLOYMENT_TARGET: "staging",
      AUTH_URL: "https://staging.example.test/auth/path",
      NEXT_PUBLIC_SITE_URL: "https://staging.example.test",
    }),
    "https://staging.example.test"
  );
});

test("staging fails closed for missing, mismatched, insecure, or production URLs", () => {
  const staging = { CALISTHENI_DEPLOYMENT_TARGET: "staging" };
  assert.throws(() => getSiteUrl(staging), /requires explicit/);
  assert.throws(
    () => getSiteUrl({ ...staging, AUTH_URL: "https://one.example.test", NEXT_PUBLIC_SITE_URL: "https://two.example.test" }),
    /same origin/
  );
  assert.throws(
    () => getSiteUrl({ ...staging, AUTH_URL: "http://staging.example.test", NEXT_PUBLIC_SITE_URL: "http://staging.example.test" }),
    /must use HTTPS/
  );
  assert.throws(
    () => getSiteUrl({ ...staging, AUTH_URL: "https://calistheni.app", NEXT_PUBLIC_SITE_URL: "https://calistheni.app" }),
    /must not use the Calistheni production origin/
  );
});

test("unknown deployment targets fail closed", () => {
  assert.throws(
    () => getSiteUrl({ CALISTHENI_DEPLOYMENT_TARGET: "preview" }),
    /must be production or staging/
  );
});
