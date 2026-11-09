import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Apple from "next-auth/providers/apple";
import { PrismaAdapter } from "@auth/prisma-adapter";
import type { Adapter, AdapterAccount } from "next-auth/adapters";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { AUTH_LINK_COOKIE, consumeOAuthLinkIntent, stageNativeOAuthLink } from "@/lib/auth/account-linking";
import { markCurrentSessionRecentlyAuthenticated } from "@/lib/auth/database-session";
import { encryptAuthToken } from "@/lib/auth/security";
import { currentAuthCallbackProvider, runInAuthRequestContext } from "@/lib/auth/auth-request-context";

const googleClientId = process.env.GOOGLE_CLIENT_ID || process.env.AUTH_GOOGLE_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET || process.env.AUTH_GOOGLE_SECRET;
const appleClientId = process.env.AUTH_APPLE_ID;
const appleClientSecret = process.env.AUTH_APPLE_SECRET;

const baseAdapter = PrismaAdapter(prisma as never);
const adapter: Adapter = {
  ...baseAdapter,
  async createSession(session) {
    return prisma.$transaction(async (tx) => {
      const activeUser = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "User"
        WHERE "id" = ${session.userId} AND "deletedAt" IS NULL
        FOR UPDATE
      `;
      if (!activeUser.length) throw new Error("AUTH_USER_DEACTIVATED");
      return tx.session.create({
        data: {
          ...session,
          authenticatedAt: new Date(),
          authProvider: currentAuthCallbackProvider(),
        },
      });
    });
  },
  async linkAccount(account: AdapterAccount) {
    const safeAccount = {
      userId: account.userId,
      type: account.type,
      provider: account.provider,
      providerAccountId: account.providerAccountId,
      ...(account.expires_at !== undefined ? { expires_at: account.expires_at } : {}),
      ...(account.scope !== undefined ? { scope: account.scope } : {}),
    };
    if (account.provider === "apple" && account.refresh_token) {
      const encrypted = encryptAuthToken(account.refresh_token);
      await prisma.$transaction(async (tx) => {
        const activeUser = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT "id" FROM "User"
          WHERE "id" = ${account.userId} AND "deletedAt" IS NULL
          FOR UPDATE
        `;
        if (!activeUser.length) throw new Error("AUTH_USER_DEACTIVATED");
        await tx.account.create({ data: safeAccount });
        await tx.appleAuthorization.upsert({
          where: { userId: account.userId },
          create: {
            userId: account.userId,
            providerAccountId: account.providerAccountId,
            clientId: appleClientId!,
            refreshTokenCiphertext: encrypted.ciphertext,
            refreshTokenIv: encrypted.iv,
            refreshTokenTag: encrypted.tag,
            encryptionKeyId: encrypted.keyId,
          },
          update: {
            providerAccountId: account.providerAccountId,
            clientId: appleClientId!,
            refreshTokenCiphertext: encrypted.ciphertext,
            refreshTokenIv: encrypted.iv,
            refreshTokenTag: encrypted.tag,
            encryptionKeyId: encrypted.keyId,
            revokedAt: null,
            revocationPendingAt: null,
          },
        });
      });
    } else {
      if (account.provider === "google" && await stageNativeOAuthLink(account)) {
        return safeAccount;
      }
      await prisma.$transaction(async (tx) => {
        const activeUser = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT "id" FROM "User"
          WHERE "id" = ${account.userId} AND "deletedAt" IS NULL
          FOR UPDATE
        `;
        if (!activeUser.length) throw new Error("AUTH_USER_DEACTIVATED");
        await tx.account.create({ data: safeAccount });
      });
    }
    return safeAccount;
  },
};

if (process.env.NODE_ENV === "development") {
  console.info("[Auth] Google provider environment", {
    clientIdConfigured: Boolean(googleClientId),
    clientSecretConfigured: Boolean(googleClientSecret),
    authSecretConfigured: Boolean(process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET),
    authUrl: process.env.AUTH_URL || process.env.NEXTAUTH_URL || "request-derived",
  });
}

const nextAuth = NextAuth({
  adapter,
  secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,
  providers: [
    Google({
      // Do not pass empty strings: that blocks Auth.js's standard
      // AUTH_GOOGLE_ID/AUTH_GOOGLE_SECRET environment inference.
      ...(googleClientId ? { clientId: googleClientId } : {}),
      ...(googleClientSecret ? { clientSecret: googleClientSecret } : {}),
    }),
    ...(appleClientId && appleClientSecret
      ? [Apple({ clientId: appleClientId, clientSecret: appleClientSecret })]
      : []),
  ],
  session: {
    strategy: "database",
  },
  pages: {
    // Native browser failures can return through a verified Universal/App Link
    // instead of exposing Auth.js's generic server error page.
    error: "/mobile/auth/error",
  },
  trustHost: true,
  callbacks: {
    async signIn({ account, user }) {
      if (!account) return false;
      const linked = await prisma.account.findUnique({
        where: {
          provider_providerAccountId: {
            provider: account.provider,
            providerAccountId: account.providerAccountId,
          },
        },
        select: { userId: true },
      });
      if (linked) {
        const owner = await prisma.user.findUnique({
          where: { id: linked.userId },
          select: { deletedAt: true },
        });
        if (!owner || owner.deletedAt) return false;
      } else if (user.email) {
        // A provider subject is never associated by email. This check only
        // prevents OAuth from creating a new account against an email owned
        // by an existing active account. Deletion releases its email while
        // preserving the old row as a tombstone.
        const emailOwner = await prisma.user.findFirst({
          where: { email: { equals: user.email, mode: "insensitive" } },
          select: { deletedAt: true },
        });
        if (emailOwner?.deletedAt) return false;
      }
      if (account.provider === "apple" && linked) {
        const encrypted = account.refresh_token && appleClientId
          ? encryptAuthToken(account.refresh_token)
          : null;
        const reauthorized = await prisma.$transaction(async (tx) => {
          const activeUser = await tx.$queryRaw<Array<{ id: string }>>`
            SELECT "id" FROM "User"
            WHERE "id" = ${linked.userId} AND "deletedAt" IS NULL
            FOR UPDATE
          `;
          if (!activeUser.length) return false;
          const authorization = await tx.appleAuthorization.findUnique({
            where: { userId: linked.userId },
            select: { revokedAt: true },
          });
          if (authorization?.revokedAt) {
            if (!encrypted || !appleClientId) return false;
            await tx.appleAuthorization.updateMany({
              where: { userId: linked.userId, revokedAt: { not: null } },
              data: {
                clientId: appleClientId,
                refreshTokenCiphertext: encrypted.ciphertext,
                refreshTokenIv: encrypted.iv,
                refreshTokenTag: encrypted.tag,
                encryptionKeyId: encrypted.keyId,
                revokedAt: null,
                revocationPendingAt: null,
              },
            });
          }
          return true;
        });
        if (!reauthorized) return false;
      }
      const cookieStore = await import("next/headers").then(({ cookies }) => cookies());
      const sessionCookie =
        cookieStore.get("__Secure-authjs.session-token") ??
        cookieStore.get("authjs.session-token");
      if (!sessionCookie) return !cookieStore.get(AUTH_LINK_COOKIE);
      const session = await prisma.session.findFirst({
        where: { sessionToken: sessionCookie.value, expires: { gt: new Date() } },
        select: { userId: true, purpose: true, user: { select: { deletedAt: true } } },
      });
      if (!session) return !cookieStore.get(AUTH_LINK_COOKIE);
      if (session.user.deletedAt) return false;
      if (session.purpose === "OAUTH_LINK") {
        return consumeOAuthLinkIntent(account.provider, session.userId);
      }
      if (linked) return linked.userId === session.userId;
      return consumeOAuthLinkIntent(account.provider, session.userId);
    },
    session({ session, user }) {
      if ((session as typeof session & { purpose?: string }).purpose === "OAUTH_LINK") {
        return null as never;
      }
      if ((user as typeof user & { deletedAt?: Date | null }).deletedAt) {
        return null as never;
      }
      if (session.user) {
        session.user.id = user.id;
      }

      return session;
    },
  },
  events: {
    async signIn() {
      await markCurrentSessionRecentlyAuthenticated();
    },
  },
});

export const { auth, signIn, signOut } = nextAuth;
export const handlers = {
  GET(request: NextRequest) {
    return runInAuthRequestContext(request, () => nextAuth.handlers.GET(request));
  },
  POST(request: NextRequest) {
    return runInAuthRequestContext(request, () => nextAuth.handlers.POST(request));
  },
};
