'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { createBrowserClient } from '@supabase/ssr';
import type { ApiResponse } from '@/types/api';
import type { Onboarding, OrientationProgress } from '@/types/onboarding';
import { Button } from '@/components/ui/Button';

type OrientationPlayerProps = {
  initialProgress: OrientationProgress;
};

type ChapterKey = keyof OrientationProgress;

type Chapter = {
  key: ChapterKey;
  title: string;
};

const chapters: Chapter[] = [
  { key: 'welcome', title: 'Welcome to Ethos' },
  { key: 'safety', title: 'Project safety' },
  { key: 'how_we_work', title: 'How we work' },
  { key: 'faqs', title: 'FAQs' },
];

function findFirstIncomplete(progress: OrientationProgress) {
  return chapters.find((chapter) => !progress[chapter.key]) ?? chapters[0];
}

function isComplete(progress: OrientationProgress) {
  return chapters.every((chapter) => progress[chapter.key]);
}

function CheckIcon({ completed }: { completed: boolean }) {
  if (completed) {
    return (
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-green-500 text-xs font-bold text-cream">
        ✓
      </span>
    );
  }

  return <span className="h-5 w-5 rounded-full border border-sand" aria-hidden="true" />;
}

export function OrientationPlayer({ initialProgress }: OrientationPlayerProps) {
  const [progress, setProgress] = useState(initialProgress);
  const [activeChapter, setActiveChapter] = useState<ChapterKey>(
    findFirstIncomplete(initialProgress).key,
  );
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  const supabase = useMemo(
    () =>
      createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
      ),
    [],
  );

  const active = chapters.find((chapter) => chapter.key === activeChapter) ?? chapters[0];
  const completedAll = isComplete(progress);

  async function markComplete() {
    setError('');
    setIsSaving(true);

    const {
      data: { session },
    } = await supabase.auth.getSession();

    const response = await fetch('/api/onboarding/orientation-progress', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
      },
      body: JSON.stringify({
        chapter: active.key,
        completed: true,
      }),
    });

    const body = (await response.json()) as ApiResponse<Onboarding>;

    if (!response.ok || body.error) {
      setError(body.error?.message ?? 'Progress could not be saved.');
      setIsSaving(false);
      return;
    }

    const nextProgress = body.data.orientation_progress ?? {
      ...progress,
      [active.key]: true,
    };

    setProgress(nextProgress);

    const nextChapter = findFirstIncomplete(nextProgress);
    if (!isComplete(nextProgress)) {
      setActiveChapter(nextChapter.key);
    }

    setIsSaving(false);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
      <aside className="rounded-xl border border-sand bg-cream p-3">
        {chapters.map((chapter) => {
          const completed = progress[chapter.key];
          const isActive = chapter.key === activeChapter;

          return (
            <button
              key={chapter.key}
              type="button"
              onClick={() => setActiveChapter(chapter.key)}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left transition ${
                isActive ? 'bg-peach-light' : 'hover:bg-sand/40'
              }`}
            >
              <CheckIcon completed={completed} />
              <span className="text-sm font-semibold text-espresso">{chapter.title}</span>
            </button>
          );
        })}
      </aside>

      <section>
        {/* VIDEO_URL placeholder */}
        <div className="flex aspect-video items-center justify-center rounded-xl bg-sand">
          <h2 className="text-xl font-semibold text-warm-gray">{active.title}</h2>
        </div>

        <div className="mt-5 flex items-center justify-between gap-4">
          <div>
            <h3 className="font-semibold text-espresso">{active.title}</h3>
            <p className="mt-1 text-sm text-warm-gray">
              Watch the chapter, then mark it complete when you&apos;re ready.
            </p>
          </div>

          {completedAll ? (
            <Link
              href="/pending"
              className="inline-flex h-11 items-center justify-center rounded-md bg-peach px-4 text-sm font-semibold text-espresso transition hover:bg-peach-light"
            >
              Return to checklist
            </Link>
          ) : (
            <Button onClick={markComplete} disabled={isSaving || progress[active.key]}>
              {progress[active.key] ? 'Completed' : isSaving ? 'Saving...' : 'Mark as complete'}
            </Button>
          )}
        </div>

        {error ? <p className="mt-4 text-sm text-red-500">{error}</p> : null}
      </section>
    </div>
  );
}
