import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { extractClaims } from '@/lib/auth';
import type { ApiResponse } from '@/types/api';

type SearchType = 'Project' | 'File' | 'Member' | 'Task' | 'Announcement';

type SearchResult = {
  type: SearchType;
  id: string;
  title: string;
  subtitle: string;
  url: string;
};

type SearchResponse = {
  results: SearchResult[];
  total: number;
};

type AuthContext = {
  userId: string;
  roleId: number;
  chapterId: string | null;
};

type ProjectSearchRow = {
  project_id: string;
  name: string;
  project_type_id: number;
  chapter_id: string;
  created_by: string;
  is_published: boolean;
  is_open_call: boolean;
  project_types: { type_name: string } | null;
  chapters: { name: string } | null;
};

type FileSearchRow = {
  file_id: string;
  drive_url: string;
  file_name: string;
  file_type: string;
  project_id: string | null;
  projects: { name: string } | null;
};

type MemberSearchRow = {
  user_id: string;
  first_name: string;
  last_name: string;
  org_role_id: number;
  chapter_id: string;
  org_roles: { role_name: string } | null;
  chapters: { name: string } | null;
};

type TaskSearchRow = {
  task_id: string;
  project_id: string;
  title: string;
  status: string;
  projects: { name: string; created_by: string } | null;
};

type AnnouncementSearchRow = {
  announcement_id: string;
  content: string;
  posted_at: string;
};

const SEARCH_TYPES: readonly SearchType[] = ['Project', 'File', 'Member', 'Task', 'Announcement'];

function isSearchType(value: string | null): value is SearchType {
  return typeof value === 'string' && SEARCH_TYPES.includes(value as SearchType);
}

function parsePositiveInt(value: string | null, fallback: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, max);
}

function toTsQuery(value: string): string {
  return value
    .trim()
    .split(/\s+/)
    .map((part) => part.replace(/[':*!()&|]/g, ''))
    .filter(Boolean)
    .map((part) => `${part}:*`)
    .join(' & ');
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(value));
}

async function requireUser(req: NextRequest): Promise<AuthContext | null> {
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;

  const token = authHeader.split(' ')[1];
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  const claims = extractClaims(token);

  if (error || !user || !claims?.sub) return null;

  const { data: roleData } = await supabaseAdmin
    .from('users')
    .select('org_role_id')
    .eq('user_id', claims.sub)
    .maybeSingle();

  return {
    userId: claims.sub,
    roleId: roleData?.org_role_id ?? 1,
    chapterId: claims.chapter_id ?? null,
  };
}

async function getAccessibleTaskProjectIds(auth: AuthContext): Promise<string[] | null> {
  if (auth.roleId === 3) return null;

  const ids = new Set<string>();

  if (auth.roleId === 2) {
    const { data: leadProjects } = await supabaseAdmin
      .from('projects')
      .select('project_id')
      .eq('created_by', auth.userId)
      .returns<Array<{ project_id: string }>>();

    for (const project of leadProjects ?? []) ids.add(project.project_id);
  }

  const { data: approvedProjects } = await supabaseAdmin
    .from('applications')
    .select('project_id')
    .eq('user_id', auth.userId)
    .eq('status', 'Approved')
    .returns<Array<{ project_id: string }>>();

  for (const application of approvedProjects ?? []) ids.add(application.project_id);

  return Array.from(ids);
}

async function searchProjects(auth: AuthContext, query: string, limit: number, offset: number): Promise<{ results: SearchResult[]; total: number }> {
  let request = supabaseAdmin
    .from('projects')
    .select(`
      project_id,
      name,
      project_type_id,
      chapter_id,
      created_by,
      is_published,
      is_open_call,
      project_types ( type_name ),
      chapters ( name )
    `, { count: 'exact' })
    .textSearch('name', query)
    .range(offset, offset + limit - 1);

  if (auth.roleId !== 3) {
    if (auth.roleId === 2) {
      request = request.or(`and(is_published.eq.true,chapter_id.eq.${auth.chapterId}),and(is_published.eq.true,is_open_call.eq.true),created_by.eq.${auth.userId}`);
    } else {
      request = request.or(`and(is_published.eq.true,chapter_id.eq.${auth.chapterId}),and(is_published.eq.true,is_open_call.eq.true)`);
    }
  }

  const { data, count } = await request.returns<ProjectSearchRow[]>();

  return {
    total: count ?? data?.length ?? 0,
    results: (data ?? []).map((project) => ({
      type: 'Project',
      id: project.project_id,
      title: project.name,
      subtitle: `${project.project_types?.type_name ?? 'Project'} · ${project.chapters?.name ?? 'Unknown chapter'}`,
      url: `/projects/${project.project_id}`,
    })),
  };
}

async function searchFiles(query: string, limit: number, offset: number): Promise<{ results: SearchResult[]; total: number }> {
  const { data, count } = await supabaseAdmin
    .from('files')
    .select(`
      file_id,
      drive_url,
      file_name,
      file_type,
      project_id,
      projects ( name )
    `, { count: 'exact' })
    .textSearch('file_name', query)
    .range(offset, offset + limit - 1)
    .returns<FileSearchRow[]>();

  return {
    total: count ?? data?.length ?? 0,
    results: (data ?? []).map((file) => ({
      type: 'File',
      id: file.file_id,
      title: file.file_name,
      subtitle: `${file.file_type} · ${file.projects?.name ?? 'Ethos-wide'}`,
      url: file.drive_url,
    })),
  };
}

async function searchMembers(auth: AuthContext, query: string, limit: number, offset: number): Promise<{ results: SearchResult[]; total: number }> {
  let request = supabaseAdmin
    .from('users')
    .select(`
      user_id,
      first_name,
      last_name,
      org_role_id,
      chapter_id,
      org_roles ( role_name ),
      chapters ( name )
    `, { count: 'exact' })
    .or(`first_name.ilike.%${query}%,last_name.ilike.%${query}%`)
    .range(offset, offset + limit - 1);

  if (auth.roleId !== 3 && auth.chapterId) request = request.eq('chapter_id', auth.chapterId);

  const { data, count } = await request.returns<MemberSearchRow[]>();

  return {
    total: count ?? data?.length ?? 0,
    results: (data ?? []).map((member) => ({
      type: 'Member',
      id: member.user_id,
      title: `${member.first_name} ${member.last_name}`,
      subtitle: `${member.org_roles?.role_name ?? 'Member'} · ${member.chapters?.name ?? 'Unknown chapter'}`,
      url: `/directory/${member.user_id}`,
    })),
  };
}

async function searchTasks(auth: AuthContext, query: string, limit: number, offset: number): Promise<{ results: SearchResult[]; total: number }> {
  const projectIds = await getAccessibleTaskProjectIds(auth);
  if (projectIds !== null && projectIds.length === 0) return { results: [], total: 0 };

  let request = supabaseAdmin
    .from('tasks')
    .select(`
      task_id,
      project_id,
      title,
      status,
      projects ( name, created_by )
    `, { count: 'exact' })
    .textSearch('title', query)
    .range(offset, offset + limit - 1);

  if (projectIds !== null) request = request.in('project_id', projectIds);

  const { data, count } = await request.returns<TaskSearchRow[]>();

  return {
    total: count ?? data?.length ?? 0,
    results: (data ?? []).map((task) => ({
      type: 'Task',
      id: task.task_id,
      title: task.title,
      subtitle: `${task.status} · ${task.projects?.name ?? 'Project'}`,
      url: `/projects/${task.project_id}?task=${task.task_id}`,
    })),
  };
}

async function searchAnnouncements(query: string, limit: number, offset: number): Promise<{ results: SearchResult[]; total: number }> {
  const { data, count } = await supabaseAdmin
    .from('announcements')
    .select('announcement_id, content, posted_at', { count: 'exact' })
    .textSearch('content', query)
    .range(offset, offset + limit - 1)
    .returns<AnnouncementSearchRow[]>();

  return {
    total: count ?? data?.length ?? 0,
    results: (data ?? []).map((announcement) => ({
      type: 'Announcement',
      id: announcement.announcement_id,
      title: announcement.content,
      subtitle: `Posted ${formatDate(announcement.posted_at)}`,
      url: `/announcements#${announcement.announcement_id}`,
    })),
  };
}

export async function GET(req: NextRequest): Promise<NextResponse<ApiResponse<SearchResponse>>> {
  const auth = await requireUser(req);
  if (!auth) {
    return NextResponse.json(
      { data: null, error: { code: 'UNAUTHORIZED', message: 'Invalid token' } },
      { status: 401 }
    );
  }

  const q = req.nextUrl.searchParams.get('q')?.trim() ?? '';
  const typeParam = req.nextUrl.searchParams.get('type');
  const page = parsePositiveInt(req.nextUrl.searchParams.get('page'), 1, 1000);
  const perPage = parsePositiveInt(req.nextUrl.searchParams.get('per_page'), 20, 50);

  if (q.length < 2) {
    return NextResponse.json(
      { data: null, error: { code: 'VALIDATION_ERROR', message: 'q must be at least 2 characters' } },
      { status: 400 }
    );
  }

  if (typeParam !== null && !isSearchType(typeParam)) {
    return NextResponse.json(
      { data: null, error: { code: 'VALIDATION_ERROR', message: 'Invalid search type' } },
      { status: 400 }
    );
  }

  const tsQuery = toTsQuery(q);
  if (!tsQuery) {
    return NextResponse.json(
      { data: null, error: { code: 'VALIDATION_ERROR', message: 'q must include searchable characters' } },
      { status: 400 }
    );
  }

  if (typeParam) {
    const offset = (page - 1) * perPage;
    const result = typeParam === 'Project'
      ? await searchProjects(auth, tsQuery, perPage, offset)
      : typeParam === 'File'
        ? await searchFiles(tsQuery, perPage, offset)
        : typeParam === 'Member'
          ? await searchMembers(auth, q, perPage, offset)
          : typeParam === 'Task'
            ? await searchTasks(auth, tsQuery, perPage, offset)
            : await searchAnnouncements(tsQuery, perPage, offset);

    return NextResponse.json({
      data: {
        results: result.results,
        total: result.total,
      },
      error: null,
    });
  }

  const perTableLimit = Math.max(3, Math.ceil(perPage / 5));
  const [projects, members, files, tasks, announcements] = await Promise.all([
    searchProjects(auth, tsQuery, perTableLimit, 0),
    searchMembers(auth, q, perTableLimit, 0),
    searchFiles(tsQuery, perTableLimit, 0),
    searchTasks(auth, tsQuery, perTableLimit, 0),
    searchAnnouncements(tsQuery, perTableLimit, 0),
  ]);

  const merged = [
    ...projects.results,
    ...members.results,
    ...files.results,
    ...tasks.results,
    ...announcements.results,
  ];

  return NextResponse.json({
    data: {
      results: merged.slice(0, perPage),
      total: projects.total + members.total + files.total + tasks.total + announcements.total,
    },
    error: null,
  });
}
