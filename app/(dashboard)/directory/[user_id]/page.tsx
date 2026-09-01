import Link from 'next/link';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { createServerClient } from '@supabase/ssr';
import type { ApiResponse } from '@/types/api';
import type { Badge as BadgeType } from '@/types/badges';
import type { OrgRoleId } from '@/types/auth';
import { BoardProfileActions } from '@/components/directory/BoardProfileActions';
import { Badge } from '@/components/ui/Badge';
import { Tag } from '@/components/ui/Tag';
import { formatDate as formatOrgDate } from '@/lib/format-date';

type DirectoryBadge = {
  badge_id: string;
  name: string;
  badge_category: 'Participation' | 'Achievement';
  description?: string | null;
  awarded_at: string;
};

type ProjectHistory = {
  project_id: string;
  project_name: string;
  chapter_name: string;
  type_name: string;
  approved_at: string;
};

type UserProfileResponse = {
  user_id: string;
  first_name: string;
  last_name: string;
  org_role_name: string;
  chapter_name: string;
  bio: string | null;
  badges: DirectoryBadge[];
  project_history: ProjectHistory[];
};

type BoardMemberRow = {
  user_id: string;
  first_name: string;
  last_name: string;
  org_role_id: OrgRoleId;
  chapter_id: string;
};

type BoardFlagRow = {
  flag_id: string;
  reason: string | null;
  resolved: boolean;
  created_at: string;
  projects: { name: string } | { name: string }[] | null;
  flagged_by_user:
    | { first_name: string; last_name: string }
    | { first_name: string; last_name: string }[]
    | null;
};

type DirectoryProfilePageProps = {
  params: Promise<{
    user_id: string;
  }>;
};

function roleBadgeVariant(roleName: string) {
  if (roleName === 'Board') return 'peach';
  if (roleName === 'Project Lead') return 'info';
  return 'neutral';
}

function projectTagColor(typeName: string) {
  if (typeName === 'Event') return 'green';
  if (typeName === 'Campaign') return 'peach';
  if (typeName === 'Program') return 'blue';
  return 'sand';
}

function formatDate(value: string) {
  return formatOrgDate(new Date(value), {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function getVotySubtitle(badges: DirectoryBadge[]) {
  const votyBadge = badges.find((badge) =>
    /voty|volunteer of the year/i.test(badge.name),
  );

  if (!votyBadge) return null;

  const yearMatch = votyBadge.name.match(/'?\d{2,4}/);
  return yearMatch ? `Volunteer of the Year ${yearMatch[0]}` : 'Volunteer of the Year';
}

function BadgeList({ badges }: { badges: DirectoryBadge[] }) {
  if (badges.length === 0) {
    return <p className="text-sm text-warm-gray">None yet</p>;
  }

  return (
    <div className="grid gap-3 md:grid-cols-2">
      {badges.map((badge) => (
        <article key={badge.badge_id} className="rounded-xl border border-sand bg-cream p-4">
          <h3 className="font-semibold text-espresso">{badge.name}</h3>
          {badge.description ? (
            <p className="mt-2 text-sm text-warm-gray">{badge.description}</p>
          ) : null}
          <p className="mt-3 text-xs text-warm-gray">Awarded {formatDate(badge.awarded_at)}</p>
        </article>
      ))}
    </div>
  );
}

export default async function DirectoryProfilePage({ params }: DirectoryProfilePageProps) {
  const { user_id: userId } = await params;
  const cookieStore = await cookies();
  const headerStore = await headers();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll() {
          return;
        },
      },
    },
  );

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    redirect('/login');
  }

  const protocol = headerStore.get('x-forwarded-proto') ?? 'http';
  const host = headerStore.get('host');

  if (!host) {
    redirect('/directory');
  }

  const profileResponse = await fetch(`${protocol}://${host}/api/users/${userId}`, {
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
    cache: 'no-store',
  });

  const profileBody = (await profileResponse.json()) as ApiResponse<UserProfileResponse>;

  if (!profileBody.data) {
    redirect('/directory');
  }

  const profile = profileBody.data;
  const { data: viewerData } = await supabase
    .from('users')
    .select('org_role_id')
    .eq('user_id', session.user.id)
    .single();

  const isBoard = viewerData?.org_role_id === 3;
  const participationBadges = profile.badges.filter(
    (badge) => badge.badge_category === 'Participation',
  );
  const achievementBadges = profile.badges.filter(
    (badge) => badge.badge_category === 'Achievement',
  );
  const votySubtitle = getVotySubtitle(profile.badges);

  const [memberResult, achievementBadgesResult, flagsResult] = isBoard
    ? await Promise.all([
        supabase
          .from('users')
          .select('user_id, first_name, last_name, org_role_id, chapter_id')
          .eq('user_id', userId)
          .maybeSingle(),
        supabase
          .from('badges')
          .select('*')
          .eq('badge_category', 'Achievement')
          .order('created_at', { ascending: false }),
        supabase
          .from('volunteer_flags')
          .select(`
            flag_id,
            reason,
            resolved,
            created_at,
            projects(name),
            flagged_by_user:users!volunteer_flags_flagged_by_fkey(first_name, last_name)
          `)
          .eq('user_id', userId)
          .order('created_at', { ascending: false }),
      ])
    : [null, null, null];

  const boardMember = memberResult?.data
    ? {
        ...((memberResult.data) as BoardMemberRow),
        org_role_name: profile.org_role_name,
        chapter_name: profile.chapter_name,
      }
    : null;

  return (
    <div className="mx-auto w-full max-w-5xl px-8 py-10">
      <Link
        href="/directory"
        className="mb-8 inline-flex h-10 items-center justify-center rounded-md bg-transparent px-4 text-sm font-semibold text-espresso transition hover:bg-sand"
      >
        Back
      </Link>

      <header className="mb-8">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-bold text-espresso">
            {profile.first_name} {profile.last_name}
          </h1>
          <Badge label={profile.org_role_name} variant={roleBadgeVariant(profile.org_role_name)} />
        </div>
        {votySubtitle ? (
          <p className="mt-2 text-sm italic text-warm-gray">{votySubtitle}</p>
        ) : null}
        <p className="mt-2 text-sm text-warm-gray">{profile.chapter_name}</p>
        {boardMember ? (
          <BoardProfileActions
            isBoard={isBoard}
            member={boardMember}
            achievementBadges={(achievementBadgesResult?.data ?? []) as BadgeType[]}
          />
        ) : null}
      </header>

      <section className="mb-8 rounded-xl border border-sand bg-cream p-5">
        <h2 className="mb-3 text-lg font-bold text-espresso">Bio</h2>
        {profile.bio ? (
          <p className="text-sm leading-6 text-brown-mid">{profile.bio}</p>
        ) : (
          <p className="text-sm italic text-warm-gray">No bio added yet</p>
        )}
      </section>

      <section className="mb-8">
        <h2 className="mb-4 text-lg font-bold text-espresso">Project history</h2>
        {profile.project_history.length > 0 ? (
          <div className="space-y-3">
            {profile.project_history.map((project) => (
              <Link
                key={`${project.project_id}-${project.approved_at}`}
                href={`/projects/${project.project_id}`}
                className="flex items-center gap-4 rounded-xl border border-sand bg-cream p-4 transition hover:shadow-md"
              >
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold text-espresso">{project.project_name}</h3>
                  <p className="mt-1 text-sm text-warm-gray">
                    {project.chapter_name} · Since {formatDate(project.approved_at)}
                  </p>
                </div>
                <Tag label={project.type_name} color={projectTagColor(project.type_name)} />
              </Link>
            ))}
          </div>
        ) : (
          <p className="text-sm text-warm-gray">No project history yet</p>
        )}
      </section>

      <section className="mb-8">
        <h2 className="mb-4 text-lg font-bold text-espresso">Participation badges</h2>
        <BadgeList badges={participationBadges} />
      </section>

      <section>
        <h2 className="mb-4 text-lg font-bold text-espresso">Achievement badges</h2>
        <BadgeList badges={achievementBadges} />
      </section>

      {isBoard ? (
        <section className="mt-8">
          <h2 className="mb-4 text-lg font-bold text-espresso">Flag history</h2>
          {(flagsResult?.data ?? []).length > 0 ? (
            <div className="space-y-3">
              {((flagsResult?.data ?? []) as BoardFlagRow[]).map((flag) => {
                const project = Array.isArray(flag.projects) ? flag.projects[0] : flag.projects;
                const lead = Array.isArray(flag.flagged_by_user)
                  ? flag.flagged_by_user[0]
                  : flag.flagged_by_user;

                return (
                  <article key={flag.flag_id} className="rounded-xl border border-sand bg-cream p-4">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="font-semibold text-espresso">
                          {project?.name ?? 'Unknown project'}
                        </p>
                        <p className="mt-1 text-sm text-warm-gray">
                          Flagged by {lead ? `${lead.first_name} ${lead.last_name}` : 'Unknown lead'} ·{' '}
                          {formatDate(flag.created_at)}
                        </p>
                      </div>
                      <Badge
                        label={flag.resolved ? 'Resolved' : 'Unresolved'}
                        variant={flag.resolved ? 'success' : 'peach'}
                      />
                    </div>
                    {flag.reason ? (
                      <p className="mt-3 rounded-lg bg-sand/40 p-3 text-sm text-espresso">
                        {flag.reason}
                      </p>
                    ) : null}
                  </article>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-warm-gray">No flags recorded</p>
          )}
        </section>
      ) : null}
    </div>
  );
}
