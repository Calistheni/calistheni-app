export const NATIVE_APP_ORIGIN = "capacitor://localhost";

export function isAllowedNativeOrigin(origin: string | null) {
  return origin === NATIVE_APP_ORIGIN;
}
