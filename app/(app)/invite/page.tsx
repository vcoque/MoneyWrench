import InviteGenerator from "./invite-generator";

// No dashboard shell exists yet (see Task 4 brief) — this is a minimal
// standalone page, protected by middleware like every other app/(app)
// route, since it's outside the login/signup exclusions in middleware.ts.
export default function InvitePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 p-24 text-center">
      <div className="flex flex-col gap-2">
        <h1 className="text-4xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
          Invite someone to your household
        </h1>
        <p className="max-w-md text-lg text-zinc-600 dark:text-zinc-400">
          Generate a link and share it with the person you want to invite.
        </p>
      </div>

      <InviteGenerator />
    </main>
  );
}
