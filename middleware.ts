import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import authConfig from "@/lib/auth.config";

// Edge-runtime-only NextAuth instance built from the DB-free config (see
// lib/auth.config.ts for why). Only used here to read/verify the session
// cookie, never to authenticate credentials.
const { auth } = NextAuth(authConfig);

export default auth((req) => {
  if (!req.auth) {
    const loginUrl = new URL("/login", req.nextUrl.origin);
    loginUrl.searchParams.set("callbackUrl", req.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }
});

export const config = {
  // Protect everything except: the Auth.js API routes, the signup/login
  // pages themselves, invite REDEMPTION links (/invite/<token> — for people
  // who don't have an account yet, so it must be public), Next.js
  // internals, and static files (anything with a file extension, e.g.
  // favicon.ico). Note: bare "/invite" (generate-an-invite, for an already
  // logged-in user) is deliberately NOT in this exclusion list and stays
  // protected — only "invite/<something>" is excluded.
  matcher: [
    "/((?!api/auth|login|signup|invite/[^/]+|_next/static|_next/image|.*\\..*).*)",
  ],
};
