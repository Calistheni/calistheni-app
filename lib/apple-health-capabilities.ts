/** HealthKit scope mirrors real Calistheni fields, not every HealthKit category. */
export type AppleHealthDataType =
  | "workout"
  | "bodyMass"
  | "waistCircumference"
  | "dateOfBirth"
  | "height"
  | "bodyFatPercentage"
  | "biologicalSex";

export function getAppleHealthAuthorizationTypes(isPro: boolean) {
  return {
    write: ["workout", "bodyMass", "waistCircumference", ...(isPro ? ["bodyFatPercentage", "height"] : [])] as AppleHealthDataType[],
    read: [
      "bodyMass",
      "waistCircumference",
      "dateOfBirth",
      ...(isPro ? ["height", "bodyFatPercentage", "biologicalSex"] : []),
    ] as AppleHealthDataType[],
  };
}

export function bodyFatFractionToPercent(value: number) {
  return value * 100;
}

export function bodyFatPercentToFraction(value: number) {
  return value / 100;
}
