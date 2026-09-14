export type StripeCustomerResolutionState =
  | "existing"
  | "created"
  | "recovered_missing"
  | "recovered_deleted"
  | "concurrent";

type StripeCustomerReference = { deleted?: boolean | void };

type ResolveStripeCustomerOptions = {
  existingCustomerId: string | null;
  retrieveCustomer: (customerId: string) => Promise<StripeCustomerReference>;
  createCustomer: () => Promise<string>;
  persistCustomer: (
    customerId: string,
    expectedCustomerId: string | null
  ) => Promise<boolean>;
  readPersistedCustomer: () => Promise<string | null>;
};

export function isMissingStripeCustomerError(error: unknown) {
  if (typeof error !== "object" || error === null) return false;
  const candidate = error as Record<string, unknown>;
  return (
    candidate.type === "StripeInvalidRequestError" &&
    candidate.code === "resource_missing"
  );
}

export async function resolveStripeCustomer({
  existingCustomerId,
  retrieveCustomer,
  createCustomer,
  persistCustomer,
  readPersistedCustomer,
}: ResolveStripeCustomerOptions): Promise<{
  customerId: string;
  state: StripeCustomerResolutionState;
}> {
  let recoveryState: "recovered_missing" | "recovered_deleted" | null = null;

  if (existingCustomerId) {
    try {
      const customer = await retrieveCustomer(existingCustomerId);
      if (customer.deleted !== true) {
        return { customerId: existingCustomerId, state: "existing" };
      }
      recoveryState = "recovered_deleted";
    } catch (error) {
      if (!isMissingStripeCustomerError(error)) throw error;
      recoveryState = "recovered_missing";
    }
  }

  const customerId = await createCustomer();
  const persisted = await persistCustomer(customerId, existingCustomerId);
  if (persisted) {
    return {
      customerId,
      state: recoveryState ?? "created",
    };
  }

  const concurrentCustomerId = await readPersistedCustomer();
  if (!concurrentCustomerId) {
    throw new Error("Unable to persist Stripe customer.");
  }

  return { customerId: concurrentCustomerId, state: "concurrent" };
}
