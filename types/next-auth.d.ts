import type { DefaultSession } from "next-auth";

// Module augmentation: every later task reads session.householdId /
// session.userId to scope Prisma queries, so these are load-bearing types,
// not decoration.
declare module "next-auth" {
  interface User {
    // Optional: the base User type is shared with providers that never set
    // this (e.g. an OAuth profile before it's matched to a DB user). Our
    // Credentials authorize() always sets it; jwt() only reads it when
    // `user` is present at sign-in.
    householdId?: string;
  }

  interface Session extends DefaultSession {
    userId: string;
    householdId: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    userId?: string;
    householdId?: string;
  }
}
