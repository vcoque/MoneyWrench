"use server";

import bcrypt from "bcryptjs";
import { AuthError } from "next-auth";
import { db } from "@/lib/db";
import { signIn } from "@/lib/auth";
import {
  DEFAULT_HOUSEHOLD_CURRENCY,
  resolveHouseholdName,
} from "@/lib/household";
import { consumeInvite } from "@/lib/invites";

const MIN_PASSWORD_LENGTH = 8;
const BCRYPT_COST_FACTOR = 10;

export type AuthActionState = {
  error?: string;
};

/**
 * Shared tail end of both signup flows (new household and invite
 * redemption): the account row already exists in the DB by the time this
 * runs, so a thrown AuthError here means sign-in itself failed, not
 * account creation — send the user to log in manually rather than
 * reporting a signup failure.
 */
async function signInAfterSignup(
  email: string,
  password: string,
): Promise<AuthActionState> {
  try {
    await signIn("credentials", { email, password, redirectTo: "/dashboard" });
  } catch (error) {
    if (error instanceof AuthError) {
      return {
        error: "Account created. Please log in.",
      };
    }
    // Auth.js signals a successful signIn's redirect by throwing a special
    // NEXT_REDIRECT error, which must propagate for the redirect to happen.
    throw error;
  }

  return {};
}

function readSignupFields(formData: FormData) {
  return {
    name: String(formData.get("name") ?? "").trim(),
    email: String(formData.get("email") ?? "")
      .trim()
      .toLowerCase(),
    password: String(formData.get("password") ?? ""),
  };
}

function validateSignupFields(
  name: string,
  email: string,
  password: string,
): string | undefined {
  if (!name || !email || !password) {
    return "Name, email, and password are required.";
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  return undefined;
}

export async function signupAction(
  _prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const { name, email, password } = readSignupFields(formData);
  const householdNameInput = String(formData.get("householdName") ?? "");

  const fieldError = validateSignupFields(name, email, password);
  if (fieldError) {
    return { error: fieldError };
  }

  const existing = await db.user.findUnique({ where: { email } });
  if (existing) {
    return { error: "An account with that email already exists." };
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_COST_FACTOR);
  const householdName = resolveHouseholdName(name, householdNameInput);

  await db.$transaction(async (tx) => {
    const household = await tx.household.create({
      data: { name: householdName, currency: DEFAULT_HOUSEHOLD_CURRENCY },
    });
    await tx.user.create({
      data: {
        householdId: household.id,
        email,
        name,
        passwordHash,
      },
    });
  });

  return signInAfterSignup(email, password);
}

export async function redeemInviteAction(
  _prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const token = String(formData.get("token") ?? "").trim();
  const { name, email, password } = readSignupFields(formData);

  if (!token) {
    return { error: "Missing invite token." };
  }

  const fieldError = validateSignupFields(name, email, password);
  if (fieldError) {
    return { error: fieldError };
  }

  const existing = await db.user.findUnique({ where: { email } });
  if (existing) {
    return { error: "An account with that email already exists." };
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_COST_FACTOR);

  const householdId = await db.$transaction(async (tx) => {
    // Atomically re-checks the invite is still valid and marks it consumed
    // — this is the authoritative gate, not just the page-load display
    // check the redemption page already ran. Closes the race between two
    // concurrent redemptions of the same link.
    const consumedHouseholdId = await consumeInvite(tx, token);
    if (!consumedHouseholdId) {
      return null;
    }
    await tx.user.create({
      data: {
        householdId: consumedHouseholdId,
        email,
        name,
        passwordHash,
      },
    });
    return consumedHouseholdId;
  });

  if (!householdId) {
    return {
      error: "This invite link is invalid, expired, or has already been used.",
    };
  }

  return signInAfterSignup(email, password);
}

export async function loginAction(
  _prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Email and password are required." };
  }

  try {
    await signIn("credentials", { email, password, redirectTo: "/dashboard" });
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: "Invalid email or password." };
    }
    throw error;
  }

  return {};
}
