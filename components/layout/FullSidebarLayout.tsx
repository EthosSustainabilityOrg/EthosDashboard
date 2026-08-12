'use client';

import type * as React from 'react';
import { EthosLogo } from './EthosLogo';
import { SidebarNav } from './SidebarNav';

type OrgRoleId = 1 | 2 | 3;

type FullSidebarLayoutProps = {
  children: React.ReactNode;
  avatarSlot: React.ReactNode;
  orgRoleId: OrgRoleId;
  unresolvedLogCount: number;
};

export function FullSidebarLayout({
  children,
  avatarSlot,
  orgRoleId,
  unresolvedLogCount,
}: FullSidebarLayoutProps) {
  return (
    <div className="flex min-h-screen bg-cream text-espresso">
      <aside className="flex h-screen w-60 shrink-0 flex-col bg-espresso text-cream">
        <div className="px-5 py-5">
          <EthosLogo variant="dark" size="md" />
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

          {avatarSlot}
        </div>
      </aside>

      <main className="h-screen flex-1 overflow-y-auto bg-cream">{children}</main>
    </div>
  );
}
