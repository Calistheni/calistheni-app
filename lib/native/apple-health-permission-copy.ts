export type AppleHealthAuthorizationStatus =
  | "unavailable"
  | "shouldRequest"
  | "unnecessary"
  | "unknown";

export function appleHealthAuthorizationCopy(
  status: AppleHealthAuthorizationStatus
) {
  if (status === "unnecessary") {
    return "iOS reports an Apple Health authorization request was already made on this device. iOS does not reveal whether read access was allowed; unavailable data will appear empty.";
  }
  if (status === "shouldRequest") {
    return "Connect to request workout export plus the body measurements available on your plan.";
  }
  return "Apple Health permission status is managed by iOS.";
}
