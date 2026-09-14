export function getSafeStripeErrorDiagnostics(error: unknown) {
  const candidate =
    typeof error === "object" && error !== null
      ? (error as Record<string, unknown>)
      : null;
  const errorName = error instanceof Error ? error.name : "UnknownError";

  return {
    errorName,
    configurationError:
      errorName === "StripeConfigurationError" && error instanceof Error
        ? error.message
        : undefined,
    stripeErrorType:
      typeof candidate?.type === "string" ? candidate.type : undefined,
    stripeErrorCode:
      typeof candidate?.code === "string" ? candidate.code : undefined,
    stripeRequestId:
      typeof candidate?.requestId === "string"
        ? candidate.requestId
        : undefined,
    stripeHttpStatus:
      typeof candidate?.statusCode === "number"
        ? candidate.statusCode
        : undefined,
  };
}

export type CheckoutFailureStage =
  | "subscription_lookup"
  | "stripe_config"
  | "price_retrieval"
  | "origin_resolution"
  | "customer_resolution"
  | "checkout_session_creation"
  | "checkout_url_validation";

export function getCheckoutFailureCode(
  stage: CheckoutFailureStage,
  error: unknown
) {
  if (stage === "stripe_config" || stage === "origin_resolution") {
    return "CHECKOUT_CONFIGURATION_ERROR" as const;
  }
  if (stage === "price_retrieval") {
    return "CHECKOUT_PRICE_INVALID" as const;
  }
  if (stage === "customer_resolution") {
    return "CHECKOUT_CUSTOMER_ERROR" as const;
  }
  if (
    stage === "checkout_session_creation" ||
    stage === "checkout_url_validation"
  ) {
    return "STRIPE_SESSION_CREATION_FAILED" as const;
  }

  const errorName = error instanceof Error ? error.name : null;
  return errorName === "StripeConfigurationError"
    ? ("CHECKOUT_CONFIGURATION_ERROR" as const)
    : ("CHECKOUT_UNAVAILABLE" as const);
}

export function getSafeStripeEnvironmentDiagnostics() {
  const secret = process.env.STRIPE_SECRET_KEY?.trim();
  const secretMode = /^(?:sk|rk)_(test|live)_/.exec(secret ?? "")?.[1];

  return {
    stripeMode: process.env.STRIPE_MODE?.trim() || "missing",
    stripeSecretMode:
      secretMode === "test" || secretMode === "live"
        ? secretMode
        : secret
          ? "unrecognized"
          : "missing",
  };
}
