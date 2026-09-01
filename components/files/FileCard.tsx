import type { File } from '@/types/files';
import { Badge } from '@/components/ui/Badge';
import { Tag } from '@/components/ui/Tag';
import { formatDate as formatOrgDate } from '@/lib/format-date';

type FileCardFile = File & {
  project_name: string | null;
  added_by_name: string;
};

type FileCardProps = {
  file: FileCardFile;
};

function formatDate(value: string) {
  return formatOrgDate(new Date(value), {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function FileCard({ file }: FileCardProps) {
  const categoryLabel = file.category === 'Universal'
    ? 'Ethos-wide'
    : file.project_name ?? 'Project file';

  return (
    <a
      href={file.drive_url}
      target="_blank"
      rel="noopener noreferrer"
      className="block rounded-xl border border-sand bg-cream p-4 transition hover:shadow-md"
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <Badge label={file.file_type} variant="neutral" />
        <Tag label={categoryLabel} color={file.category === 'Universal' ? 'peach' : 'sand'} />
      </div>

      <h2 className="truncate font-semibold text-espresso">{file.file_name}</h2>

      <p className="mt-4 text-sm text-warm-gray">
        {file.added_by_name} · {formatDate(file.created_at)}
      </p>
    </a>
  );
}
