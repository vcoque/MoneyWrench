import { describe, expect, it } from "vitest";
import { evaluateInvite, generateInviteToken } from "@/lib/invites";

// evaluateInvite is the pure core of invite validation (no DB), so these
// exercise the exists/expired/used decision logic directly rather than
// through validateInviteToken, which just fetches a row and delegates here.

describe("evaluateInvite", () => {
  const now = new Date("2026-09-22T12:00:00.000Z");

  it("is valid for a non-expired, unconsumed invite", () => {
    const invite = {
      consumedAt: null,
      expiresAt: new Date("2026-09-29T12:00:00.000Z"),
    };

    expect(evaluateInvite(invite, now)).toEqual({ valid: true });
  });

  it("reports 'not_found' when no invite matched the token", () => {
    expect(evaluateInvite(null, now)).toEqual({
      valid: false,
      reason: "not_found",
    });
  });

  it("reports 'expired' when the expiry time has passed", () => {
    const invite = {
      consumedAt: null,
      expiresAt: new Date("2026-09-21T12:00:00.000Z"),
    };

    expect(evaluateInvite(invite, now)).toEqual({
      valid: false,
      reason: "expired",
    });
  });

  it("treats an invite expiring at exactly `now` as expired", () => {
    const invite = { consumedAt: null, expiresAt: now };

    expect(evaluateInvite(invite, now)).toEqual({
      valid: false,
      reason: "expired",
    });
  });

  it("reports 'used' when the invite was already consumed, even if unexpired", () => {
    const invite = {
      consumedAt: new Date("2026-09-22T11:00:00.000Z"),
      expiresAt: new Date("2026-09-29T12:00:00.000Z"),
    };

    expect(evaluateInvite(invite, now)).toEqual({
      valid: false,
      reason: "used",
    });
  });

  it("prioritizes 'used' over 'expired' when both are true", () => {
    const invite = {
      consumedAt: new Date("2026-09-20T12:00:00.000Z"),
      expiresAt: new Date("2026-09-21T12:00:00.000Z"),
    };

    expect(evaluateInvite(invite, now)).toEqual({
      valid: false,
      reason: "used",
    });
  });
});

describe("generateInviteToken", () => {
  it("generates a URL-safe token with no padding or reserved characters", () => {
    const token = generateInviteToken();

    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("generates a sufficiently long token (256 bits of randomness)", () => {
    const token = generateInviteToken();

    // 32 random bytes, base64url-encoded, is 43 characters (no padding).
    expect(token.length).toBeGreaterThanOrEqual(40);
  });

  it("generates distinct tokens across calls (not sequential/predictable)", () => {
    const tokens = new Set(
      Array.from({ length: 50 }, () => generateInviteToken()),
    );

    expect(tokens.size).toBe(50);
  });
});
