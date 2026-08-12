'use client';

import type * as React from 'react';
import Image from 'next/image';

type LockedSidebarLayoutProps = {
  children: React.ReactNode;
  avatarSlot: React.ReactNode;
};

export function LockedSidebarLayout({ children, avatarSlot }: LockedSidebarLayoutProps) {
  return (
    <div className="flex min-h-screen bg-cream text-espresso">
      <aside className="flex h-screen w-16 shrink-0 flex-col items-center bg-espresso">
        <div className="flex w-full justify-center px-3 py-5">
          <Image
            src="/ethos-logo-insignia.png"
            alt="Ethos Sustainability"
            width={32}
            height={32}
            className="h-8 w-8 object-contain"
            priority
          />
        </div>

        <div className="mt-auto flex w-full justify-center px-3 py-5">{avatarSlot}</div>
      </aside>

      <main className="h-screen flex-1 overflow-y-auto bg-cream">{children}</main>
    </div>
  );
}
