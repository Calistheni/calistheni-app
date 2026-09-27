const DEFAULT_API_ORIGIN = "https://calistheni.app";

function resolveApiOrigin(value: string | undefined) {
  const candidate = value?.trim() || DEFAULT_API_ORIGIN;
  const url = new URL(candidate);

  if (url.protocol !== "https:" && url.hostname !== "localhost") {
    throw new Error(
      "NEXT_PUBLIC_CALISTHENI_API_ORIGIN must use HTTPS outside localhost."
    );
  }

  return url.origin;
}

/** Public endpoint configuration only. No credential or server secret belongs here. */
export const nativeClientConfig = {
  apiOrigin: resolveApiOrigin(
    process.env.NEXT_PUBLIC_CALISTHENI_API_ORIGIN
  ),
} as const;
