import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";

const googleClientId = process.env.GOOGLE_CLIENT_ID || process.env.AUTH_GOOGLE_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET || process.env.AUTH_GOOGLE_SECRET;

if (process.env.NODE_ENV === "development") {
  console.info("[Auth] Google provider environment", {
    clientIdConfigured: Boolean(googleClientId),
    clientSecretConfigured: Boolean(googleClientSecret),
    authSecretConfigured: Boolean(process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET),
    authUrl: process.env.AUTH_URL || process.env.NEXTAUTH_URL || "request-derived",
  });
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma as never),
  secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,
  providers: [
    Google({
      // Do not pass empty strings: that blocks Auth.js's standard
      // AUTH_GOOGLE_ID/AUTH_GOOGLE_SECRET environment inference.
      ...(googleClientId ? { clientId: googleClientId } : {}),
      ...(googleClientSecret ? { clientSecret: googleClientSecret } : {}),
    }),
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
    session({ session, user }) {
      if (session.user) {
        session.user.id = user.id;
      }

      return session;
    },
  },
});
