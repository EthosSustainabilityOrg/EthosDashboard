import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import type { Chapter } from '@/types/chapters';
import type { OrgRoleId } from '@/types/auth';
import { RoleManagementPanel } from '@/components/board/RoleManagementPanel';

type MemberRow = {
  user_id: string;
  first_name: string;
  last_name: string;
  org_role_id: OrgRoleId;
  chapter_id: string;
  chapters:
    | {
        name: string;
      }
    | {
        name: string;
      }[]
    | null;
};

type RoleManagedMember = {
  user_id: string;
  first_name: string;
  last_name: string;
  org_role_id: OrgRoleId;
  org_role_name: string;
  chapter_id: string;
  chapter_name: string;
};

function roleName(roleId: OrgRoleId) {
  if (roleId === 3) return 'Board';
  if (roleId === 2) return 'Project Lead';
  return 'Member';
}

function getChapterName(member: MemberRow) {
  const chapter = Array.isArray(member.chapters) ? member.chapters[0] : member.chapters;
  return chapter?.name ?? 'Unknown chapter';
}

export default async function BoardRolesPage() {
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

  const [membersResult, chaptersResult] = await Promise.all([
    supabase
      .from('users')
      .select('user_id, first_name, last_name, org_role_id, chapter_id, chapters(name)')
      .order('first_name', { ascending: true }),
    supabase.from('chapters').select('*').order('name', { ascending: true }),
  ]);

  const members = ((membersResult.data ?? []) as MemberRow[]).map<RoleManagedMember>((member) => ({
    user_id: member.user_id,
    first_name: member.first_name,
    last_name: member.last_name,
    org_role_id: member.org_role_id,
    org_role_name: roleName(member.org_role_id),
    chapter_id: member.chapter_id,
    chapter_name: getChapterName(member),
  }));

  return (
    <RoleManagementPanel
      members={members}
      chapters={(chaptersResult.data ?? []) as Chapter[]}
    />
  );
}
