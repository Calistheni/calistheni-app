export function getSiteUrl() {
  const productionUrl = "https://calistheni.app";

  if (process.env.VERCEL_ENV === "production") {
    for (const [name, value] of [
      ["NEXT_PUBLIC_SITE_URL", process.env.NEXT_PUBLIC_SITE_URL],
      ["AUTH_URL", process.env.AUTH_URL],
    ] as const) {
      if (value && new URL(value).origin !== productionUrl) {
        throw new Error(
          `${name} must resolve to ${productionUrl} in Vercel Production.`
        );
      }
    }

    return productionUrl;
  }

  const configuredUrl =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.AUTH_URL ||
    process.env.VERCEL_PROJECT_PRODUCTION_URL ||
    process.env.VERCEL_URL;

  if (!configuredUrl) {
    return productionUrl;
  }

  return configuredUrl.startsWith("http")
    ? configuredUrl
    : `https://${configuredUrl}`;
}
