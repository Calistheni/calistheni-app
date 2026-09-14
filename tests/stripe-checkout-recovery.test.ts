import assert from "node:assert/strict";
import test from "node:test";
import {
  isMissingStripeCustomerError,
  resolveStripeCustomer,
} from "../lib/stripe-customer-recovery.ts";

function missingCustomerError() {
  return {
    type: "StripeInvalidRequestError",
    code: "resource_missing",
    param: "id",
  };
}

test("an existing live Stripe customer is reused", async () => {
  let createCalls = 0;
  const result = await resolveStripeCustomer({
    existingCustomerId: "cus_existing",
    retrieveCustomer: async () => ({}),
    createCustomer: async () => {
      createCalls += 1;
      return "cus_new";
    },
    persistCustomer: async () => true,
    readPersistedCustomer: async () => null,
  });

  assert.deepEqual(result, {
    customerId: "cus_existing",
    state: "existing",
  });
  assert.equal(createCalls, 0);
});

test("a stale test customer ID is replaced for the active Stripe account", async () => {
  let persisted: { customerId: string; expected: string | null } | null = null;
  const result = await resolveStripeCustomer({
    existingCustomerId: "cus_from_test_mode",
    retrieveCustomer: async () => {
      throw missingCustomerError();
    },
    createCustomer: async () => "cus_live_replacement",
    persistCustomer: async (customerId, expected) => {
      persisted = { customerId, expected };
      return true;
    },
    readPersistedCustomer: async () => null,
  });

  assert.deepEqual(result, {
    customerId: "cus_live_replacement",
    state: "recovered_missing",
  });
  assert.deepEqual(persisted, {
    customerId: "cus_live_replacement",
    expected: "cus_from_test_mode",
  });
});

test("a deleted Stripe customer is recovered", async () => {
  const result = await resolveStripeCustomer({
    existingCustomerId: "cus_deleted",
    retrieveCustomer: async () => ({ deleted: true }),
    createCustomer: async () => "cus_replacement",
    persistCustomer: async () => true,
    readPersistedCustomer: async () => null,
  });

  assert.equal(result.state, "recovered_deleted");
  assert.equal(result.customerId, "cus_replacement");
});

test("non-missing Stripe errors do not trigger customer replacement", async () => {
  let createCalls = 0;
  await assert.rejects(
    resolveStripeCustomer({
      existingCustomerId: "cus_existing",
      retrieveCustomer: async () => {
        throw { type: "StripeAuthenticationError", code: "api_key_expired" };
      },
      createCustomer: async () => {
        createCalls += 1;
        return "cus_new";
      },
      persistCustomer: async () => true,
      readPersistedCustomer: async () => null,
    })
  );
  assert.equal(createCalls, 0);
});

test("customer persistence races reuse the winning stored customer", async () => {
  const result = await resolveStripeCustomer({
    existingCustomerId: null,
    retrieveCustomer: async () => ({}),
    createCustomer: async () => "cus_created",
    persistCustomer: async () => false,
    readPersistedCustomer: async () => "cus_concurrent",
  });

  assert.deepEqual(result, {
    customerId: "cus_concurrent",
    state: "concurrent",
  });
});

test("missing-customer detection is deliberately narrow", () => {
  assert.equal(isMissingStripeCustomerError(missingCustomerError()), true);
  assert.equal(
    isMissingStripeCustomerError({
      type: "StripeInvalidRequestError",
      code: "parameter_invalid_empty",
    }),
    false
  );
});
