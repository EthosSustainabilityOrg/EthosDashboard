'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

type OrgRoleId = 1 | 2 | 3;

type SidebarNavProps = {
  orgRoleId: OrgRoleId;
  unresolvedLogCount: number;
};

type NavItem = {
  label: string;
  href: string;
  leadOnly?: boolean;
  boardOnly?: boolean;
  isBoardPanel?: boolean;
};

const navItems: NavItem[] = [
  { label: 'Home', href: '/home' },
  { label: 'My Work', href: '/work' },
  { label: 'My Projects', href: '/my-projects' },
  { label: 'Open Calls', href: '/open-calls' },
  { label: 'My Files', href: '/files' },
  { label: 'Training', href: '/training' },
  { label: 'Directory', href: '/directory' },
  { label: 'Announcements', href: '/announcements' },
  { label: 'Fundraising', href: '/fundraising' },
  { label: 'Recents', href: '/recents' },
  { label: 'My Lead Projects', href: '/lead-projects', leadOnly: true },
  { label: 'Board Panel', href: '/board/overview', boardOnly: true, isBoardPanel: true },
];

function canShowItem(item: NavItem, orgRoleId: OrgRoleId) {
  if (item.boardOnly) return orgRoleId === 3;
  if (item.leadOnly) return orgRoleId >= 2;
  return true;
}

function isActive(pathname: string, href: string) {
  if (href === '/home') return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SidebarNav({ orgRoleId, unresolvedLogCount }: SidebarNavProps) {
  const pathname = usePathname();

  return (
    <div className="space-y-1">
      {navItems.filter((item) => canShowItem(item, orgRoleId)).map((item) => {
        const active = isActive(pathname, item.href);

        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition ${
              active
                ? 'bg-peach-light/20 text-peach'
                : item.isBoardPanel
                  ? 'bg-espresso/30 text-cream/80 hover:text-cream'
                  : 'text-cream/70 hover:bg-cream/10 hover:text-cream'
            }`}
          >
            <span
              className={`h-3 w-3 rounded-sm ${
                active ? 'bg-peach' : item.isBoardPanel ? 'bg-cream/50' : 'bg-cream/30'
              }`}
            />
            <span className="min-w-0 flex-1 truncate">{item.label}</span>

            {item.isBoardPanel && unresolvedLogCount > 0 ? (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1.5 text-xs font-bold text-white">
                {unresolvedLogCount > 99 ? '99+' : unresolvedLogCount}
              </span>
            ) : null}
          </Link>
        );
      })}
    </div>
  );
}
