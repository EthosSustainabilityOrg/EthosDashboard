import type { Shift } from '@/types/shifts';
import { formatDate } from '@/lib/format-date';

type ShiftCardProps = {
  shift: Shift;
};

function formatDateRange(shift: Shift) {
  const start = new Date(shift.start_datetime);
  const end = new Date(shift.end_datetime);

  const date = formatDate(start, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  const startTime = formatDate(start, {
    hour: 'numeric',
    minute: '2-digit',
  });

  const endTime = formatDate(end, {
    hour: 'numeric',
    minute: '2-digit',
  });

  return `${date} · ${startTime} - ${endTime}`;
}

function isPastShift(shift: Shift) {
  return new Date(shift.end_datetime) < new Date();
}

export function ShiftCard({ shift }: ShiftCardProps) {
  return (
    <article className={`rounded-lg bg-sand p-4 ${isPastShift(shift) ? 'opacity-50' : ''}`}>
      <h3 className="font-semibold text-espresso">{formatDateRange(shift)}</h3>
      <p className="mt-2 text-sm text-brown-mid">{shift.location ?? 'Same as project'}</p>
      <p className="mt-2 text-sm text-warm-gray">{shift.capacity} volunteers</p>
      {shift.notes ? (
        <p className="mt-3 text-sm leading-6 text-brown-mid">{shift.notes}</p>
      ) : null}
    </article>
  );
}
