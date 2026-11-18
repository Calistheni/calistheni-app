import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("privacy policy distinguishes stored data, optional integrations, public data, and deletion caveats", async () => {
  const source = (await readFile(new URL("../app/privacy/page.tsx", import.meta.url), "utf8")).replace(/\s+/g, " ");
  for (const text of [
    "body measurements",
    "date of birth",
    "supplement logs",
    "Cloudflare R2",
    "photos attached to the public workout",
    "store: false",
    "OpenAI",
    "Mapbox",
    "precise photo/device coordinate",
    "embedded image metadata",
    "Apple Health",
    "Stripe",
    "Account deletion",
    "partner inquiry is not automatically erased",
    "Reporter identity is not shown to the reported user",
  ]) {
    assert.ok(source.toLowerCase().includes(text.toLowerCase()), `Missing privacy disclosure: ${text}`);
  }
});

test("terms explain public content, moderation controls, nutrition AI, renewal and restore", async () => {
  const source = (await readFile(new URL("../app/terms/page.tsx", import.meta.url), "utf8")).replace(/\s+/g, " ");
  for (const text of [
    "workout marked public",
    "report content or block users",
    "moderators",
    "nutrition image and description features use automated",
    "renew automatically",
    "Restore Purchases",
    "does not automatically cancel",
  ]) {
    assert.ok(source.includes(text), `Missing Terms provision: ${text}`);
  }
});
