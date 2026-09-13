import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { authenticate } from '@/lib/api-auth';
import type { ApiResponse } from '@/types/api';
import type { PageType, Recent } from '@/types/recents';

type RecentListItem = {
  page_type: PageType;
  reference_id: string;
  name: string | null;
  visited_at: string;
};

type RecentsResponse = {
  recents: RecentListItem[];
};

type ProjectNameRow = {
  project_id: string;
  name: string;
};

type FileNameRow = {
  file_id: string;
  file_name: string;
};

async function resolveRecentNames(recents: Recent[]): Promise<RecentListItem[]> {
  const projectIds = recents
    .filter((recent) => recent.page_type === 'Project')
    .map((recent) => recent.reference_id);

  const fileIds = recents
    .filter((recent) => recent.page_type === 'File')
    .map((recent) => recent.reference_id);

  const { data: projects } = projectIds.length > 0
    ? await supabaseAdmin
      .from('projects')
      .select('project_id, name')
      .in('project_id', projectIds)
      .returns<ProjectNameRow[]>()
    : { data: [] as ProjectNameRow[] };

  const { data: files } = fileIds.length > 0
    ? await supabaseAdmin
      .from('files')
      .select('file_id, file_name')
      .in('file_id', fileIds)
      .returns<FileNameRow[]>()
    : { data: [] as FileNameRow[] };

  const projectNames = new Map((projects ?? []).map((project) => [project.project_id, project.name]));
  const fileNames = new Map((files ?? []).map((file) => [file.file_id, file.file_name]));

  return recents.map((recent) => ({
    page_type: recent.page_type,
    reference_id: recent.reference_id,
    name: recent.page_type === 'Project'
      ? projectNames.get(recent.reference_id) ?? null
      : fileNames.get(recent.reference_id) ?? null,
    visited_at: recent.visited_at,
  }));
}

export async function GET(req: NextRequest): Promise<NextResponse<ApiResponse<RecentsResponse>>> {
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json(
      { data: null, error: { code: 'UNAUTHORIZED', message: 'Missing or invalid authorization header' } },
      { status: 401 }
    );
  }

  const auth = await authenticate(req);
  if (!auth) {
    return NextResponse.json(
      { data: null, error: { code: 'UNAUTHORIZED', message: 'Invalid token' } },
      { status: 401 }
    );
  }

  const { data: recents, error } = await supabaseAdmin
    .from('recents')
    .select('*')
    .eq('user_id', auth.userId)
    .order('visited_at', { ascending: false })
    .limit(10)
    .returns<Recent[]>();

  if (error) {
    return NextResponse.json(
      { data: null, error: { code: 'VALIDATION_ERROR', message: error.message } },
      { status: 400 }
    );
  }

  return NextResponse.json({
    data: {
      recents: await resolveRecentNames(recents ?? []),
    },
    error: null,
  });
}
