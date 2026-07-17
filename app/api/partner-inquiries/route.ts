import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import {
  createJsonErrorResponse,
  createJsonValidationErrorResponse,
} from "@/lib/api-response";
import {
  getPartnerInquiryEmailConfiguration,
  PartnerInquiryEmailConfigurationError,
  PartnerInquiryEmailDeliveryError,
  sendPartnerInquiryEmail,
} from "@/lib/partner-inquiry-email";
import { partnerInquirySchema } from "@/lib/partner-inquiries";
import { prisma } from "@/lib/prisma";

const MAX_REQUEST_BYTES = 20_000;
const MINIMUM_FORM_TIME_MS = 2_000;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 3;

type RateLimitState = {
  count: number;
  resetAt: number;
};

const globalForPartnerInquiries = globalThis as typeof globalThis & {
  partnerInquiryRateLimits?: Map<string, RateLimitState>;
};

const partnerInquiryRateLimits =
  globalForPartnerInquiries.partnerInquiryRateLimits ??
  new Map<string, RateLimitState>();

if (!globalForPartnerInquiries.partnerInquiryRateLimits) {
  globalForPartnerInquiries.partnerInquiryRateLimits =
    partnerInquiryRateLimits;
}

function getRateLimitKey(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for");
  const realIp = request.headers.get("x-real-ip");
  const userAgent = request.headers.get("user-agent") ?? "unknown-user-agent";
  const ip =
    forwardedFor?.split(",")[0]?.trim() || realIp?.trim() || "unknown-ip";

  return createHash("sha256").update(`${ip}:${userAgent}`).digest("hex");
}

function consumeRateLimit(request: Request) {
  const now = Date.now();
  const key = getRateLimitKey(request);
  const current = partnerInquiryRateLimits.get(key);

  if (!current || current.resetAt <= now) {
    partnerInquiryRateLimits.set(key, {
      count: 1,
      resetAt: now + RATE_LIMIT_WINDOW_MS,
    });
    return null;
  }

  if (current.count >= RATE_LIMIT_MAX_REQUESTS) {
    return Math.max(1, Math.ceil((current.resetAt - now) / 1000));
  }

  partnerInquiryRateLimits.set(key, {
    ...current,
    count: current.count + 1,
  });
  return null;
}

function getEmailIdempotencyKey(data: {
  businessName: string;
  contactName: string;
  email: string;
  website: string;
  proposedReward: string;
  startedAt: number;
  notificationFrom: string;
  notificationTo: string;
}) {
  const fingerprint = createHash("sha256")
    .update(
      JSON.stringify([
        "partner-inquiry-notification-v2",
        data.businessName,
        data.contactName,
        data.email,
        data.website,
        data.proposedReward,
        data.startedAt,
        data.notificationFrom,
        data.notificationTo,
      ])
    )
    .digest("hex")
    .slice(0, 40);

  return `partner-inquiry-${fingerprint}`;
}

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length") ?? "0");

  if (contentLength > MAX_REQUEST_BYTES) {
    return createJsonErrorResponse("Submission is too large.", 413);
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return createJsonErrorResponse("Invalid JSON payload.", 400);
  }

  const parsed = partnerInquirySchema.safeParse(body);

  if (!parsed.success) {
    return createJsonValidationErrorResponse(
      "Check the highlighted fields and try again.",
      parsed.error.flatten().fieldErrors
    );
  }

  if (Date.now() - parsed.data.startedAt < MINIMUM_FORM_TIME_MS) {
    return createJsonErrorResponse(
      "Please take a moment to review the form before submitting.",
      400
    );
  }

  const retryAfterSeconds = consumeRateLimit(request);

  if (retryAfterSeconds !== null) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      {
        status: 429,
        headers: { "Retry-After": String(retryAfterSeconds) },
      }
    );
  }

  let emailConfiguration: ReturnType<
    typeof getPartnerInquiryEmailConfiguration
  >;

  try {
    emailConfiguration = getPartnerInquiryEmailConfiguration();
  } catch (error) {
    console.error("Partner inquiry email is not configured.", {
      reason:
        error instanceof PartnerInquiryEmailConfigurationError
          ? error.message
          : "Unknown configuration error",
    });
    return createJsonErrorResponse(
      "Partner requests are temporarily unavailable. Please try again later.",
      503
    );
  }

  let inquiry: { id: number; createdAt: Date };
  try {
    inquiry = await prisma.partnerInquiry.create({
      data: {
        businessName: parsed.data.businessName,
        contactName: parsed.data.contactName,
        email: parsed.data.email,
        website: parsed.data.website,
        category: parsed.data.category,
        cityCountry: parsed.data.cityCountry,
        proposedReward: parsed.data.proposedReward,
        message: parsed.data.message,
      },
      select: { id: true, createdAt: true },
    });
  } catch (error) {
    console.error("Unable to store partner inquiry.", {
      message: error instanceof Error ? error.message : "Unknown error",
    });
    return createJsonErrorResponse(
      "We couldn't send your request. Please try again.",
      500
    );
  }

  try {
    await sendPartnerInquiryEmail({
      configuration: emailConfiguration,
      idempotencyKey: getEmailIdempotencyKey({
        ...parsed.data,
        notificationFrom: emailConfiguration.from,
        notificationTo: emailConfiguration.to,
      }),
      inquiry: {
        inquiryId: inquiry.id,
        businessName: parsed.data.businessName,
        contactName: parsed.data.contactName,
        email: parsed.data.email,
        website: parsed.data.website,
        proposedReward: parsed.data.proposedReward,
        submittedAt: inquiry.createdAt,
      },
    });
  } catch (error) {
    console.error("Unable to deliver partner inquiry notification.", {
      inquiryId: inquiry.id,
      status:
        error instanceof PartnerInquiryEmailDeliveryError
          ? error.status
          : null,
      providerCode:
        error instanceof PartnerInquiryEmailDeliveryError
          ? error.providerCode
          : null,
      providerMessage:
        error instanceof PartnerInquiryEmailDeliveryError
          ? error.providerMessage
          : null,
      retryable:
        error instanceof PartnerInquiryEmailDeliveryError
          ? error.retryable
          : false,
    });
    return createJsonErrorResponse(
      "We couldn't fully deliver your request. Please try again.",
      502
    );
  }

  return NextResponse.json({ success: true, inquiryId: inquiry.id });
}
