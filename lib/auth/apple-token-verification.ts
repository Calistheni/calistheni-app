import { jwtVerify, type JWTVerifyGetKey } from "jose";
import { normalizeAuthEmail } from "@/lib/auth/password-core";

export type AppleVerificationKey = CryptoKey | Uint8Array | JWTVerifyGetKey;

export async function verifyAppleIdentityToken({ idToken, key, audience, nonce }: {
  idToken: string;
  key: AppleVerificationKey;
  audience: string;
  nonce?: string;
}) {
  const { payload } = await jwtVerify(idToken, key, {
    issuer: "https://appleid.apple.com",
    audience,
    algorithms: ["RS256"],
  });
  if (typeof payload.sub !== "string" || (nonce !== undefined && payload.nonce !== nonce)) {
    throw new Error("APPLE_IDENTITY_INVALID");
  }
  const email = typeof payload.email === "string" ? normalizeAuthEmail(payload.email) : null;
  const emailVerified = payload.email_verified === true || payload.email_verified === "true";
  return {
    subject: payload.sub,
    email: emailVerified ? email : null,
    emailVerified,
    privateRelay: payload.is_private_email === true || payload.is_private_email === "true",
  };
}

export async function verifyAppleAccountEvent({ payload, key, audiences, now = new Date() }: {
  payload: string;
  key: AppleVerificationKey;
  audiences: string[];
  now?: Date;
}) {
  const { payload: claims } = await jwtVerify(payload, key, {
    issuer: "https://appleid.apple.com",
    audience: audiences,
    algorithms: ["RS256"],
    currentDate: now,
    maxTokenAge: "7d",
  });
  const events = claims.events;
  if (!claims.jti || !events || typeof events !== "object" || Array.isArray(events)) {
    throw new Error("APPLE_ACCOUNT_EVENT_INVALID");
  }
  const event = events as Record<string, unknown>;
  const allowedTypes = new Set(["email-disabled", "email-enabled", "consent-revoked", "account-deleted"]);
  if (typeof event.type !== "string" || !allowedTypes.has(event.type) || typeof event.sub !== "string" || typeof event.event_time !== "number") {
    throw new Error("APPLE_ACCOUNT_EVENT_INVALID");
  }
  return {
    jti: claims.jti,
    type: event.type,
    providerAccountId: event.sub,
    email: typeof event.email === "string" ? normalizeAuthEmail(event.email) : null,
    privateRelay: event.is_private_email === true || event.is_private_email === "true",
    eventTime: new Date(event.event_time * 1000),
  };
}
