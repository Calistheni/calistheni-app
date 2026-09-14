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
