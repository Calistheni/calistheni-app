import "server-only";

import { getSiteUrl } from "@/lib/site-url";
import { hashAuthSecret } from "@/lib/auth/security";
import { classifyAuthEmailHttpStatus } from "@/lib/auth/email-outbox-policy";

const RESEND_EMAIL_ENDPOINT = "https://api.resend.com/emails";

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

function configuration() {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.AUTH_EMAIL_FROM?.trim();
  if (!apiKey || !from) {
    const error = new AuthEmailProviderError(true, "PROVIDER_CONFIGURATION");
    error.name = "AuthEmailConfigurationError";
    throw error;
  }
  return { apiKey, from };
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

async function sendAuthEmail({
  to,
  subject,
  text,
  actionUrl,
  actionLabel,
  idempotencyKey,
}: {
  to: string;
  subject: string;
  text: string;
  actionUrl: string;
  actionLabel: string;
  idempotencyKey: string;
}) {
  const { apiKey, from } = configuration();
  const safeUrl = escapeHtml(actionUrl);
  const response = await fetch(RESEND_EMAIL_ENDPOINT, {
    method: "POST",
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey,
      "User-Agent": "calistheni-auth/1.0",
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject,
      text: `${text}\n\n${actionUrl}\n\nIf you did not request this, you can ignore this email.`,
      html: `<p>${escapeHtml(text)}</p><p><a href="${safeUrl}">${escapeHtml(actionLabel)}</a></p><p>If you did not request this, you can ignore this email.</p>`,
    }),
  });
  if (!response.ok) {
    const classification = classifyAuthEmailHttpStatus(response.status);
    throw new AuthEmailProviderError(classification.retryable, classification.category);
  }
}

export function sendVerificationEmail(email: string, token: string) {
  const url = new URL("/verify-email", getSiteUrl());
  url.searchParams.set("token", token);
  return sendAuthEmail({
    to: email,
    subject: "Verify your Calistheni email",
    text: "Verify your email address to finish creating your Calistheni account.",
    actionUrl: url.toString(),
    actionLabel: "Verify email",
    idempotencyKey: `verify-${hashAuthSecret(token)}`,
  });
}

export function sendPasswordResetEmail(email: string, token: string) {
  const url = new URL("/reset-password", getSiteUrl());
  url.searchParams.set("token", token);
  return sendAuthEmail({
    to: email,
    subject: "Reset your Calistheni password",
    text: "Use this link within one hour to choose a new Calistheni password.",
    actionUrl: url.toString(),
    actionLabel: "Reset password",
    idempotencyKey: `reset-${hashAuthSecret(token)}`,
  });
}
