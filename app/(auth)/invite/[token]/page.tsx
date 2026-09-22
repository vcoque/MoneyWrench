import Link from "next/link";
import { validateInviteToken } from "@/lib/invites";
import RedeemInviteForm from "./redeem-invite-form";

function errorMessageFor(reason: "not_found" | "expired" | "used"): string {
  switch (reason) {
    case "not_found":
      return "This invite link doesn't exist. Double check the link, or ask for a new one.";
    case "expired":
      return "This invite link has expired. Ask whoever invited you to send a new one.";
    case "used":
      return "This invite link has already been used. Ask whoever invited you to send a new one.";
  }
}

// This route is deliberately excluded from middleware auth protection (see
// middleware.ts) — it's the entry point for someone who does NOT have an
// account yet.
export default async function InviteRedemptionPage({
  params,
}: PageProps<"/invite/[token]">) {
  const { token } = await params;
  const validation = await validateInviteToken(token);

  if (!validation.valid) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-24 text-center">
        <h1 className="text-4xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
          Invite not available
        </h1>
        <p className="max-w-md text-lg text-zinc-600 dark:text-zinc-400">
          {errorMessageFor(validation.reason)}
        </p>
        <Link href="/signup" className="underline">
          Sign up instead
        </Link>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 p-24 text-center">
      <div className="flex flex-col gap-2">
        <h1 className="text-4xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
          You&apos;ve been invited
        </h1>
        <p className="max-w-md text-lg text-zinc-600 dark:text-zinc-400">
          Create your account to join the household.
        </p>
      </div>

      <RedeemInviteForm token={token} />

      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Already have an account?{" "}
        <Link href="/login" className="underline">
          Log in
        </Link>
      </p>
    </main>
  );
}
