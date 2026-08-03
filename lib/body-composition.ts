export function navyBodyFatPercent({ sex, heightCm, neckCm, waistCm, hipsCm }: { sex: "male" | "female"; heightCm: number; neckCm: number; waistCm: number; hipsCm?: number | null }) {
  if (heightCm <= 0 || neckCm <= 0 || waistCm <= neckCm || (sex === "female" && (!hipsCm || hipsCm <= 0))) return null;
  const value = sex === "male" ? 495 / (1.0324 - 0.19077 * Math.log10(waistCm - neckCm) + 0.15456 * Math.log10(heightCm)) - 450 : 495 / (1.29579 - 0.35004 * Math.log10(waistCm + (hipsCm ?? 0) - neckCm) + 0.221 * Math.log10(heightCm)) - 450;
  return Number.isFinite(value) ? Number(value.toFixed(1)) : null;
}
export function bodyComposition(weightKg: number, heightCm: number, bodyFatPercent: number | null, waistCm?: number | null, hipsCm?: number | null) {
  if (bodyFatPercent == null || weightKg <= 0 || heightCm <= 0) return null;
  const fatMassKg = weightKg * bodyFatPercent / 100; const leanBodyMassKg = weightKg - fatMassKg; const heightM = heightCm / 100;
  return { fatMassKg, leanBodyMassKg, ffmi: leanBodyMassKg / (heightM * heightM), waistHeightRatio: waistCm ? waistCm / heightCm : null, waistHipRatio: waistCm && hipsCm ? waistCm / hipsCm : null };
}
