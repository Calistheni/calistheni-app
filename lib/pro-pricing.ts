export const PRO_PRICE_EUR_CENTS = {
  monthly: 799,
  yearly: 5_999,
  lifetime: 11_999,
} as const;

export const PRO_PRICE_LABELS = {
  monthly: "€7.99",
  yearly: "€59.99",
  lifetime: "€119.99",
} as const;

export const PRO_YEARLY_SAVINGS_EUR_CENTS =
  PRO_PRICE_EUR_CENTS.monthly * 12 - PRO_PRICE_EUR_CENTS.yearly;

export const PRO_YEARLY_SAVINGS_PERCENT = Math.round(
  (PRO_YEARLY_SAVINGS_EUR_CENTS /
    (PRO_PRICE_EUR_CENTS.monthly * 12)) *
    100
);

export function euroCentsToNumber(cents: number) {
  return cents / 100;
}
