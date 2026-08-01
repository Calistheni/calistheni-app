export const THEME_COOKIE_NAME = "calistheni-theme";
export const THEME_STORAGE_KEY = "calistheni-theme";
export const THEME_VALUES = ["light", "dark", "system"] as const;

export type Theme = (typeof THEME_VALUES)[number];
export type ResolvedTheme = "light" | "dark";

export function parseTheme(value: unknown): Theme {
  return value === "light" || value === "dark" || value === "system" ? value : "system";
}
