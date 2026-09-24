import type { ReactNode } from "react";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { logoutAction } from "./actions";

// Every page under this (app) route group is already protected by
// middleware.ts (only the auth pages and invite-redemption links are
// excluded) — this layout's job is purely the persistent nav bar every one
// of those pages was otherwise missing (there was no way to get from one
// feature page to another except by typing a URL directly).
const NAV_LINKS: { href: string; label: string }[] = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/transactions", label: "Transactions" },
  { href: "/budget", label: "Budget" },
  { href: "/goals", label: "Goals" },
  { href: "/import", label: "Import" },
  { href: "/rules", label: "Rules" },
  { href: "/accounts", label: "Accounts" },
  { href: "/categories", label: "Categories" },
  { href: "/invite", label: "Invite" },
];

export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await auth();

  return (
    <>
      <header className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b border-zinc-300 bg-white px-6 py-3 dark:border-zinc-700 dark:bg-zinc-950">
        <nav className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          <Link
            href="/dashboard"
            className="font-semibold text-zinc-950 dark:text-zinc-50"
          >
            MoneyWrench
          </Link>
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-zinc-600 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-50"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        {session?.householdId && (
          <form action={logoutAction}>
            <button
              type="submit"
              className="text-sm text-zinc-600 underline hover:no-underline dark:text-zinc-400"
            >
              Log out
            </button>
          </form>
        )}
      </header>

      {children}
    </>
  );
}
