import InviteGenerator from "./invite-generator";

// No dashboard shell exists yet (see Task 4 brief) — this is a minimal
// standalone page, protected by middleware like every other app/(app)
// route, since it's outside the login/signup exclusions in middleware.ts.
export default function InvitePage() {
  return (
    <main className="page-auth">
      <div className="flex flex-col gap-2">
        <h1 className="page-title">Invite someone to your household</h1>
        <p className="page-lede">
          Generate a link and share it with the person you want to invite.
        </p>
      </div>

      <InviteGenerator />
    </main>
  );
}
