export class ProviderError extends Error {
  constructor(
    public readonly code:
      | "UNAVAILABLE"
      | "TIMEOUT"
      | "RATE_LIMITED"
      | "NOT_FOUND"
      | "INVALID_IDENTIFIER"
      | "INCOMPLETE_DATA"
      | "INVALID_RESPONSE",
    message: string,
    public readonly httpStatus?: number,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}
export async function providerFetch(url: string, init: RequestInit, timeoutMs = 6000) {
  const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try { const response = await fetch(url, { ...init, signal: controller.signal, cache: "no-store" }); if (response.status === 429) throw new ProviderError("RATE_LIMITED", "Provider rate limit reached.", response.status); if (response.status === 404) throw new ProviderError("NOT_FOUND", "Provider food not found.", response.status); if (!response.ok) throw new ProviderError("UNAVAILABLE", `Provider returned ${response.status}.`, response.status); return response; }
  catch (error) { if (error instanceof ProviderError) throw error; if (error instanceof DOMException && error.name === "AbortError") throw new ProviderError("TIMEOUT", "Provider request timed out."); throw new ProviderError("UNAVAILABLE", "Provider request failed."); }
  finally { clearTimeout(timeout); }
}
