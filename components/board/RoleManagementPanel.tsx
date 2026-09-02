'use client';

import { useMemo, useState } from 'react';
import type { Chapter } from '@/types/chapters';
import type { OrgRoleId } from '@/types/auth';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { ChangeRoleSheet } from '@/components/board/ChangeRoleSheet';

type RoleManagedMember = {
  user_id: string;
  first_name: string;
  last_name: string;
  org_role_id: OrgRoleId;
  org_role_name: string;
  chapter_id: string;
  chapter_name: string;
};

type RoleManagementPanelProps = {
  members: RoleManagedMember[];
  chapters: Chapter[];
};

function roleName(roleId: OrgRoleId) {
  if (roleId === 3) return 'Board';
  if (roleId === 2) return 'Project Lead';
  return 'Member';
}

function roleBadgeVariant(roleId: OrgRoleId) {
  if (roleId === 3) return 'peach' as const;
  if (roleId === 2) return 'info' as const;
  return 'neutral' as const;
}

function matchesFilters(
  member: RoleManagedMember,
  search: string,
  roleFilter: string,
  chapterFilter: string,
) {
  const term = search.trim().toLowerCase();
  const fullName = `${member.first_name} ${member.last_name}`.toLowerCase();

  return (
    (!term || fullName.includes(term)) &&
    (!roleFilter || String(member.org_role_id) === roleFilter) &&
    (!chapterFilter || member.chapter_id === chapterFilter)
  );
}

export function RoleManagementPanel({ members, chapters }: RoleManagementPanelProps) {
  const [localMembers, setLocalMembers] = useState(members);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [chapterFilter, setChapterFilter] = useState('');
  const [selectedMember, setSelectedMember] = useState<RoleManagedMember | null>(null);

  const filteredMembers = useMemo(
    () =>
      localMembers.filter((member) =>
        matchesFilters(member, search, roleFilter, chapterFilter),
      ),
    [localMembers, search, roleFilter, chapterFilter],
  );

  function handleRoleChanged(userId: string, newRoleId: number) {
    const nextRoleId = newRoleId as OrgRoleId;

    setLocalMembers((current) =>
      current.map((member) =>
        member.user_id === userId
          ? {
              ...member,
              org_role_id: nextRoleId,
              org_role_name: roleName(nextRoleId),
            }
          : member,
      ),
    );
    setSelectedMember(null);
  }

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-sand bg-cream p-5">
        <div className="flex flex-col gap-4 lg:flex-row">
          <div className="min-w-0 flex-1">
            <Input
              value={search}
              onChange={setSearch}
              ariaLabel="Search members by name"
              placeholder="Search by name..."
              name="role-search"
            />
          </div>
          <Select
            value={roleFilter}
            onChange={setRoleFilter}
            name="role-filter"
            options={[
              { value: '', label: 'All roles' },
              { value: '1', label: 'Member' },
              { value: '2', label: 'Project Lead' },
              { value: '3', label: 'Board' },
            ]}
          />
          <Select
            value={chapterFilter}
            onChange={setChapterFilter}
            name="chapter-filter"
            options={[
              { value: '', label: 'All chapters' },
              ...chapters.map((chapter) => ({
                value: chapter.chapter_id,
                label: chapter.name,
              })),
            ]}
          />
        </div>
      </section>

      <section className="rounded-xl border border-sand bg-cream">
        {filteredMembers.length > 0 ? (
          filteredMembers.map((member) => (
            <div
              key={member.user_id}
              className="flex flex-col gap-3 border-b border-sand px-5 py-4 last:border-b-0 md:flex-row md:items-center md:justify-between"
            >
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold text-espresso">
                    {member.first_name} {member.last_name}
                  </p>
                  <Badge label={member.org_role_name} variant={roleBadgeVariant(member.org_role_id)} />
                </div>
                <p className="mt-1 text-sm text-warm-gray">{member.chapter_name}</p>
              </div>

              <Button variant="ghost" size="sm" onClick={() => setSelectedMember(member)}>
                Change Role
              </Button>
            </div>
          ))
        ) : (
          <p className="px-5 py-12 text-center text-sm text-warm-gray">No members found</p>
        )}
      </section>

      {selectedMember ? (
        <ChangeRoleSheet
          member={selectedMember}
          onClose={() => setSelectedMember(null)}
          onRoleChanged={handleRoleChanged}
        />
      ) : null}
    </div>
  );
}
