import type { Announcement } from '@/types/announcements';
import { formatDate } from '@/lib/format-date';

type AnnouncementCardProps = {
  announcement: Announcement;
};

function formatDateTime(value: string) {
  return formatDate(new Date(value), {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function AnnouncementCard({ announcement }: AnnouncementCardProps) {
  return (
    <article className="rounded-xl border border-sand bg-cream p-5">
      <div className="mb-3 flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
        <p className="font-medium text-espresso">
          {announcement.posted_by_slack_user ?? 'Ethos'}
        </p>
        <p className="text-xs text-warm-gray">{formatDateTime(announcement.posted_at)}</p>
      </div>

      <p className="whitespace-pre-wrap text-sm leading-6 text-brown-mid">
        {announcement.content}
      </p>
    </article>
  );
}
