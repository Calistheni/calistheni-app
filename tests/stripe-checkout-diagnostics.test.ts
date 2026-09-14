import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { getSafeStripeErrorDiagnostics } from "../lib/stripe-diagnostics.ts";

const root = new URL("../", import.meta.url);

test("checkout diagnostics expose Stripe metadata without error payloads", () => {
  const error = Object.assign(new Error("Sensitive provider detail"), {
    type: "StripeInvalidRequestError",
    code: "resource_missing",
    requestId: "req_safe",
    statusCode: 404,
    raw: { payment_method: "must-not-be-logged" },
  });

  assert.deepEqual(getSafeStripeErrorDiagnostics(error), {
    errorName: "Error",
    configurationError: undefined,
    stripeErrorType: "StripeInvalidRequestError",
    stripeErrorCode: "resource_missing",
    stripeRequestId: "req_safe",
    stripeHttpStatus: 404,
  });
});

test("configuration failures retain only their actionable safe message", () => {
  const error = new Error("STRIPE_MODE must be live.");
  error.name = "StripeConfigurationError";
  assert.deepEqual(
    getSafeStripeErrorDiagnostics(error),
    {
      errorName: "StripeConfigurationError",
      configurationError: "STRIPE_MODE must be live.",
      stripeErrorType: undefined,
      stripeErrorCode: undefined,
      stripeRequestId: undefined,
      stripeHttpStatus: undefined,
    }
  );
});

test("checkout route records safe stage diagnostics and keeps the public error generic", async () => {
  const route = await readFile(
    new URL("app/api/billing/checkout/route.ts", root),
    "utf8"
  );

  assert.match(route, /event: "request_received"/);
  assert.match(route, /stage = "price_validation"/);
  assert.match(route, /stage = "customer_resolution"/);
  assert.match(route, /stage = "checkout_session_creation"/);
  assert.match(route, /getSafeStripeErrorDiagnostics\(error\)/);
  assert.match(route, /hasStripeSecret/);
  assert.match(route, /hasPriceId/);
  assert.match(route, /hasStripeCustomerId/);
  assert.match(route, /code: "CHECKOUT_UNAVAILABLE"/);
  assert.doesNotMatch(route, /console\.(?:info|error)\([^)]*session\.url/);
});
