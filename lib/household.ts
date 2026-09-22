/**
 * Household defaults used at signup.
 *
 * Design decision (Task 3): signup collects an optional household name. If
 * left blank we default to "{name}'s Household" rather than forcing a
 * choice — most signups are a single person setting things up before
 * inviting the rest of the household (invite flow is Task 4), so asking
 * them to name a Household before they have one to name yet is friction
 * for no benefit. Currency defaults to USD (not exposed as a signup field);
 * per-household currency selection isn't asked for by this task and adding
 * it now would be speculative scope.
 */
export const DEFAULT_HOUSEHOLD_CURRENCY = "USD";

export function resolveHouseholdName(
  userName: string,
  requestedName: string,
): string {
  const trimmed = requestedName.trim();
  return trimmed.length > 0 ? trimmed : `${userName}'s Household`;
}
