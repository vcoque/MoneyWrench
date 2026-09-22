import { describe, expect, it } from "vitest";
import type { JWT } from "next-auth/jwt";
import type { Session, User } from "next-auth";
import authConfig from "@/lib/auth.config";

// These exercise the jwt/session callbacks directly (no DB, no HTTP) since
// they're the piece every later task depends on: every task that scopes a
// Prisma query by household reads session.householdId, so this shape is a
// foundational interface, not incidental to this task.

const jwtCallback = authConfig.callbacks!.jwt!;
const sessionCallback = authConfig.callbacks!.session!;

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: "user_1",
    householdId: "household_1",
    email: "a@example.com",
    name: "Ada",
    ...overrides,
  };
}

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    user: { name: "Ada", email: "a@example.com" },
    expires: new Date(Date.now() + 1000 * 60 * 60).toISOString(),
    userId: "",
    householdId: "",
    ...overrides,
  };
}

describe("jwt callback", () => {
  it("attaches userId and householdId to the token on initial sign-in", async () => {
    const token = await jwtCallback({
      token: {} as JWT,
      user: makeUser({ id: "user_42", householdId: "household_7" }),
      // Auth.js passes several other fields (account, profile, trigger…)
      // that the callback doesn't read; unused here.
    } as Parameters<typeof jwtCallback>[0]);

    expect(token.userId).toBe("user_42");
    expect(token.householdId).toBe("household_7");
  });

  it("preserves existing token fields on subsequent requests (no user param)", async () => {
    const existingToken = {
      userId: "user_42",
      householdId: "household_7",
    } as JWT;

    const token = await jwtCallback({
      token: existingToken,
      user: undefined as unknown as User,
    } as Parameters<typeof jwtCallback>[0]);

    expect(token.userId).toBe("user_42");
    expect(token.householdId).toBe("household_7");
  });
});

describe("session callback", () => {
  it("exposes userId and householdId on the session object from the token", async () => {
    const session = await sessionCallback({
      session: makeSession(),
      token: { userId: "user_42", householdId: "household_7" } as JWT,
    } as Parameters<typeof sessionCallback>[0]);

    expect(session.userId).toBe("user_42");
    expect(session.householdId).toBe("household_7");
  });

  it("does not leak a previous user's ids when the token has none set", async () => {
    const session = await sessionCallback({
      session: makeSession({
        userId: "stale_user",
        householdId: "stale_household",
      }),
      token: {} as JWT,
    } as Parameters<typeof sessionCallback>[0]);

    expect(session.userId).toBeUndefined();
    expect(session.householdId).toBeUndefined();
  });
});
