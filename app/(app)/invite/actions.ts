"use server";

import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { createInvite } from "@/lib/invites";

export type GenerateInviteState = {
  link?: string;
  error?: string;
};

// Same trust model as auth.config.ts's `trustHost: true`: this app has no
// NEXTAUTH_URL/AUTH_URL configured, so the Host header is the only source
// for the origin to embed in the invite link. Resolved server-side (rather
// than via client-side window.location.origin) so the link the user sees
// is ready on the first render, no effect/state dance required.
async function resolveOrigin(): Promise<string> {
  const headersList = await headers();
  const host = headersList.get("host") ?? "localhost:3000";
  const protocol = headersList.get("x-forwarded-proto") ?? "http";
  return `${protocol}://${host}`;
}

export async function generateInviteAction(
  _prevState: GenerateInviteState,
  _formData: FormData,
): Promise<GenerateInviteState> {
  const session = await auth();

  // Belt-and-suspenders: middleware already protects this route, but never
  // trust a client-supplied householdId — read it from the server session,
  // which is sourced from the DB (see lib/auth.config.ts). This also means
  // a user can only ever generate an invite for their OWN household.
  if (!session?.userId || !session?.householdId) {
    return { error: "You must be logged in to generate an invite." };
  }

  const invite = await createInvite(session.householdId, session.userId);
  const origin = await resolveOrigin();
  return { link: `${origin}/invite/${invite.token}` };
}
