export async function waitForMinimumAuthResponse(
  startedAt: number,
  minimumDurationMs = 300
) {
  const remaining = minimumDurationMs - (Date.now() - startedAt);
  if (remaining > 0) {
    await new Promise<void>((resolve) => setTimeout(resolve, remaining));
  }
}
