import type { ReactNode } from "react";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { logoutAction } from "./actions";
import { BottomNav, SidebarNav } from "./nav";

// Every page under this (app) route group is already protected by
// middleware.ts (only the auth pages and invite-redemption links are
// excluded) — this layout's job is the persistent app shell: a dark sidebar
// from `lg` up, a slim top bar plus bottom tab bar below that.

function Logo() {
  return (
    <Link
      href="/dashboard"
      className="flex items-center gap-2.5 px-2 text-[17px] font-extrabold tracking-[-0.01em] text-white no-underline hover:text-white"
    >
      <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true">
        <rect width="28" height="28" rx="7" fill="#14B8A6" />
        <path
          d="M7 19l5-6 4 3 5-7"
          fill="none"
          stroke="#12161C"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      MoneyWrench
    </Link>
  );
}

function initials(source: string): string {
  const parts = source.split(/[\s@.]+/).filter(Boolean);
  return (parts[0]?.[0] ?? "?").concat(parts[1]?.[0] ?? "").toUpperCase();
}

export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await auth();
  const email = session?.user?.email ?? "";
  const displayName = session?.user?.name || email || "Signed in";

  return (
    <div className="flex min-h-screen">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-58 shrink-0 flex-col gap-7 bg-chrome px-4 py-6 text-white lg:flex">
        <Logo />
        <SidebarNav />

        {session?.householdId && (
          <div className="mt-auto flex items-center gap-2.5 border-t border-chrome-line px-3 pt-3">
            <div
              aria-hidden="true"
              className="flex size-9 shrink-0 items-center justify-center rounded-full bg-chrome-line text-[13px] font-bold"
            >
              {initials(displayName)}
            </div>
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-sm font-semibold">
                {displayName}
              </span>
              <form action={logoutAction}>
                <button
                  type="submit"
                  className="cursor-pointer text-xs text-chrome-muted underline-offset-2 hover:text-white hover:underline"
                >
                  Log out
                </button>
              </form>
            </div>
          </div>
        )}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Phone top bar */}
        <header className="sticky top-0 z-10 flex items-center justify-between bg-chrome px-4 py-3 lg:hidden">
          <Logo />
        </header>

        <div className="flex-1 pb-24 lg:pb-0">{children}</div>
      </div>

      <BottomNav
        logout={
          session?.householdId ? (
            <form action={logoutAction}>
              <button
                type="submit"
                className="flex min-h-11 w-full cursor-pointer items-center rounded-lg px-3 text-left text-sm font-medium text-warn-strong hover:bg-page"
              >
                Log out
              </button>
            </form>
          ) : null
        }
      />
    </div>
  );
}
