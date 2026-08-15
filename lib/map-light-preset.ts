export type MapLightPreset = "dawn" | "day" | "dusk" | "night";

export function getInitialLightPreset(): MapLightPreset {
  const hour = new Date().getHours();
  if (hour >= 6 && hour < 9) return "dawn";
  if (hour >= 9 && hour < 18) return "day";
  if (hour >= 18 && hour < 21) return "dusk";
  return "night";
}
