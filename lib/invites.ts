import { randomBytes } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

// 256 bits of randomness, base64url-encoded (~43 chars) — unguessable and
// safe to embed directly in a URL path segment.
const TOKEN_BYTES = 32;

// How long a generated invite stays redeemable. No requirement drove this
// exact number; a week is a reasonable default for "share this link with
// someone" without leaving stale invites valid indefinitely.
const INVITE_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;

export function generateInviteToken(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

/**
 * Creates an invite for the given household. Callers MUST pass a
 * householdId sourced from the inviter's own session (never client input) —
 * this function does no authorization check itself, so it must only be
 * called after the caller has confirmed the household is the current
 * user's.
 */
export async function createInvite(
  householdId: string,
  createdByUserId: string,
) {
  return db.invite.create({
    data: {
      token: generateInviteToken(),
      householdId,
      createdByUserId,
      expiresAt: new Date(Date.now() + INVITE_EXPIRY_MS),
    },
  });
}

export type InviteValidation =
  { valid: true } | { valid: false; reason: "not_found" | "expired" | "used" };

type InviteRecord = {
  consumedAt: Date | null;
  expiresAt: Date;
};

/**
 * Pure evaluation of an already-fetched invite record (or null, meaning no
 * row matched the token). Kept separate from the DB fetch so it's testable
 * without a database, and so `validateInviteToken` and `consumeInvite`
 * share exactly one definition of "valid" instead of duplicating the
 * exists/expired/used checks inline.
 */
export function evaluateInvite(
  invite: InviteRecord | null,
  now: Date = new Date(),
): InviteValidation {
  if (!invite) {
    return { valid: false, reason: "not_found" };
  }
  if (invite.consumedAt) {
    return { valid: false, reason: "used" };
  }
  if (invite.expiresAt.getTime() <= now.getTime()) {
    return { valid: false, reason: "expired" };
  }
  return { valid: true };
}

/**
 * Read-only check used to render a clear error page before the redemption
 * form is even shown. This is advisory display only, NOT the authority on
 * whether an invite can be consumed — `consumeInvite` re-checks atomically
 * at signup time to close the race between two people redeeming the same
 * link concurrently (page load validation here could pass, then lose that
 * race by the time the form is submitted).
 */
export async function validateInviteToken(
  token: string,
  now: Date = new Date(),
): Promise<InviteValidation> {
  const invite = await db.invite.findUnique({
    where: { token },
    select: { consumedAt: true, expiresAt: true },
  });
  return evaluateInvite(invite, now);
}

/**
 * Atomically marks an invite consumed iff it's still valid (exists, not
 * expired, not already used), inside the caller's transaction. The
 * `updateMany` with all three conditions in `where` is the actual gate
 * against reuse/races — only one concurrent caller can ever flip a given
 * invite from unconsumed to consumed. Returns the invite's householdId on
 * success, or null if it was invalid/expired/already used.
 */
export async function consumeInvite(
  tx: Prisma.TransactionClient,
  token: string,
): Promise<string | null> {
  const result = await tx.invite.updateMany({
    where: { token, consumedAt: null, expiresAt: { gt: new Date() } },
    data: { consumedAt: new Date() },
  });
  if (result.count !== 1) {
    return null;
  }
  const invite = await tx.invite.findUniqueOrThrow({ where: { token } });
  return invite.householdId;
}
