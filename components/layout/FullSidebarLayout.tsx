'use client';

/**
 * The dashboard shell.
 *
 * MOBILE
 * The sidebar used to be a fixed `w-60` aside with no breakpoint, which took 240px of a
 * 375px phone and left the content 135px. Every dashboard page was unusable on a phone
 * regardless of its own classes, and the audience is 14 to 17 year olds, so phone is
 * likely the primary device.
 *
 * Below `md` the aside becomes an off-canvas drawer and a top bar carries the trigger.
 * At `md` and up the markup resolves back to exactly the previous layout: a static
 * `h-screen w-60` aside beside a scrolling main. Desktop is unchanged on purpose.
 *
 * The drawer closes on route change rather than on link click, so it does not need a
 * callback threaded through SidebarNav, and it also closes when navigation happens by
 * any other means.
 */

import type * as React from 'react';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { EthosLogo } from './EthosLogo';
import { SidebarNav } from './SidebarNav';

type OrgRoleId = 1 | 2 | 3;

type FullSidebarLayoutProps = {
  children: React.ReactNode;
  avatarSlot: React.ReactNode;
  orgRoleId: OrgRoleId;
  unresolvedLogCount: number;
  firstName: string;
  lastName: string;
  email?: string;
};

export function FullSidebarLayout({
  children,
  avatarSlot,
  orgRoleId,
  unresolvedLogCount,
  firstName,
  lastName,
  email,
}: FullSidebarLayoutProps) {
  const pathname = usePathname();

  // The open state records which route it was opened on, so "closed after navigation"
  // is derived rather than set from an effect. Closing in an effect on [pathname]
  // works but trips react-hooks/set-state-in-effect and causes a cascading render.
  const [drawer, setDrawer] = useState({ open: false, openedAt: pathname });
  const drawerOpen = drawer.open && drawer.openedAt === pathname;

  const setDrawerOpen = (open: boolean) => setDrawer({ open, openedAt: pathname });

  useEffect(() => {
    if (!drawerOpen) return;

    function handleKeyDown(event: KeyboardEvent) {
      // Functional update so the effect needs no dependency beyond drawerOpen.
      if (event.key === 'Escape') setDrawer((current) => ({ ...current, open: false }));
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [drawerOpen]);

  // Closed off-canvas also means invisible, so keyboard users cannot tab into links
  // that are translated off screen. At md the drawer classes stop applying.
  const drawerPosition = drawerOpen
    ? 'translate-x-0 visible'
    : '-translate-x-full invisible md:visible md:translate-x-0';

  return (
    <div className="flex min-h-screen bg-cream text-espresso">
      <header className="fixed inset-x-0 top-0 z-30 flex h-14 items-center gap-3 bg-espresso px-4 md:hidden">
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          aria-label="Open navigation"
          aria-expanded={drawerOpen}
          aria-controls="primary-sidebar"
          className="flex h-9 w-9 items-center justify-center rounded-md text-cream ring-1 ring-cream/20"
        >
          <svg
            aria-hidden="true"
            className="h-5 w-5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>

        <EthosLogo variant="dark" size="sm" />
      </header>

      {drawerOpen ? (
        <button
          type="button"
          onClick={() => setDrawerOpen(false)}
          aria-label="Close navigation"
          className="fixed inset-0 z-30 bg-espresso/60 md:hidden"
        />
      ) : null}

      <aside
        id="primary-sidebar"
        className={`fixed inset-y-0 left-0 z-40 flex w-60 shrink-0 flex-col overflow-y-auto bg-espresso text-cream transition-transform duration-200 md:static md:h-screen md:translate-x-0 md:transition-none ${drawerPosition}`}
      >
        <div className="flex items-center justify-between px-5 py-5">
          <EthosLogo variant="dark" size="md" />

          <button
            type="button"
            onClick={() => setDrawerOpen(false)}
            aria-label="Close navigation"
            className="flex h-8 w-8 items-center justify-center rounded-md text-cream ring-1 ring-cream/20 md:hidden"
          >
            <svg
              aria-hidden="true"
              className="h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <nav className="flex-1 px-3 py-4" aria-label="Primary navigation">
          <SidebarNav orgRoleId={orgRoleId} unresolvedLogCount={unresolvedLogCount} />
        </nav>

        <div className="border-t border-cream/10 px-4 py-4">
          <div className="mb-4 flex h-9 w-9 items-center justify-center rounded-full text-cream ring-1 ring-cream/20">
            <svg
              aria-label="Notifications"
              className="h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
          </div>

          <div className="flex items-center gap-3">
            {avatarSlot}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-cream">
                {firstName} {lastName}
              </p>
              {email ? <p className="truncate text-xs text-cream/60">{email}</p> : null}
            </div>
          </div>
        </div>
      </aside>

      <main className="min-h-screen flex-1 overflow-y-auto bg-cream pt-14 md:h-screen md:min-h-0 md:pt-0">
        {children}
      </main>
    </div>
  );
}
