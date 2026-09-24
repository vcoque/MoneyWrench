"use server";

import { signOut } from "@/lib/auth";

/**
 * Shared log-out action for the app-wide nav bar (see layout.tsx). Auth.js
 * signals the post-sign-out redirect by throwing a NEXT_REDIRECT error
 * internally, which must propagate for the redirect to actually happen —
 * same pattern app/(auth)/actions.ts's signIn calls rely on.
 */
export async function logoutAction(): Promise<void> {
  await signOut({ redirectTo: "/login" });
}
