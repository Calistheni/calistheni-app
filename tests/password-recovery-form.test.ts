import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { submitPasswordRecoveryRequest } from "../lib/auth/password-recovery-form.ts";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

test("successful forgot-password submission clears the captured form and preserves the enumeration-safe message", async () => {
  let resetCount = 0;
  const message = await submitPasswordRecoveryRequest({
    form: { reset: () => { resetCount += 1; } },
    isReset: false,
    body: { email: "staging-user@example.test" },
    fetcher: (async () => jsonResponse({
      message: "If an account exists, a password reset email is on its way.",
    })) as typeof fetch,
  });

  assert.equal(resetCount, 1);
  assert.equal(message, "If an account exists, a password reset email is on its way.");
});

test("forgot-password API failures surface their error and do not clear the form", async () => {
  let resetCount = 0;
  await assert.rejects(
    submitPasswordRecoveryRequest({
      form: { reset: () => { resetCount += 1; } },
      isReset: false,
      body: { email: "staging-user@example.test" },
      fetcher: (async () => jsonResponse({ error: "Unable to request a password reset." }, 503)) as typeof fetch,
    }),
    /Unable to request a password reset\./
  );
  assert.equal(resetCount, 0);
});

test("password recovery UI captures the form before awaiting and retains status and error output", async () => {
  const source = await readFile(
    new URL("../components/auth/PasswordRecoveryForm.tsx", import.meta.url),
    "utf8"
  );
  const captureIndex = source.indexOf("const form = event.currentTarget;");
  const awaitIndex = source.indexOf("await submitPasswordRecoveryRequest");

  assert.ok(captureIndex >= 0 && captureIndex < awaitIndex);
  assert.doesNotMatch(source, /event\.currentTarget\.reset\(\)/);
  assert.match(source, /setMessage\(await submitPasswordRecoveryRequest/);
  assert.match(source, /message \? <p role="status"/);
  assert.match(source, /setError\(cause instanceof Error \? cause\.message/);
});

test("connected-account password form also keeps its form reference across async work", async () => {
  const source = await readFile(
    new URL("../components/profile/ConnectedAccounts.tsx", import.meta.url),
    "utf8"
  );
  const handler = source.slice(
    source.indexOf("async function savePassword"),
    source.indexOf("if (!status) return")
  );

  assert.match(handler, /const form = event\.currentTarget;/);
  assert.match(handler, /const data = new FormData\(form\);/);
  assert.match(handler, /form\.reset\(\);/);
  assert.doesNotMatch(handler, /event\.currentTarget\.reset\(\)/);
});
