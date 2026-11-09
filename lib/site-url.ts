type SiteUrlEnvironment = Record<string, string | undefined>;

const PRODUCTION_URL = "https://calistheni.app";

function origin(value: string) {
  return new URL(value.startsWith("http") ? value : `https://${value}`).origin;
}

export function getSiteUrl(environment: SiteUrlEnvironment = process.env) {
  const deploymentTarget = environment.CALISTHENI_DEPLOYMENT_TARGET?.trim();

  if (
    deploymentTarget &&
    deploymentTarget !== "production" &&
    deploymentTarget !== "staging"
  ) {
    throw new Error(
      "CALISTHENI_DEPLOYMENT_TARGET must be production or staging."
    );
  }

  if (deploymentTarget === "staging") {
    const publicUrl = environment.NEXT_PUBLIC_SITE_URL?.trim();
    const authUrl = environment.AUTH_URL?.trim();
    if (!publicUrl || !authUrl) {
      throw new Error(
        "Staging requires explicit NEXT_PUBLIC_SITE_URL and AUTH_URL values."
      );
    }
    const publicOrigin = origin(publicUrl);
    const authOrigin = origin(authUrl);
    if (publicOrigin !== authOrigin) {
      throw new Error(
        "Staging NEXT_PUBLIC_SITE_URL and AUTH_URL must have the same origin."
      );
    }
    if (publicOrigin === PRODUCTION_URL) {
      throw new Error("Staging must not use the Calistheni production origin.");
    }
    if (!publicOrigin.startsWith("https://")) {
      throw new Error("Staging URLs must use HTTPS.");
    }
    return publicOrigin;
  }

  if (
    deploymentTarget === "production" ||
    environment.VERCEL_ENV === "production"
  ) {
    for (const [name, value] of [
      ["NEXT_PUBLIC_SITE_URL", environment.NEXT_PUBLIC_SITE_URL],
      ["AUTH_URL", environment.AUTH_URL],
    ] as const) {
      if (value && origin(value) !== PRODUCTION_URL) {
        throw new Error(
          `${name} must resolve to ${PRODUCTION_URL} in Vercel Production.`
        );
      }
    }

    return PRODUCTION_URL;
  }

  const configuredUrl =
    environment.NEXT_PUBLIC_SITE_URL ||
    environment.AUTH_URL ||
    environment.VERCEL_PROJECT_PRODUCTION_URL ||
    environment.VERCEL_URL;

  if (!configuredUrl) {
    return PRODUCTION_URL;
  }

  return configuredUrl.startsWith("http")
    ? configuredUrl
    : `https://${configuredUrl}`;
}
