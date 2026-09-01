import type { ProjectUpdate } from '@/types/project-updates';
import { formatDate } from '@/lib/format-date';

type ProjectUpdatesTabProps = {
  updates: ProjectUpdate[];
  slackChannelId: string | null;
};

function formatTimestamp(value: string) {
  return formatDate(new Date(value), {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function sortUpdates(updates: ProjectUpdate[]) {
  return [...updates].sort((a, b) => a.posted_at.localeCompare(b.posted_at));
}

function SlackLink({ slackChannelId }: { slackChannelId: string | null }) {
  if (!slackChannelId) return null;

  return (
    <a
      href={`https://slack.com/app_redirect?channel=${slackChannelId}`}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex h-11 items-center justify-center rounded-md bg-espresso px-4 text-sm font-semibold text-cream transition hover:bg-brown-dark"
    >
      Open in Slack
    </a>
  );
}

export function ProjectUpdatesTab({ updates, slackChannelId }: ProjectUpdatesTabProps) {
  const sortedUpdates = sortUpdates(updates);

  return (
    <div>
      {sortedUpdates.length > 0 ? (
        <div className="rounded-xl border border-sand bg-cream p-5">
          <div className="space-y-5">
            {sortedUpdates.map((update) => (
              <article key={update.update_id}>
                <div className="flex items-baseline justify-between gap-4">
                  <h2 className="font-medium text-espresso">{update.posted_by_slack_user}</h2>
                  <time className="text-xs text-warm-gray">{formatTimestamp(update.posted_at)}</time>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-warm-gray">
                  {update.content}
                </p>
              </article>
            ))}
          </div>

          <div className="mt-6">
            <SlackLink slackChannelId={slackChannelId} />
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-sand bg-cream p-8 text-center">
          <p className="text-sm text-warm-gray">
            No updates yet. Head to Slack to start the conversation.
          </p>
          <div className="mt-5">
            <SlackLink slackChannelId={slackChannelId} />
          </div>
        </div>
      )}
    </div>
  );
}
