import { redirect } from "next/navigation";

// middleware.ts protects "/" the same as every other non-auth route, so
// this is only ever reached by an already-authenticated request — there is
// no logged-out visitor to show a marketing page to. It used to render a
// bare "MoneyWrench" landing page here with no way to get anywhere else;
// now it just sends an authenticated visit straight to the real landing
// page (the dashboard), same as signup/login's own post-auth redirect.
export default function Home() {
  redirect("/dashboard");
}
