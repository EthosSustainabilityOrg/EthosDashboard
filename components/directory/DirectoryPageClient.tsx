'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';
import type { ApiResponse } from '@/types/api';
import type { Chapter } from '@/types/chapters';
import { DirectoryFilters } from '@/components/directory/DirectoryFilters';
import { MemberListItem } from '@/components/directory/MemberListItem';
import { Button } from '@/components/ui/Button';

type RoleFilter = '' | '1' | '2' | '3';

type DirectoryResponseMember = {
  user_id: string;
  first_name: string;
  last_name: string;
  org_role_id: number;
  chapter_id: string;
  onboarding_complete: boolean;
  created_at: string;
  updated_at: string;
};

type DirectoryMember = DirectoryResponseMember & {
  org_role_name: string;
  chapter_name: string;
};

type DirectoryResponse = {
  members: DirectoryResponseMember[];
  total: number;
  page: number;
  per_page: number;
};

type ChaptersResponse = {
  chapters: Pick<Chapter, 'chapter_id' | 'name' | 'is_hq' | 'location'>[];
};

type UserProfileResponse = {
  badges: Array<{ badge_id: string }>;
};

type DirectoryPageClientProps = {
  isBoard: boolean;
};

function roleNameFromId(roleId: number) {
  if (roleId === 3) return 'Board';
  if (roleId === 2) return 'Project Lead';
  return 'Member';
}

function matchesSearch(member: DirectoryMember, search: string) {
  const term = search.trim().toLowerCase();
  if (!term) return true;

  return `${member.first_name} ${member.last_name}`.toLowerCase().includes(term);
}

export function DirectoryPageClient({ isBoard }: DirectoryPageClientProps) {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('');
  const [chapterFilter, setChapterFilter] = useState('');
  const [members, setMembers] = useState<DirectoryMember[]>([]);
  const [chapters, setChapters] = useState<ChaptersResponse['chapters']>([]);
  const [badgeCounts, setBadgeCounts] = useState<Record<string, number>>({});
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  const supabase = useMemo(
    () =>
      createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
      ),
    [],
  );

  async function loadMembers(nextPage: number, append: boolean) {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    const headers = session?.access_token
      ? { Authorization: `Bearer ${session.access_token}` }
      : undefined;

    const params = new URLSearchParams({
      page: String(nextPage),
      per_page: '50',
    });

    const [directoryResponse, chaptersResponse] = await Promise.all([
      fetch(`/api/users/directory?${params.toString()}`, { headers }),
      fetch('/api/chapters', { headers }),
    ]);

    const directoryBody = (await directoryResponse.json()) as ApiResponse<DirectoryResponse>;
    const chaptersBody = (await chaptersResponse.json()) as ApiResponse<ChaptersResponse>;
    const chapterList = chaptersBody.data?.chapters ?? [];

    setChapters(chapterList);
    setTotal(directoryBody.data?.total ?? 0);

    const chapterNames = new Map(chapterList.map((chapter) => [chapter.chapter_id, chapter.name]));
    const resolvedMembers = (directoryBody.data?.members ?? []).map((member) => ({
      ...member,
      org_role_name: roleNameFromId(member.org_role_id),
      chapter_name: chapterNames.get(member.chapter_id) ?? 'Ethos',
    }));

    setMembers((current) => (append ? [...current, ...resolvedMembers] : resolvedMembers));

    const profileResponses = await Promise.all(
      resolvedMembers.map((member) =>
        fetch(`/api/users/${member.user_id}`, { headers }),
      ),
    );

    const profileBodies = await Promise.all(
      profileResponses.map((response) => response.json() as Promise<ApiResponse<UserProfileResponse>>),
    );

    setBadgeCounts((current) => {
      const next = { ...current };

      resolvedMembers.forEach((member, index) => {
        next[member.user_id] = profileBodies[index].data?.badges.length ?? 0;
      });

      return next;
    });
  }

  useEffect(() => {
    void loadMembers(1, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  const filteredMembers = members.filter((member) => {
    const roleMatches = roleFilter === '' || String(member.org_role_id) === roleFilter;
    const chapterMatches = !isBoard || chapterFilter === '' || member.chapter_id === chapterFilter;

    return roleMatches && chapterMatches && matchesSearch(member, search);
  });

  const canLoadMore = members.length < total;

  return (
    <div className="mx-auto w-full max-w-6xl px-8 py-10">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-espresso">Directory</h1>
      </header>

      <div className="mb-6">
        <DirectoryFilters
          search={search}
          onSearchChange={setSearch}
          roleFilter={roleFilter}
          onRoleFilterChange={setRoleFilter}
          isBoard={isBoard}
          chapterFilter={chapterFilter}
          onChapterFilterChange={setChapterFilter}
          chapters={chapters}
        />
      </div>

      <section className="rounded-xl border border-sand bg-cream">
        {filteredMembers.length > 0 ? (
          filteredMembers.map((member) => (
            <MemberListItem
              key={member.user_id}
              member={member}
              badgeCount={badgeCounts[member.user_id] ?? 0}
              onClick={() => router.push(`/directory/${member.user_id}`)}
            />
          ))
        ) : (
          <p className="px-5 py-16 text-center text-sm text-warm-gray">No members found</p>
        )}
      </section>

      {canLoadMore ? (
        <div className="mt-6 flex justify-center">
          <Button
            variant="secondary"
            onClick={() => {
              const nextPage = page + 1;
              setPage(nextPage);
              void loadMembers(nextPage, true);
            }}
          >
            Load more
          </Button>
        </div>
      ) : null}
    </div>
  );
}
