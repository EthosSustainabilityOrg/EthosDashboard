'use client';

import { useMemo, useState } from 'react';
import type { Badge } from '@/types/badges';
import { Badge as BadgePill } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { CreateBadgeSheet } from '@/components/board/badges/CreateBadgeSheet';

type BadgeFilter = 'All' | 'Participation' | 'Achievement';

export type ManagedBadge = Badge & {
  project_name: string | null;
};

type ProjectOption = {
  project_id: string;
  name: string;
};

type BadgeManagementProps = {
  badges: ManagedBadge[];
  projects: ProjectOption[];
};

const filters: BadgeFilter[] = ['All', 'Participation', 'Achievement'];

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(value));
}

function categoryVariant(category: ManagedBadge['badge_category']) {
  return category === 'Participation' ? 'info' : 'peach';
}

function BadgeRow({ badge }: { badge: ManagedBadge }) {
  return (
    <article className="flex items-center gap-4 border-b border-sand px-5 py-4 last:border-b-0">
      {badge.image_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={badge.image_url}
          alt=""
          className="h-8 w-8 shrink-0 rounded-md border border-sand object-cover"
        />
      ) : null}

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-medium text-espresso">{badge.name}</h3>
          <BadgePill label={badge.badge_category} variant={categoryVariant(badge.badge_category)} />
        </div>
        {badge.badge_category === 'Participation' && badge.project_name ? (
          <p className="mt-1 text-sm text-warm-gray">{badge.project_name}</p>
        ) : null}
        {badge.description ? (
          <p className="mt-1 truncate text-sm text-warm-gray">{badge.description}</p>
        ) : null}
        <p className="mt-1 text-xs text-warm-gray">Created {formatDate(badge.created_at)}</p>
      </div>
    </article>
  );
}

function BadgeSection({ title, badges }: { title: string; badges: ManagedBadge[] }) {
  return (
    <section className="rounded-xl border border-sand bg-cream">
      <div className="border-b border-sand px-5 py-4">
        <h2 className="text-lg font-semibold text-espresso">{title}</h2>
      </div>

      {badges.length > 0 ? (
        badges.map((badge) => <BadgeRow key={badge.badge_id} badge={badge} />)
      ) : (
        <p className="px-5 py-10 text-center text-sm text-warm-gray">No badges found</p>
      )}
    </section>
  );
}

export function BadgeManagement({ badges, projects }: BadgeManagementProps) {
  const [localBadges, setLocalBadges] = useState(badges);
  const [createSheetOpen, setCreateSheetOpen] = useState(false);
  const [filter, setFilter] = useState<BadgeFilter>('All');

  const participationBadges = useMemo(
    () => localBadges.filter((badge) => badge.badge_category === 'Participation'),
    [localBadges],
  );
  const achievementBadges = useMemo(
    () => localBadges.filter((badge) => badge.badge_category === 'Achievement'),
    [localBadges],
  );
  const filteredBadges = useMemo(
    () =>
      filter === 'All'
        ? localBadges
        : localBadges.filter((badge) => badge.badge_category === filter),
    [localBadges, filter],
  );

  function handleCreated(badge: ManagedBadge) {
    setLocalBadges((current) => [badge, ...current]);
    setCreateSheetOpen(false);
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <h1 className="text-2xl font-bold text-espresso">Badges</h1>
        <Button variant="primary" onClick={() => setCreateSheetOpen(true)}>
          New Badge
        </Button>
      </header>

      <div className="flex flex-wrap gap-2">
        {filters.map((item) => (
          <Chip key={item} label={item} active={filter === item} onClick={() => setFilter(item)} />
        ))}
      </div>

      {filter === 'All' ? (
        <div className="space-y-6">
          <BadgeSection title="Participation Badges" badges={participationBadges} />
          <BadgeSection title="Achievement Badges" badges={achievementBadges} />
        </div>
      ) : (
        <BadgeSection title={`${filter} Badges`} badges={filteredBadges} />
      )}

      {createSheetOpen ? (
        <CreateBadgeSheet
          projects={projects}
          onClose={() => setCreateSheetOpen(false)}
          onCreated={handleCreated}
        />
      ) : null}
    </div>
  );
}
