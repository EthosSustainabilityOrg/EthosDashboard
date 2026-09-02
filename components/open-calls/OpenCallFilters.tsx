'use client';

import { Chip } from '@/components/ui/Chip';
import { Input } from '@/components/ui/Input';

type OpenCallFiltersProps = {
  search: string;
  onSearchChange: (value: string) => void;
  typeFilter: '' | '1' | '2' | '3';
  onTypeFilterChange: (value: '' | '1' | '2' | '3') => void;
  chapterFilter: 'own' | 'nearby' | 'hq' | 'all';
  onChapterFilterChange: (value: 'own' | 'nearby' | 'hq' | 'all') => void;
};

const chapterFilters = [
  { label: 'All', value: 'all' },
  { label: 'Chapter Projects', value: 'own' },
  { label: 'Nearby', value: 'nearby' },
  { label: 'HQ', value: 'hq' },
] as const;

const typeFilters = [
  { label: 'All Types', value: '' },
  { label: 'Events', value: '1' },
  { label: 'Campaigns', value: '2' },
  { label: 'Programs', value: '3' },
] as const;

export function OpenCallFilters({
  search,
  onSearchChange,
  typeFilter,
  onTypeFilterChange,
  chapterFilter,
  onChapterFilterChange,
}: OpenCallFiltersProps) {
  return (
    <div className="space-y-4">
      <Input
        value={search}
        onChange={onSearchChange}
        ariaLabel="Search open calls"
        placeholder="Search open calls..."
        name="open-call-search"
      />

      <div className="flex flex-wrap gap-2">
        {chapterFilters.map((filter) => (
          <Chip
            key={filter.value}
            label={filter.label}
            active={chapterFilter === filter.value}
            onClick={() => onChapterFilterChange(filter.value)}
          />
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        {typeFilters.map((filter) => (
          <Chip
            key={filter.value}
            label={filter.label}
            active={typeFilter === filter.value}
            onClick={() => onTypeFilterChange(filter.value)}
          />
        ))}
      </div>
    </div>
  );
}
