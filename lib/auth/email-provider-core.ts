import { createHash } from "node:crypto";
import { classifyAuthEmailHttpStatus } from "@/lib/auth/email-outbox-policy";

const RESEND_EMAIL_ENDPOINT = "https://api.resend.com/emails";
const SMTP_PORTS = new Set([465, 587, 2525]);

type AuthEmailEnvironment = Record<string, string | undefined>;

export type AuthEmailMessage = {
  to: string;
  subject: string;
  text: string;
  html: string;
  idempotencyKey: string;
};

export type AuthSmtpTransportOptions = {
  host: string;
  port: number;
  user: string;
  password: string;
  ssl: false | { rejectUnauthorized: true; servername: string };
  tls: false | { rejectUnauthorized: true; servername: string };
  timeout: number;
  authentication: ["PLAIN", "LOGIN"];
  logger: (...args: unknown[]) => void;
};

type AuthSmtpTransport = {
  sendMail(message: {
    from: string;
    to: string;
    subject: string;
    text: string;
    html: string;
    messageId: string;
  }): Promise<unknown>;
};

export type AuthSmtpTransportFactory = (
  options: AuthSmtpTransportOptions
) => AuthSmtpTransport;

type AuthEmailDependencies = {
  fetch: typeof fetch;
  createSmtpTransport: AuthSmtpTransportFactory;
};

export class AuthEmailProviderError extends Error {
  readonly retryable: boolean;
  readonly category: string;

  constructor(retryable: boolean, category: string) {
    super("Authentication email delivery failed.");
    this.name = "AuthEmailProviderError";
    this.retryable = retryable;
    this.category = category;
  }
}

function configurationError() {
  const error = new AuthEmailProviderError(true, "PROVIDER_CONFIGURATION");
  error.name = "AuthEmailConfigurationError";
  return error;
}

function required(environment: AuthEmailEnvironment, name: string) {
  const value = environment[name]?.trim();
  if (!value) throw configurationError();
  return value;
}

function provider(environment: AuthEmailEnvironment) {
  const selected = environment.AUTH_EMAIL_PROVIDER?.trim() || "resend";
  if (selected !== "resend" && selected !== "brevo") {
    throw configurationError();
  }
  return selected;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    };
    return entities[character]!;
  });
}

function actionUrl(path: string, token: string, siteUrl: string) {
  const url = new URL(path, siteUrl);
  url.searchParams.set("token", token);
  return url.toString();
}

function idempotencyKey(prefix: string, token: string) {
  return `${prefix}-${createHash("sha256").update(token).digest("hex")}`;
}

function message({
  to,
  subject,
  text,
  actionUrl: url,
  actionLabel,
  idempotencyKey: key,
}: {
  to: string;
  subject: string;
  text: string;
  actionUrl: string;
  actionLabel: string;
  idempotencyKey: string;
}): AuthEmailMessage {
  const safeUrl = escapeHtml(url);
  return {
    to,
    subject,
    text: `${text}\n\n${url}\n\nIf you did not request this, you can ignore this email.`,
    html: `<p>${escapeHtml(text)}</p><p><a href="${safeUrl}">${escapeHtml(actionLabel)}</a></p><p>If you did not request this, you can ignore this email.</p>`,
    idempotencyKey: key,
  };
}

export function verificationEmailMessage(
  email: string,
  token: string,
  siteUrl: string
) {
  return message({
    to: email,
    subject: "Verify your Calistheni email",
    text: "Verify your email address to finish creating your Calistheni account.",
    actionUrl: actionUrl("/verify-email", token, siteUrl),
    actionLabel: "Verify email",
    idempotencyKey: idempotencyKey("verify", token),
  });
}

export function passwordResetEmailMessage(
  email: string,
  token: string,
  siteUrl: string
) {
  return message({
    to: email,
    subject: "Reset your Calistheni password",
    text: "Use this link within one hour to choose a new Calistheni password.",
    actionUrl: actionUrl("/reset-password", token, siteUrl),
    actionLabel: "Reset password",
    idempotencyKey: idempotencyKey("reset", token),
  });
}

async function sendWithResend(
  authMessage: AuthEmailMessage,
  environment: AuthEmailEnvironment,
  fetchImplementation: typeof fetch
) {
  const apiKey = required(environment, "RESEND_API_KEY");
  const from = required(environment, "AUTH_EMAIL_FROM");
  const response = await fetchImplementation(RESEND_EMAIL_ENDPOINT, {
    method: "POST",
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": authMessage.idempotencyKey,
      "User-Agent": "calistheni-auth/1.0",
    },
    body: JSON.stringify({
      from,
      to: [authMessage.to],
      subject: authMessage.subject,
      text: authMessage.text,
      html: authMessage.html,
    }),
  });
  if (!response.ok) {
    const classification = classifyAuthEmailHttpStatus(response.status);
    throw new AuthEmailProviderError(
      classification.retryable,
      classification.category
    );
  }
}

function smtpConfiguration(environment: AuthEmailEnvironment) {
  const host = required(environment, "BREVO_SMTP_HOST");
  const portValue = required(environment, "BREVO_SMTP_PORT");
  const port = Number(portValue);
  if (!Number.isInteger(port) || !SMTP_PORTS.has(port)) {
    throw configurationError();
  }
  return {
    from: required(environment, "AUTH_EMAIL_FROM"),
    options: {
      host,
      port,
      user: required(environment, "BREVO_SMTP_USERNAME"),
      password: required(environment, "BREVO_SMTP_PASSWORD"),
      ssl:
        port === 465
          ? { rejectUnauthorized: true as const, servername: host }
          : false as const,
      tls:
        port === 465
          ? false as const
          : { rejectUnauthorized: true as const, servername: host },
      timeout: 10_000,
      authentication: ["PLAIN", "LOGIN"] as ["PLAIN", "LOGIN"],
      logger: () => {},
    },
  };
}

function smtpError(error: unknown) {
  const candidate = error as {
    code?: unknown;
    responseCode?: unknown;
    smtp?: unknown;
  } | null;
  const code = candidate?.code;
  const responseCode =
    typeof candidate?.responseCode === "number"
      ? candidate.responseCode
      : typeof candidate?.smtp === "string"
        ? Number(candidate.smtp.match(/^(\d{3})/m)?.[1]) || null
        : null;
  if (
    code === "EAUTH" ||
    code === 3 ||
    code === 7 ||
    code === 10 ||
    [530, 534, 535, 538].includes(responseCode ?? 0)
  ) {
    return new AuthEmailProviderError(true, "PROVIDER_CONFIGURATION");
  }
  if (responseCode !== null && responseCode >= 500) {
    return new AuthEmailProviderError(false, "PROVIDER_PERMANENT");
  }
  if (responseCode !== null && responseCode >= 400) {
    return new AuthEmailProviderError(true, "PROVIDER_TRANSIENT");
  }
  return new AuthEmailProviderError(true, "NETWORK");
}

async function sendWithBrevo(
  authMessage: AuthEmailMessage,
  environment: AuthEmailEnvironment,
  createSmtpTransport: AuthSmtpTransportFactory
) {
  const { from, options } = smtpConfiguration(environment);
  try {
    const transport = createSmtpTransport(options);
    await transport.sendMail({
      from,
      to: authMessage.to,
      subject: authMessage.subject,
      text: authMessage.text,
      html: authMessage.html,
      messageId: `<${authMessage.idempotencyKey}@auth.calistheni.app>`,
    });
  } catch (error) {
    throw smtpError(error);
  }
}

export function sendAuthEmailMessage(
  authMessage: AuthEmailMessage,
  environment: AuthEmailEnvironment,
  dependencies: AuthEmailDependencies
) {
  const selected = provider(environment);
  if (selected === "brevo") {
    return sendWithBrevo(
      authMessage,
      environment,
      dependencies.createSmtpTransport
    );
  }
  return sendWithResend(authMessage, environment, dependencies.fetch);
}
