'use client';

import { useMemo, useState } from 'react';
import type { Announcement } from '@/types/announcements';
import { AnnouncementCard } from '@/components/announcements/AnnouncementCard';
import { Input } from '@/components/ui/Input';

type AnnouncementsFeedProps = {
  announcements: Announcement[];
  lastSyncedAt: string | null;
};

function relativeTime(value: string | null) {
  if (!value) return 'Never synced';

  const diffMs = Date.now() - new Date(value).getTime();
  const minutes = Math.max(0, Math.floor(diffMs / 60000));

  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;

  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

export function AnnouncementsFeed({ announcements, lastSyncedAt }: AnnouncementsFeedProps) {
  const [search, setSearch] = useState('');

  const filteredAnnouncements = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return announcements;

    return announcements.filter((announcement) =>
      announcement.content.toLowerCase().includes(term),
    );
  }, [announcements, search]);

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-espresso">Announcements</h1>
          <p className="mt-2 text-sm text-warm-gray">Read-only updates from Ethos Slack.</p>
        </div>
        <p className="text-sm text-warm-gray">Last synced {relativeTime(lastSyncedAt)}</p>
      </header>

      <Input
        value={search}
        onChange={setSearch}
        ariaLabel="Search announcements"
        placeholder="Search announcements..."
        name="announcement-search"
      />

      {filteredAnnouncements.length > 0 ? (
        <section className="space-y-4">
          {filteredAnnouncements.map((announcement) => (
            <AnnouncementCard key={announcement.announcement_id} announcement={announcement} />
          ))}
        </section>
      ) : (
        <p className="rounded-xl border border-sand bg-cream px-5 py-12 text-center text-sm text-warm-gray">
          No announcements yet.
        </p>
      )}
    </div>
  );
}
