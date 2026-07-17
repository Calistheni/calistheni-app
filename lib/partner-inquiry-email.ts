import "server-only";

import { z } from "zod";
import {
  buildPartnerInquiryEmailContent,
  type PartnerInquiryEmailContentInput,
} from "@/lib/partner-inquiry-email-content";

const RESEND_EMAIL_ENDPOINT = "https://api.resend.com/emails";
const DEFAULT_TO_EMAIL = "hello@calistheni.app";
const DELIVERY_TIMEOUT_MS = 10_000;
const MAX_DELIVERY_ATTEMPTS = 2;

const emailAddressSchema = z.string().trim().email();

type EmailConfiguration = {
  apiKey: string;
  from: string;
  to: string;
};

type ResendResponse = {
  id?: unknown;
  name?: unknown;
  message?: unknown;
};

export class PartnerInquiryEmailConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PartnerInquiryEmailConfigurationError";
  }
}

export class PartnerInquiryEmailDeliveryError extends Error {
  status: number | null;
  providerCode: string | null;
  providerMessage: string | null;
  retryable: boolean;

  constructor({
    message,
    status = null,
    providerCode = null,
    providerMessage = null,
    retryable = false,
  }: {
    message: string;
    status?: number | null;
    providerCode?: string | null;
    providerMessage?: string | null;
    retryable?: boolean;
  }) {
    super(message);
    this.name = "PartnerInquiryEmailDeliveryError";
    this.status = status;
    this.providerCode = providerCode;
    this.providerMessage = providerMessage;
    this.retryable = retryable;
  }
}

function sanitizeProviderMessage(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  return value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .slice(0, 300);
}

function extractSenderAddress(from: string) {
  const namedAddress = from.match(/<([^<>]+)>\s*$/)?.[1];
  return namedAddress ?? from;
}

export function getPartnerInquiryEmailConfiguration(): EmailConfiguration {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.PARTNER_INQUIRY_FROM_EMAIL?.trim();
  const to =
    process.env.PARTNER_INQUIRY_TO_EMAIL?.trim() || DEFAULT_TO_EMAIL;

  if (!apiKey) {
    throw new PartnerInquiryEmailConfigurationError(
      "RESEND_API_KEY is not configured."
    );
  }
  if (!from) {
    throw new PartnerInquiryEmailConfigurationError(
      "PARTNER_INQUIRY_FROM_EMAIL is not configured."
    );
  }
  if (/[\r\n]/.test(from) || !emailAddressSchema.safeParse(extractSenderAddress(from)).success) {
    throw new PartnerInquiryEmailConfigurationError(
      "PARTNER_INQUIRY_FROM_EMAIL is invalid."
    );
  }
  if (!emailAddressSchema.safeParse(to).success) {
    throw new PartnerInquiryEmailConfigurationError(
      "PARTNER_INQUIRY_TO_EMAIL is invalid."
    );
  }

  return { apiKey, from, to };
}

async function parseResendResponse(response: Response): Promise<ResendResponse> {
  try {
    return (await response.json()) as ResendResponse;
  } catch {
    return {};
  }
}

async function sendOnce({
  configuration,
  content,
  replyTo,
  idempotencyKey,
}: {
  configuration: EmailConfiguration;
  content: ReturnType<typeof buildPartnerInquiryEmailContent>;
  replyTo: string;
  idempotencyKey: string;
}) {
  let response: Response;

  try {
    response = await fetch(RESEND_EMAIL_ENDPOINT, {
      method: "POST",
      cache: "no-store",
      signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
      headers: {
        Authorization: `Bearer ${configuration.apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
        "User-Agent": "calistheni-partner-inquiries/1.0",
      },
      body: JSON.stringify({
        from: configuration.from,
        to: [configuration.to],
        reply_to: replyTo,
        subject: content.subject,
        html: content.html,
        text: content.text,
      }),
    });
  } catch (error) {
    throw new PartnerInquiryEmailDeliveryError({
      message:
        error instanceof Error ? error.message : "Resend request failed.",
      retryable: true,
    });
  }

  const responseBody = await parseResendResponse(response);
  if (!response.ok || typeof responseBody.id !== "string") {
    throw new PartnerInquiryEmailDeliveryError({
      message: "Resend did not accept the partner inquiry email.",
      status: response.status,
      providerCode:
        typeof responseBody.name === "string" ? responseBody.name : null,
      providerMessage: sanitizeProviderMessage(responseBody.message),
      retryable: response.status === 429 || response.status >= 500,
    });
  }

  return { id: responseBody.id };
}

export async function sendPartnerInquiryEmail({
  configuration,
  inquiry,
  idempotencyKey,
}: {
  configuration: EmailConfiguration;
  inquiry: PartnerInquiryEmailContentInput;
  idempotencyKey: string;
}) {
  const content = buildPartnerInquiryEmailContent(inquiry);
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_DELIVERY_ATTEMPTS; attempt += 1) {
    try {
      return await sendOnce({
        configuration,
        content,
        replyTo: inquiry.email,
        idempotencyKey,
      });
    } catch (error) {
      lastError = error;
      if (
        !(error instanceof PartnerInquiryEmailDeliveryError) ||
        !error.retryable ||
        attempt === MAX_DELIVERY_ATTEMPTS
      ) {
        throw error;
      }
    }
  }

  throw lastError;
}
