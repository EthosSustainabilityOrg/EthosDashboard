'use client';

import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';

type RoleFilter = '' | '1' | '2' | '3';

type DirectoryFiltersProps = {
  search: string;
  onSearchChange: (search: string) => void;
  roleFilter: RoleFilter;
  onRoleFilterChange: (role: RoleFilter) => void;
  isBoard: boolean;
  chapterFilter: string;
  onChapterFilterChange: (chapterId: string) => void;
  chapters: Array<{ chapter_id: string; name: string }>;
};

const roleOptions = [
  { value: '', label: 'All' },
  { value: '1', label: 'Member' },
  { value: '2', label: 'Project Lead' },
  { value: '3', label: 'Board' },
];

export function DirectoryFilters({
  search,
  onSearchChange,
  roleFilter,
  onRoleFilterChange,
  isBoard,
  chapterFilter,
  onChapterFilterChange,
  chapters,
}: DirectoryFiltersProps) {
  return (
    <div className="flex flex-wrap items-end gap-4">
      <Input
        value={search}
        onChange={onSearchChange}
        ariaLabel="Search members"
        placeholder="Search members..."
        name="member-search"
      />

      <Select
        label="Role"
        value={roleFilter}
        onChange={(value) => onRoleFilterChange(value as RoleFilter)}
        options={roleOptions}
        className="min-w-44"
      />

      {isBoard ? (
        <Select
          label="Chapter"
          value={chapterFilter}
          onChange={onChapterFilterChange}
          options={[
            { value: '', label: 'All chapters' },
            ...chapters.map((chapter) => ({
              value: chapter.chapter_id,
              label: chapter.name,
            })),
          ]}
          className="min-w-52"
        />
      ) : null}
    </div>
  );
}
