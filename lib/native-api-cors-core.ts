export const NATIVE_APP_ORIGIN = "capacitor://localhost";

export function isAllowedNativeOrigin(origin: string | null) {
  return origin === NATIVE_APP_ORIGIN;
}

export function isAllowedAuthenticatedApiRequest({
  requestUrl,
  origin,
  fetchSite,
}: {
  requestUrl: string;
  origin: string | null;
  fetchSite: string | null;
}) {
  if (isAllowedNativeOrigin(origin)) return true;
  if (origin) return origin === new URL(requestUrl).origin;
  return fetchSite !== "cross-site";
}
