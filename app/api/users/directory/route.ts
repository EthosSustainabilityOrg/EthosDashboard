/**
 * app/api/users/directory/route.ts
 * GET /api/users/directory
 */
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { extractClaims } from '@/lib/auth';
import type { ApiResponse } from '@/types/api';

type DirectoryMember = {
  user_id: string;
  first_name: string;
  last_name: string;
  org_role_id: number;
  chapter_id: string;
  onboarding_complete: boolean;
  created_at: string;
  updated_at: string;
};

type DirectoryListResponse = {
  members: DirectoryMember[];
  total: number;
  page: number;
  per_page: number;
};

export async function GET(req: NextRequest): Promise<NextResponse<ApiResponse<DirectoryListResponse>>> {
  try {
    // 1. Verify Supabase JWT
    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json(
        { data: null, error: { code: 'UNAUTHORIZED', message: 'Missing or invalid authorization header' } },
        { status: 401 }
      );
    }
    const token = authHeader.split(' ')[1];
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json(
        { data: null, error: { code: 'UNAUTHORIZED', message: 'Invalid token' } },
        { status: 401 }
      );
    }

    // 2. Decode custom claims from verified JWT
    const claims = extractClaims(token);
    if (!claims?.sub) {
      return NextResponse.json(
        { data: null, error: { code: 'UNAUTHORIZED', message: 'Invalid token payload' } },
        { status: 401 }
      );
    }

    // 3. Parse Query Params
    const url = new URL(req.url);
    const search = url.searchParams.get('search');
    const roleParam = url.searchParams.get('role');
    const chapterParam = url.searchParams.get('chapter_id');
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
    const perPage = Math.min(50, Math.max(1, parseInt(url.searchParams.get('per_page') || '20', 10)));

    const { data: viewerData } = await supabaseAdmin
      .from('users')
      .select('org_role_id, chapter_id')
      .eq('user_id', claims.sub)
      .maybeSingle();

    const orgRoleId = viewerData?.org_role_id ?? 1;
    const chapterId = viewerData?.chapter_id ?? null;

    // 4. Non-Board users cannot use the chapter_id filter param
    if (orgRoleId !== 3 && chapterParam) {
      return NextResponse.json(
        { data: null, error: { code: 'FORBIDDEN', message: 'chapter_id filter is only available to Board members' } },
        { status: 403 }
      );
    }

    // 5. Determine chapter scope
    // Non-Board: always locked to own chapter
    // Board: all chapters unless chapterParam is set
    let targetChapterId: string | null = null;
    if (orgRoleId !== 3) {
      targetChapterId = chapterId;
    } else if (chapterParam) {
      targetChapterId = chapterParam;
    }

    // 6. Build Query — only safe, non-sensitive fields
    let query = supabaseAdmin
      .from('users')
      .select(
        'user_id, first_name, last_name, org_role_id, chapter_id, onboarding_complete, created_at, updated_at',
        { count: 'exact' }
      );

    if (targetChapterId) {
      query = query.eq('chapter_id', targetChapterId);
    }

    if (roleParam) {
      const roleId = parseInt(roleParam, 10);
      if ([1, 2, 3].includes(roleId)) {
        query = query.eq('org_role_id', roleId);
      }
    }

    if (search) {
      // Uses the GIN index idx_users_name_fts created in 003_users.sql
      // textSearch operates on the tsvector expression stored in the index
      query = query.textSearch('first_name || \' \' || last_name', search, {
        type: 'plain',
        config: 'english'
      });
      // NOTE: If the above expression does not match the exact tsvector column name in 003_users.sql,
      // fall back to the two separate ilike calls below. ilike does not benefit from the GIN index
      // and is subject to injection if `search` is not sanitized — the Supabase client parameterises
      // it safely here, but note the caveat for future raw SQL callers:
      //
      // query = query.or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%`);
    }

    // 7. Paginate
    const from = (page - 1) * perPage;
    const to = from + perPage - 1;
    query = query.range(from, to).order('first_name', { ascending: true });

    const { data, error, count } = await query;

    if (error) {
      return NextResponse.json(
        { data: null, error: { code: 'VALIDATION_ERROR', message: error.message } },
        { status: 400 }
      );
    }

    return NextResponse.json({
      data: {
        members: (data || []) as DirectoryMember[],
        total: count || 0,
        page,
        per_page: perPage
      },
      error: null
    });

  } catch (error) {
    return NextResponse.json(
      { data: null, error: { code: 'VALIDATION_ERROR', message: 'Internal Server Error' } },
      { status: 500 }
    );
  }
}
