import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { VolunteerFlagsPanel } from '@/components/board/VolunteerFlagsPanel';
import { formatDate } from '@/lib/format-date';

type UserName = {
  first_name: string;
  last_name: string;
};

type ProjectName = {
  name: string;
};

type ShiftInfo = {
  start_datetime: string;
};

type FlagRow = {
  flag_id: string;
  user_id: string;
  project_id: string;
  shift_id: string | null;
  flagged_by: string;
  reason: string | null;
  resolved: boolean;
  resolved_at: string | null;
  created_at: string;
  flagged_user: UserName | UserName[] | null;
  flagged_by_user: UserName | UserName[] | null;
  projects: ProjectName | ProjectName[] | null;
  shifts: ShiftInfo | ShiftInfo[] | null;
};

function getUserName(value: UserName | UserName[] | null) {
  const user = Array.isArray(value) ? value[0] : value;
  return user ? `${user.first_name} ${user.last_name}` : 'Unknown member';
}

function getProjectName(value: ProjectName | ProjectName[] | null) {
  const project = Array.isArray(value) ? value[0] : value;
  return project?.name ?? 'Unknown project';
}

function getShiftDate(value: ShiftInfo | ShiftInfo[] | null) {
  const shift = Array.isArray(value) ? value[0] : value;
  if (!shift) return null;

  return formatDate(new Date(shift.start_datetime), {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default async function BoardFlagsPage() {
  const cookieStore = await cookies();

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

  const { data } = await supabase
    .from('volunteer_flags')
    .select(`
      flag_id,
      user_id,
      project_id,
      shift_id,
      flagged_by,
      reason,
      resolved,
      resolved_at,
      created_at,
      flagged_user:users!volunteer_flags_user_id_fkey(first_name, last_name),
      flagged_by_user:users!volunteer_flags_flagged_by_fkey(first_name, last_name),
      projects(name),
      shifts(start_datetime)
    `)
    .order('created_at', { ascending: false });

  const flags = ((data ?? []) as FlagRow[]).map((flag) => ({
    flag_id: flag.flag_id,
    volunteer_name: getUserName(flag.flagged_user),
    volunteer_id: flag.user_id,
    project_name: getProjectName(flag.projects),
    project_id: flag.project_id,
    lead_name: getUserName(flag.flagged_by_user),
    shift_date: getShiftDate(flag.shifts),
    reason: flag.reason,
    resolved: flag.resolved,
    resolved_at: flag.resolved_at,
    created_at: flag.created_at,
  }));

  return <VolunteerFlagsPanel flags={flags} />;
}
