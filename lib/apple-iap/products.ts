export const APPLE_BUNDLE_ID = "com.petershikrenov.calistheni";

export const APPLE_PRO_PRODUCT_IDS = {
  monthly: "com.petershikrenov.calistheni.pro.monthly",
  yearly: "com.petershikrenov.calistheni.pro.yearly",
  lifetime: "com.petershikrenov.calistheni.pro.lifetime",
} as const;

export type AppleProProductId =
  (typeof APPLE_PRO_PRODUCT_IDS)[keyof typeof APPLE_PRO_PRODUCT_IDS];

export type AppleProductKindValue = "SUBSCRIPTION" | "LIFETIME";
export type AppleProductIdConfiguration = {
  monthly: string;
  yearly: string;
  lifetime: string;
};

export function getAppleProductKind(
  productId: string,
  productIds: AppleProductIdConfiguration = APPLE_PRO_PRODUCT_IDS
): AppleProductKindValue | null {
  if (productId === productIds.monthly || productId === productIds.yearly) {
    return "SUBSCRIPTION";
  }
  if (productId === productIds.lifetime) return "LIFETIME";
  return null;
}

export function getAppleProductIdsList(
  productIds: AppleProductIdConfiguration = APPLE_PRO_PRODUCT_IDS
) {
  return [productIds.monthly, productIds.yearly, productIds.lifetime];
}
