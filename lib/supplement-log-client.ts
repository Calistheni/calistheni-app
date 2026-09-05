export function createSupplementLogRequest(
  planId: string,
  scheduledDate: string,
  request: typeof fetch = fetch
) {
  return request(`/api/user/supplements/${planId}/logs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scheduledDate }),
  });
}

export async function readSupplementRequestError(
  response: Response,
  fallback: string
) {
  try {
    const body = (await response.json()) as { error?: unknown };
    return typeof body.error === "string" ? body.error : fallback;
  } catch {
    return fallback;
  }
}
