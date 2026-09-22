"use server";

import bcrypt from "bcryptjs";
import { AuthError } from "next-auth";
import { db } from "@/lib/db";
import { signIn } from "@/lib/auth";
import {
  DEFAULT_HOUSEHOLD_CURRENCY,
  resolveHouseholdName,
} from "@/lib/household";

const MIN_PASSWORD_LENGTH = 8;
const BCRYPT_COST_FACTOR = 10;

export type AuthActionState = {
  error?: string;
};

export async function signupAction(
  _prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") ?? "");
  const householdNameInput = String(formData.get("householdName") ?? "");

  if (!name || !email || !password) {
    return { error: "Name, email, and password are required." };
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return {
      error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
    };
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

  try {
    await signIn("credentials", { email, password, redirectTo: "/" });
  } catch (error) {
    if (error instanceof AuthError) {
      // Account was created successfully; only the automatic sign-in
      // failed. Send the user to log in manually rather than reporting a
      // signup failure.
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
    await signIn("credentials", { email, password, redirectTo: "/" });
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: "Invalid email or password." };
    }
    throw error;
  }

  return {};
}
