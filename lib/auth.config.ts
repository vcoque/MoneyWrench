import type { NextAuthConfig } from "next-auth";

/**
 * Edge-safe Auth.js config: no providers with server-only logic (Prisma,
 * bcrypt) so this object can be used directly by `middleware.ts`, which
 * Next.js runs on the Edge runtime — a runtime Prisma's Postgres driver
 * cannot run in.
 *
 * `lib/auth.ts` spreads this config and adds the Credentials provider for
 * use in route handlers and server actions (both Node.js runtime).
 *
 * The `jwt`/`session` callbacks live here (not just in lib/auth.ts) because
 * they're pure — they only copy fields between the token/session objects,
 * no DB access — and middleware needs them too: they're what makes
 * `req.auth.householdId` / `req.auth.userId` available to middleware itself
 * (today's middleware only checks `req.auth` truthiness, but future tasks
 * may want to branch on householdId there).
 */
export default {
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
  },
  // Required for non-Vercel deployments (and local dev) since we don't set
  // NEXTAUTH_URL/AUTH_URL.
  trustHost: true,
  providers: [],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.userId = user.id;
        token.householdId = user.householdId;
      }
      return token;
    },
    session({ session, token }) {
      session.userId = token.userId as string;
      session.householdId = token.householdId as string;
      return session;
    },
  },
} satisfies NextAuthConfig;
