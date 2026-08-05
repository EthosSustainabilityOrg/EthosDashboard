/**
 * app/api/files/route.ts
 * GET /api/files
 * POST /api/files
 */
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { extractClaims } from '@/lib/auth';
import { extractFileIdFromUrl } from '@/lib/google-drive';
import type { ApiResponse, PaginatedResponse } from '@/types/api';
import type { File, FileCategory } from '@/types/files';

type FileListItem = File & {
  project_name: string | null;
  added_by_name: string | null;
};

type FilesResponse = PaginatedResponse<FileListItem> & {
  files: FileListItem[];
};

type CreateFileInput = {
  project_id?: string | null;
  drive_url: string;
  file_name: string;
  file_type: string;
  category: FileCategory;
  description?: string | null;
  is_policy?: boolean;
};

type ProjectOwnerRow = {
  project_id: string;
  name: string;
  created_by: string;
};

type UserNameRow = {
  user_id: string;
  first_name: string;
  last_name: string;
};

const FILE_CATEGORIES: readonly FileCategory[] = ['Project', 'Universal'];

function isFileCategory(value: unknown): value is FileCategory {
  return typeof value === 'string' && FILE_CATEGORIES.includes(value as FileCategory);
}

function isUuid(value: string | null): value is string {
  return Boolean(value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value));
}

function parsePositiveInt(value: string | null, fallback: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, max);
}

function isCreateFileInput(value: unknown): value is CreateFileInput {
  if (!value || typeof value !== 'object') return false;

  const body = value as Record<string, unknown>;
  return (
    (body.project_id === undefined || body.project_id === null || typeof body.project_id === 'string') &&
    typeof body.drive_url === 'string' &&
    typeof body.file_name === 'string' &&
    body.file_name.trim().length > 0 &&
    typeof body.file_type === 'string' &&
    body.file_type.trim().length > 0 &&
    isFileCategory(body.category) &&
    (body.description === undefined || body.description === null || typeof body.description === 'string') &&
    (body.is_policy === undefined || typeof body.is_policy === 'boolean')
  );
}

async function hydrateFiles(files: File[]): Promise<FileListItem[]> {
  const projectIds = Array.from(new Set(files.flatMap((file) => file.project_id ? [file.project_id] : [])));
  const addedByIds = Array.from(new Set(files.map((file) => file.added_by)));

  const { data: projects } = projectIds.length > 0
    ? await supabaseAdmin
      .from('projects')
      .select('project_id, name')
      .in('project_id', projectIds)
      .returns<Array<{ project_id: string; name: string }>>()
    : { data: [] as Array<{ project_id: string; name: string }> };

  const { data: users } = await supabaseAdmin
    .from('users')
    .select('user_id, first_name, last_name')
    .in('user_id', addedByIds)
    .returns<UserNameRow[]>();

  const projectNames = new Map((projects ?? []).map((project) => [project.project_id, project.name]));
  const userNames = new Map((users ?? []).map((user) => [user.user_id, `${user.first_name} ${user.last_name}`]));

  return files.map((file) => ({
    ...file,
    project_name: file.project_id ? projectNames.get(file.project_id) ?? null : null,
    added_by_name: userNames.get(file.added_by) ?? null,
  }));
}

export async function GET(req: NextRequest): Promise<NextResponse<ApiResponse<FilesResponse>>> {
  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json(
        { data: null, error: { code: 'UNAUTHORIZED', message: 'Missing or invalid authorization header' } },
        { status: 401 }
      );
    }

    const token = authHeader.split(' ')[1];
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    const claims = extractClaims(token);

    if (authError || !user || !claims?.sub) {
      return NextResponse.json(
        { data: null, error: { code: 'UNAUTHORIZED', message: 'Invalid token' } },
        { status: 401 }
      );
    }

    const searchParams = req.nextUrl.searchParams;
    const search = searchParams.get('search');
    const category = searchParams.get('category');
    const projectId = searchParams.get('project_id');
    const page = parsePositiveInt(searchParams.get('page'), 1, 1000);
    const perPage = parsePositiveInt(searchParams.get('per_page'), 20, 100);
    const from = (page - 1) * perPage;
    const to = from + perPage - 1;

    if (category !== null && !isFileCategory(category)) {
      return NextResponse.json(
        { data: null, error: { code: 'VALIDATION_ERROR', message: 'Invalid category' } },
        { status: 400 }
      );
    }

    if (projectId !== null && !isUuid(projectId)) {
      return NextResponse.json(
        { data: null, error: { code: 'VALIDATION_ERROR', message: 'Invalid project_id' } },
        { status: 400 }
      );
    }

    let query = supabaseAdmin
      .from('files')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to);

    if (category) query = query.eq('category', category);
    if (projectId) query = query.eq('project_id', projectId);
    if (search?.trim()) {
      const term = `%${search.trim()}%`;
      query = query.or(`file_name.ilike.${term},description.ilike.${term}`);
    }

    const { data: files, error, count } = await query.returns<File[]>();

    if (error) {
      return NextResponse.json(
        { data: null, error: { code: 'VALIDATION_ERROR', message: error.message } },
        { status: 400 }
      );
    }

    const hydratedFiles = await hydrateFiles(files ?? []);

    return NextResponse.json({
      data: {
        items: hydratedFiles,
        files: hydratedFiles,
        total: count ?? hydratedFiles.length,
        page,
        per_page: perPage,
      },
      error: null,
    });
  } catch {
    return NextResponse.json(
      { data: null, error: { code: 'VALIDATION_ERROR', message: 'Internal Server Error' } },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest): Promise<NextResponse<ApiResponse<File>>> {
  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json(
        { data: null, error: { code: 'UNAUTHORIZED', message: 'Missing or invalid authorization header' } },
        { status: 401 }
      );
    }

    const token = authHeader.split(' ')[1];
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    const claims = extractClaims(token);

    if (authError || !user || !claims?.sub) {
      return NextResponse.json(
        { data: null, error: { code: 'UNAUTHORIZED', message: 'Invalid token' } },
        { status: 401 }
      );
    }

    const { data: roleData } = await supabaseAdmin
      .from('users')
      .select('org_role_id')
      .eq('user_id', claims.sub)
      .maybeSingle();

    const orgRoleId = roleData?.org_role_id ?? 1;

    if (orgRoleId !== 2 && orgRoleId !== 3) {
      return NextResponse.json(
        { data: null, error: { code: 'FORBIDDEN', message: 'Only Project Leads and Board can add files' } },
        { status: 403 }
      );
    }

    const body: unknown = await req.json().catch(() => null);
    if (!isCreateFileInput(body)) {
      return NextResponse.json(
        { data: null, error: { code: 'VALIDATION_ERROR', message: 'drive_url, file_name, file_type, and category are required' } },
        { status: 400 }
      );
    }

    if (body.category === 'Universal' && body.project_id !== null && body.project_id !== undefined) {
      return NextResponse.json(
        { data: null, error: { code: 'VALIDATION_ERROR', message: 'Universal files must not have project_id' } },
        { status: 400 }
      );
    }

    if (body.category === 'Project' && !body.project_id) {
      return NextResponse.json(
        { data: null, error: { code: 'VALIDATION_ERROR', message: 'Project files require project_id' } },
        { status: 400 }
      );
    }

    if (body.category === 'Universal' && orgRoleId !== 3) {
      return NextResponse.json(
        { data: null, error: { code: 'FORBIDDEN', message: 'Only Board can add Universal files' } },
        { status: 403 }
      );
    }

    if (body.is_policy === true && orgRoleId !== 3) {
      return NextResponse.json(
        { data: null, error: { code: 'FORBIDDEN', message: 'Only Board can add policy documents' } },
        { status: 403 }
      );
    }

    const driveFileId = extractFileIdFromUrl(body.drive_url);
    if (!driveFileId) {
      return NextResponse.json(
        { data: null, error: { code: 'VALIDATION_ERROR', message: 'Could not extract Google Drive file ID from drive_url' } },
        { status: 400 }
      );
    }

    if (body.category === 'Project') {
      const { data: project } = await supabaseAdmin
        .from('projects')
        .select('project_id, name, created_by')
        .eq('project_id', body.project_id)
        .maybeSingle<ProjectOwnerRow>();

      if (!project) {
        return NextResponse.json(
          { data: null, error: { code: 'NOT_FOUND', message: 'Project not found' } },
          { status: 404 }
        );
      }

      if (orgRoleId === 2 && project.created_by !== claims.sub) {
        return NextResponse.json(
          { data: null, error: { code: 'FORBIDDEN', message: 'Cannot add files to this project' } },
          { status: 403 }
        );
      }
    }

    const { data: file, error: insertError } = await supabaseAdmin
      .from('files')
      .insert({
        project_id: body.category === 'Project' ? body.project_id : null,
        drive_file_id: driveFileId,
        drive_url: body.drive_url,
        file_name: body.file_name.trim(),
        file_type: body.file_type.trim(),
        category: body.category,
        description: body.description ?? null,
        is_policy: body.is_policy ?? false,
        added_by: claims.sub,
      })
      .select()
      .single<File>();

    if (insertError || !file) {
      return NextResponse.json(
        { data: null, error: { code: 'VALIDATION_ERROR', message: insertError?.message || 'Failed to add file' } },
        { status: 400 }
      );
    }

    return NextResponse.json({ data: file, error: null }, { status: 201 });
  } catch {
    return NextResponse.json(
      { data: null, error: { code: 'VALIDATION_ERROR', message: 'Internal Server Error' } },
      { status: 500 }
    );
  }
}
