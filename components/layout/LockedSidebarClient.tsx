'use client';

import type * as React from 'react';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';
import { LockedSidebarLayout } from './LockedSidebarLayout';
import { ProfileAvatarButton } from './ProfileAvatarButton';

type LockedSidebarClientProps = {
  children: React.ReactNode;
  firstName: string;
  lastName: string;
};

export function LockedSidebarClient({
  children,
  firstName,
  lastName,
}: LockedSidebarClientProps) {
  const router = useRouter();
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  async function handleLogOut() {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
    );
    await supabase.auth.signOut();
    router.push('/login');
  }

  return (
    <LockedSidebarLayout
      avatarSlot={
        <div ref={menuRef} className="relative">
          {showMenu ? (
            <div className="absolute bottom-full left-0 z-50 mb-2 w-36 rounded-lg border border-sand bg-cream p-2 shadow-lg">
              <button
                type="button"
                onClick={() => {
                  setShowMenu(false);
                  void handleLogOut();
                }}
                className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-espresso hover:bg-sand/40 hover:text-red-600"
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
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" y1="12" x2="9" y2="12" />
                </svg>
                Log out
              </button>
            </div>
          ) : null}

          <ProfileAvatarButton
            firstName={firstName}
            lastName={lastName}
            ariaLabel="Account menu"
            onClick={() => setShowMenu((current) => !current)}
          />
        </div>
      }
    >
      {children}
    </LockedSidebarLayout>
  );
}
