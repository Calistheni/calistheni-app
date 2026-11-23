type Environment = Record<string, string | undefined>;

export const PRODUCTION_VERCEL_PROJECT_ID = "prj_eWLVR9Q7U9zSJ0RQMy2e7fALBYf5";

const deployments = {
  production: {
    projectId: PRODUCTION_VERCEL_PROJECT_ID,
    hosts: ["calistheni.app", "calistheni-app.vercel.app"],
    endpoint: "ep-dark-dew-aizz21ag",
  },
  staging: {
    projectId: "prj_YtsOroWMJGSHWTxyJJzYkvnW5jf9",
    hosts: ["calistheni-staging.vercel.app"],
    endpoint: "ep-floral-violet-bb5i81e9",
  },
} as const;

type Target = keyof typeof deployments;

function systemTarget(environment: Environment): Target | undefined {
  const projectId = environment.VERCEL_PROJECT_ID;
  const systemHost = environment.VERCEL_PROJECT_PRODUCTION_URL;
  const byProject = (Object.keys(deployments) as Target[]).find(
    (target) => deployments[target].projectId === projectId
  );
  const byHost = (Object.keys(deployments) as Target[]).find(
    (target) => deployments[target].hosts.some((host) => host === systemHost)
  );
  if ((projectId && !byProject) || (byProject && byHost && byProject !== byHost)) {
    throw new Error("Calistheni Vercel project identity is invalid.");
  }
  return byProject ?? byHost;
}

export function resolveDeploymentIdentity(environment: Environment = process.env) {
  const marker = environment.CALISTHENI_DEPLOYMENT_TARGET?.trim();
  if (marker !== undefined && marker !== "production" && marker !== "staging") {
    throw new Error("Calistheni deployment target is invalid.");
  }
  const hosted = environment.VERCEL === "1" || Boolean(
    environment.VERCEL_ENV || environment.VERCEL_PROJECT_ID || environment.VERCEL_PROJECT_PRODUCTION_URL ||
    environment.VERCEL_TARGET_ENV || environment.VERCEL_URL || environment.VERCEL_DEPLOYMENT_ID
  );
  if (!hosted) {
    if (marker === "production") throw new Error("Production requires a verified Vercel identity.");
    return { target: marker ?? "local", hosted: false, stable: false } as const;
  }
  const target = systemTarget(environment);
  if (!target || (marker && marker !== target)) {
    throw new Error("Calistheni deployment identity is missing or conflicting.");
  }
  const scope = environment.VERCEL_ENV;
  const targetScope = environment.VERCEL_TARGET_ENV;
  if (
    (scope !== "production" && scope !== "preview" && scope !== "development") ||
    (targetScope && (scope === "production") !== (targetScope === "production"))
  ) throw new Error("Calistheni deployment scope is missing or conflicting.");
  const stable = scope === "production";
  if (target === "production" && stable && environment.VERCEL_GIT_COMMIT_REF &&
      environment.VERCEL_GIT_COMMIT_REF !== "main") {
    throw new Error("Calistheni production requires the main branch.");
  }
  return { target, hosted: true, stable } as const;
}

function isNeonEndpoint(host: string, endpoint: string) {
  return host.endsWith(".neon.tech") &&
    [endpoint, `${endpoint}-pooler`].includes(host.split(".")[0]);
}

export function validateDatabaseIdentity(databaseUrl: URL, environment: Environment = process.env) {
  if (!["postgresql:", "postgres:"].includes(databaseUrl.protocol)) {
    throw new Error("Invalid database protocol.");
  }
  if (!databaseUrl.hostname || databaseUrl.hostname.includes("%") || [...databaseUrl.searchParams.keys()].some((key) =>
    ["host", "hostaddr", "port", "dbname", "database", "options"].includes(key.toLowerCase())
  )) throw new Error("Database connection routing overrides are not supported.");
  const { target, hosted, stable } = resolveDeploymentIdentity(environment);
  const host = databaseUrl.hostname.toLowerCase().replace(/\.$/, "");
  if (hosted && databaseUrl.port && databaseUrl.port !== "5432") {
    throw new Error("Hosted database connections require the PostgreSQL port.");
  }
  if (target !== "local" && stable && isNeonEndpoint(host, deployments[target].endpoint) &&
      databaseUrl.pathname === "/neondb") return { hosted };
  if (target === "local" && !isNeonEndpoint(host, deployments.production.endpoint)) return { hosted };
  if (!hosted && target === "staging" && ["localhost", "127.0.0.1", "[::1]"].includes(host)) return { hosted };
  throw new Error("Database identity is not approved for this deployment.");
}
