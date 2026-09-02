'use client';

import { useEffect, useMemo, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import type { Badge } from '@/types/badges';
import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/Textarea';

type Volunteer = {
  user_id: string;
  first_name: string;
  last_name: string;
};

type AwardBadgeSheetProps = {
  projectId?: string;
  volunteer: Volunteer;
  badgeFilter?: 'Participation' | 'Achievement';
  onClose: () => void;
  onAwarded: () => void;
};

type BadgesResponse = {
  data: Badge[] | { badges: Badge[] } | null;
  error: { message: string } | null;
};

function extractBadges(data: BadgesResponse['data']): Badge[] {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  return data.badges;
}

export function AwardBadgeSheet({
  projectId,
  volunteer,
  badgeFilter = 'Participation',
  onClose,
  onAwarded,
}: AwardBadgeSheetProps) {
  const [badges, setBadges] = useState<Badge[]>([]);
  const [selectedBadgeId, setSelectedBadgeId] = useState('');
  const [note, setNote] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const supabase = useMemo(
    () =>
      createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
      ),
    [],
  );

  async function getAuthHeaders() {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    return {
      'Content-Type': 'application/json',
      ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
    };
  }

  useEffect(() => {
    let isMounted = true;

    async function loadBadges() {
      setIsLoading(true);
      setError(null);

      const headers = await getAuthHeaders();
      const response = await fetch('/api/badges', { headers });
      const body = (await response.json()) as BadgesResponse;

      if (!isMounted) return;

      if (!response.ok || body.error) {
        setError(body.error?.message ?? 'Unable to load badges.');
        setIsLoading(false);
        return;
      }

      const allBadges = extractBadges(body.data);
      setBadges(
        badgeFilter === 'Achievement'
          ? allBadges.filter((badge) => badge.badge_category === 'Achievement')
          : allBadges.filter(
              (badge) => badge.badge_category === 'Participation' && badge.project_id === projectId,
            ),
      );
      setIsLoading(false);
    }

    loadBadges();

    return () => {
      isMounted = false;
    };
  }, [badgeFilter, projectId]);

  async function handleAward() {
    if (!selectedBadgeId) return;

    setIsSaving(true);
    setError(null);

    const headers = await getAuthHeaders();

    const response = await fetch(`/api/badges/${selectedBadgeId}/award`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        user_id: volunteer.user_id,
        note: note.trim() || null,
      }),
    });

    const body = (await response.json()) as { error: { message: string } | null };

    setIsSaving(false);

    if (!response.ok || body.error) {
      setError(body.error?.message ?? 'Unable to award badge.');
      return;
    }

    onAwarded();
    onClose();
  }

  return (
    <>
      <button
        type="button"
        aria-label="Close award badge sheet"
        className="fixed inset-0 z-40 bg-espresso/20"
        onClick={onClose}
      />
      <section className="fixed bottom-0 left-0 right-0 z-50 max-h-[80vh] overflow-y-auto rounded-t-2xl bg-cream p-6 shadow-lg">
        <div className="mx-auto max-w-2xl">
          <div className="mb-6 flex items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold text-espresso">Award Badge</h2>
              <p className="mt-1 text-sm text-warm-gray">
                {volunteer.first_name} {volunteer.last_name}
              </p>
            </div>
            <button type="button" aria-label="Close" className="text-2xl leading-none text-warm-gray" onClick={onClose}>
              x
            </button>
          </div>

          {isLoading ? <p className="text-sm text-warm-gray">Loading badges...</p> : null}

          {!isLoading && badges.length === 0 ? (
            <p className="rounded-xl border border-sand bg-sand/30 p-4 text-sm text-warm-gray">
              {badgeFilter === 'Achievement'
                ? 'No achievement badges have been created yet.'
                : 'No participation badges have been created for this project. Contact the Board to set one up.'}
            </p>
          ) : null}

          {!isLoading && badges.length > 0 ? (
            <div className="space-y-3">
              {badges.map((badge) => {
                const isSelected = selectedBadgeId === badge.badge_id;

                return (
                  <button
                    key={badge.badge_id}
                    type="button"
                    className={`flex w-full items-start gap-3 rounded-xl border p-4 text-left transition ${
                      isSelected
                        ? 'border-peach bg-peach-light'
                        : 'border-sand bg-cream hover:bg-sand/30'
                    }`}
                    onClick={() => setSelectedBadgeId(badge.badge_id)}
                  >
                    <span
                      className={`mt-1 h-4 w-4 rounded-full border ${
                        isSelected ? 'border-espresso bg-peach' : 'border-sand bg-cream'
                      }`}
                    />
                    <span>
                      <span className="block font-semibold text-espresso">{badge.name}</span>
                      {badge.description ? (
                        <span className="mt-1 block text-sm text-warm-gray">{badge.description}</span>
                      ) : null}
                    </span>
                  </button>
                );
              })}

              <Textarea label="Note" value={note} onChange={setNote} name="badge-note" rows={4} />
            </div>
          ) : null}

          {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}

          <div className="mt-6 flex justify-end gap-3">
            <Button variant="ghost" onClick={onClose} disabled={isSaving}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleAward}
              disabled={!selectedBadgeId || isSaving}
            >
              {isSaving ? 'Awarding...' : 'Award Badge'}
            </Button>
          </div>
        </div>
      </section>
    </>
  );
}
