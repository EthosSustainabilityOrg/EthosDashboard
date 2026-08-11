/**
 * app/api/badges/route.ts
 * GET /api/badges
 * POST /api/badges
 */
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { extractClaims } from '@/lib/auth';
import type { ApiResponse } from '@/types/api';
import type { Badge, BadgeCategory } from '@/types/badges';

type BadgeListItem = Badge & {
  project_name: string | null;
};

type BadgesResponse = {
  badges: BadgeListItem[];
};

type CreateBadgeInput = {
  badge_category: BadgeCategory;
  project_id?: string | null;
  name: string;
  description?: string | null;
  image_url?: string | null;
};

const BADGE_CATEGORIES: readonly BadgeCategory[] = ['Participation', 'Achievement'];

function isBadgeCategory(value: unknown): value is BadgeCategory {
  return typeof value === 'string' && BADGE_CATEGORIES.includes(value as BadgeCategory);
}

function isCreateBadgeInput(value: unknown): value is CreateBadgeInput {
  if (!value || typeof value !== 'object') return false;

  const body = value as Record<string, unknown>;
  return (
    isBadgeCategory(body.badge_category) &&
    (body.project_id === undefined || body.project_id === null || typeof body.project_id === 'string') &&
    typeof body.name === 'string' &&
    body.name.trim().length > 0 &&
    (body.description === undefined || body.description === null || typeof body.description === 'string') &&
    (body.image_url === undefined || body.image_url === null || typeof body.image_url === 'string')
  );
}

async function hydrateBadges(badges: Badge[]): Promise<BadgeListItem[]> {
  const projectIds = Array.from(new Set(badges.flatMap((badge) => badge.project_id ? [badge.project_id] : [])));

  const { data: projects } = projectIds.length > 0
    ? await supabaseAdmin
      .from('projects')
      .select('project_id, name')
      .in('project_id', projectIds)
      .returns<Array<{ project_id: string; name: string }>>()
    : { data: [] as Array<{ project_id: string; name: string }> };

  const projectNames = new Map((projects ?? []).map((project) => [project.project_id, project.name]));

  return badges.map((badge) => ({
    ...badge,
    project_name: badge.project_id ? projectNames.get(badge.project_id) ?? null : null,
  }));
}

export async function GET(req: NextRequest): Promise<NextResponse<ApiResponse<BadgesResponse>>> {
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

    if (authError || !user) {
      return NextResponse.json(
        { data: null, error: { code: 'UNAUTHORIZED', message: 'Invalid token' } },
        { status: 401 }
      );
    }

    const { data: badges, error } = await supabaseAdmin
      .from('badges')
      .select('*')
      .order('created_at', { ascending: false })
      .returns<Badge[]>();

    if (error) {
      return NextResponse.json(
        { data: null, error: { code: 'VALIDATION_ERROR', message: error.message } },
        { status: 400 }
      );
    }

    return NextResponse.json({
      data: { badges: await hydrateBadges(badges ?? []) },
      error: null,
    });
  } catch {
    return NextResponse.json(
      { data: null, error: { code: 'VALIDATION_ERROR', message: 'Internal Server Error' } },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest): Promise<NextResponse<ApiResponse<Badge>>> {
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

    if (orgRoleId !== 3) {
      return NextResponse.json(
        { data: null, error: { code: 'FORBIDDEN', message: 'Only Board can create badges' } },
        { status: 403 }
      );
    }

    const body: unknown = await req.json().catch(() => null);
    if (!isCreateBadgeInput(body)) {
      return NextResponse.json(
        { data: null, error: { code: 'VALIDATION_ERROR', message: 'A badge name and category are required' } },
        { status: 400 }
      );
    }

    if (body.badge_category === 'Achievement' && body.project_id) {
      return NextResponse.json(
        { data: null, error: { code: 'VALIDATION_ERROR', message: 'Achievement badges must not have project_id' } },
        { status: 400 }
      );
    }

    if (body.project_id) {
      const { data: project } = await supabaseAdmin
        .from('projects')
        .select('project_id')
        .eq('project_id', body.project_id)
        .maybeSingle<{ project_id: string }>();

      if (!project) {
        return NextResponse.json(
          { data: null, error: { code: 'NOT_FOUND', message: 'Project not found' } },
          { status: 404 }
        );
      }
    }

    const { data: badge, error: insertError } = await supabaseAdmin
      .from('badges')
      .insert({
        badge_category: body.badge_category,
        project_id: body.project_id ?? null,
        name: body.name.trim(),
        description: body.description ?? null,
        image_url: body.image_url ?? null,
        created_by: claims.sub,
      })
      .select()
      .single<Badge>();

    if (insertError || !badge) {
      return NextResponse.json(
        { data: null, error: { code: 'VALIDATION_ERROR', message: insertError?.message || 'Failed to create badge' } },
        { status: 400 }
      );
    }

    return NextResponse.json({ data: badge, error: null }, { status: 201 });
  } catch {
    return NextResponse.json(
      { data: null, error: { code: 'VALIDATION_ERROR', message: 'Internal Server Error' } },
      { status: 500 }
    );
  }
}
