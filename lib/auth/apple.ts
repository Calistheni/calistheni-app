import "server-only";

import { createRemoteJWKSet, importPKCS8, SignJWT } from "jose";
import { prisma } from "@/lib/prisma";
import { normalizeApplePrivateKey } from "@/lib/auth/apple-private-key";
import {
  AppleOAuthExchangeError,
  classifyAppleOAuthError,
} from "@/lib/auth/apple-native-diagnostics";
import { decryptAuthToken, encryptAuthToken } from "@/lib/auth/security";
import { verifyAppleAccountEvent, verifyAppleIdentityToken } from "@/lib/auth/apple-token-verification";

const APPLE_ISSUER = "https://appleid.apple.com";
const APPLE_JWKS = createRemoteJWKSet(new URL("https://appleid.apple.com/auth/keys"));
const APPLE_TOKEN_ENDPOINT = "https://appleid.apple.com/auth/token";

export async function verifyAppleServerAccountEvent(payload: string) {
  const audiences = [process.env.AUTH_APPLE_ID, nativeClientId()].filter(
    (value): value is string => Boolean(value)
  );
  return verifyAppleAccountEvent({ payload, key: APPLE_JWKS, audiences });
}

function nativeClientId() {
  return process.env.IOS_BUNDLE_ID?.trim() || "com.petershikrenov.calistheni";
}

async function createAppleClientSecret(clientId: string) {
  const teamId = process.env.APPLE_TEAM_ID?.trim();
  const keyId = process.env.APPLE_AUTH_KEY_ID?.trim();
  const privateKeyValue = process.env.APPLE_AUTH_PRIVATE_KEY?.trim();
  if (!teamId || !keyId || !privateKeyValue) {
    throw new AppleOAuthExchangeError("unknown", "configuration");
  }
  let privateKey: string;
  try {
    privateKey = normalizeApplePrivateKey(privateKeyValue);
  } catch {
    throw new AppleOAuthExchangeError("unknown", "private_key_parse");
  }
  let key;
  try {
    key = await importPKCS8(privateKey, "ES256");
  } catch {
    throw new AppleOAuthExchangeError("unknown", "private_key_import");
  }
  const now = Math.floor(Date.now() / 1000);
  try {
    return await new SignJWT({})
      .setProtectedHeader({ alg: "ES256", kid: keyId })
      .setIssuer(teamId)
      .setSubject(clientId)
      .setAudience(APPLE_ISSUER)
      .setIssuedAt(now)
      .setExpirationTime(now + 5 * 60)
      .sign(key);
  } catch {
    throw new AppleOAuthExchangeError("unknown", "client_secret_signing");
  }
}

type AppleTokenResponse = {
  access_token?: unknown;
  expires_in?: unknown;
  id_token?: unknown;
  refresh_token?: unknown;
  token_type?: unknown;
  error?: unknown;
};

export async function exchangeNativeAppleAuthorizationCode(code: string) {
  const clientId = nativeClientId();
  const clientSecret = await createAppleClientSecret(clientId);
  let response: Response;
  try {
    response = await fetch(APPLE_TOKEN_ENDPOINT, {
      method: "POST",
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        grant_type: "authorization_code",
      }),
    });
  } catch {
    throw new AppleOAuthExchangeError("unknown", "apple_token_request");
  }
  const body = (await response.json().catch(() => ({}))) as AppleTokenResponse;
  if (!response.ok || typeof body.id_token !== "string") {
    throw new AppleOAuthExchangeError(
      classifyAppleOAuthError(body.error),
      "apple_token_response"
    );
  }
  return {
    idToken: body.id_token,
    refreshToken: typeof body.refresh_token === "string" ? body.refresh_token : null,
  };
}

export async function verifyNativeAppleIdentityToken(idToken: string, nonce: string) {
  return verifyAppleIdentityToken({ idToken, key: APPLE_JWKS, audience: nativeClientId(), nonce });
}

export async function verifyExchangedAppleIdentityToken(idToken: string, nonce: string) {
  return (await verifyAppleIdentityToken({ idToken, key: APPLE_JWKS, audience: nativeClientId(), nonce })).subject;
}

export async function persistEncryptedAppleAuthorization({
  userId,
  providerAccountId,
  clientId,
  refreshToken,
}: {
  userId: string;
  providerAccountId: string;
  clientId: string;
  refreshToken: string;
}) {
  const encrypted = encryptAuthToken(refreshToken);
  return prisma.appleAuthorization.upsert({
    where: { userId },
    create: {
      userId,
      providerAccountId,
      clientId,
      refreshTokenCiphertext: encrypted.ciphertext,
      refreshTokenIv: encrypted.iv,
      refreshTokenTag: encrypted.tag,
      encryptionKeyId: encrypted.keyId,
    },
    update: {
      providerAccountId,
      clientId,
      refreshTokenCiphertext: encrypted.ciphertext,
      refreshTokenIv: encrypted.iv,
      refreshTokenTag: encrypted.tag,
      encryptionKeyId: encrypted.keyId,
      revokedAt: null,
      revocationPendingAt: null,
    },
  });
}

export async function revokeStoredAppleAuthorization(userId: string) {
  const authorization = await prisma.appleAuthorization.findUnique({ where: { userId } });
  if (!authorization || authorization.revokedAt) return;
  const clientId = authorization.clientId;
  const token = decryptAuthToken({
    ciphertext: authorization.refreshTokenCiphertext,
    iv: authorization.refreshTokenIv,
    tag: authorization.refreshTokenTag,
    keyId: authorization.encryptionKeyId,
  });
  const response = await fetch("https://appleid.apple.com/auth/revoke", {
    method: "POST",
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: await createAppleClientSecret(clientId),
      token,
      token_type_hint: "refresh_token",
    }),
  });
  if (!response.ok) throw new Error("APPLE_REVOCATION_FAILED");
  await prisma.appleAuthorization.update({
    where: { userId },
    data: { revokedAt: new Date(), revocationPendingAt: null },
  });
}
