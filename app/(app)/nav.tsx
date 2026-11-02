"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

type NavItem = { href: string; label: string; icon: ReactNode };

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

// Icon shapes are the ones used in the design canvas where it has them
// (dashboard, list, activity); the rest follow the same 24px / 2px-stroke
// style.
const ITEMS: NavItem[] = [
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: (
      <Icon>
        <rect x="3" y="3" width="7" height="9" rx="1.5" />
        <rect x="14" y="3" width="7" height="5" rx="1.5" />
        <rect x="14" y="12" width="7" height="9" rx="1.5" />
        <rect x="3" y="16" width="7" height="5" rx="1.5" />
      </Icon>
    ),
  },
  {
    href: "/transactions",
    label: "Transactions",
    icon: (
      <Icon>
        <path d="M7 4v16M7 20l-3-3M7 20l3-3M17 20V4M17 4l-3 3M17 4l3 3" />
      </Icon>
    ),
  },
  {
    href: "/budget",
    label: "Budget",
    icon: (
      <Icon>
        <path d="M3 17l6-6 4 4 8-8" />
        <path d="M14 7h7v7" />
      </Icon>
    ),
  },
  {
    href: "/goals",
    label: "Goals",
    icon: (
      <Icon>
        <circle cx="12" cy="12" r="9" />
        <circle cx="12" cy="12" r="5" />
        <circle cx="12" cy="12" r="1" />
      </Icon>
    ),
  },
  {
    href: "/import",
    label: "Import",
    icon: (
      <Icon>
        <path d="M12 3v12M7 10l5 5 5-5" />
        <path d="M5 21h14" />
      </Icon>
    ),
  },
  {
    href: "/rules",
    label: "Rules",
    icon: (
      <Icon>
        <path d="M4 6h16M4 12h10M4 18h6" />
      </Icon>
    ),
  },
  {
    href: "/accounts",
    label: "Accounts",
    icon: (
      <Icon>
        <rect x="3" y="6" width="18" height="13" rx="2" />
        <path d="M3 10h18" />
      </Icon>
    ),
  },
  {
    href: "/categories",
    label: "Categories",
    icon: (
      <Icon>
        <path d="M20 13l-7 7-9-9V4h7z" />
        <circle cx="8" cy="8" r="1" />
      </Icon>
    ),
  },
  {
    href: "/invite",
    label: "Invite",
    icon: (
      <Icon>
        <circle cx="9" cy="8" r="3.5" />
        <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
        <path d="M18 8v6M15 11h6" />
      </Icon>
    ),
  },
];

// Bottom bar on phones fits four destinations plus "More".
const PRIMARY_COUNT = 4;

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Dark left sidebar, shown from `lg` up. */
export function SidebarNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Main" className="flex flex-col gap-0.5">
      {ITEMS.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium no-underline hover:bg-chrome-raised hover:text-white ${
              active ? "bg-chrome-raised text-white" : "text-chrome-text"
            }`}
          >
            {item.icon}
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

/** Bottom tab bar, shown below `lg`. Overflow items live under "More". */
export function BottomNav({ logout }: { logout: ReactNode }) {
  const pathname = usePathname();
  const primary = ITEMS.slice(0, PRIMARY_COUNT);
  const more = ITEMS.slice(PRIMARY_COUNT);
  const moreActive = more.some((item) => isActive(pathname, item.href));

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t border-line bg-surface px-2 pt-1.5 pb-[max(env(safe-area-inset-bottom),0.5rem)] lg:hidden"
    >
      {primary.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`flex min-h-13 flex-col items-center justify-center gap-1 text-[11px] no-underline ${
              active ? "font-bold text-ink" : "font-semibold text-muted"
            }`}
          >
            {item.icon}
            {item.label}
          </Link>
        );
      })}

      <details className="group relative">
        <summary
          className={`flex min-h-13 cursor-pointer list-none flex-col items-center justify-center gap-1 text-[11px] [&::-webkit-details-marker]:hidden ${
            moreActive ? "font-bold text-ink" : "font-semibold text-muted"
          }`}
        >
          <Icon>
            <circle cx="5" cy="12" r="1.5" />
            <circle cx="12" cy="12" r="1.5" />
            <circle cx="19" cy="12" r="1.5" />
          </Icon>
          More
        </summary>
        <div className="absolute right-0 bottom-full mb-2 flex w-52 flex-col gap-0.5 rounded-[14px] border border-line bg-surface p-2 shadow-lg">
          {more.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm no-underline ${
                  active
                    ? "bg-page font-bold text-ink"
                    : "font-medium text-muted hover:bg-page"
                }`}
              >
                {item.icon}
                {item.label}
              </Link>
            );
          })}
          {logout}
        </div>
      </details>
    </nav>
  );
}
