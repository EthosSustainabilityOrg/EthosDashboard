/**
 * app/api/badges/[badge_id]/award/route.ts
 * POST /api/badges/:badge_id/award
 */
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { extractClaims } from '@/lib/auth';
import type { ApiResponse } from '@/types/api';
import type { Badge, UserBadge } from '@/types/badges';

type AwardBadgeInput = {
  user_id: string;
  note?: string | null;
};

type BadgeWithProjectOwner = Badge & {
  projects: {
    created_by: string;
    name: string;
  } | null;
};

function isAwardBadgeInput(value: unknown): value is AwardBadgeInput {
  if (!value || typeof value !== 'object') return false;

  const body = value as Record<string, unknown>;
  return (
    typeof body.user_id === 'string' &&
    (body.note === undefined || body.note === null || typeof body.note === 'string')
  );
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ badge_id: string }> }
): Promise<NextResponse<ApiResponse<UserBadge>>> {
  try {
    const { badge_id: badgeId } = await params;

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
        { data: null, error: { code: 'FORBIDDEN', message: 'Only Project Leads and Board can award badges' } },
        { status: 403 }
      );
    }

    const body: unknown = await req.json().catch(() => null);
    if (!isAwardBadgeInput(body)) {
      return NextResponse.json(
        { data: null, error: { code: 'VALIDATION_ERROR', message: 'Please select a user to award this badge to' } },
        { status: 400 }
      );
    }

    const { data: badge } = await supabaseAdmin
      .from('badges')
      .select(`
        badge_id,
        badge_category,
        project_id,
        name,
        description,
        image_url,
        created_by,
        created_at,
        projects (
          created_by,
          name
        )
      `)
      .eq('badge_id', badgeId)
      .maybeSingle<BadgeWithProjectOwner>();

    if (!badge) {
      return NextResponse.json(
        { data: null, error: { code: 'NOT_FOUND', message: 'Badge not found' } },
        { status: 404 }
      );
    }

    if (orgRoleId === 2) {
      if (badge.badge_category === 'Achievement') {
        return NextResponse.json(
          { data: null, error: { code: 'FORBIDDEN', message: 'Project Leads cannot award Achievement badges' } },
          { status: 403 }
        );
      }

      if (!badge.project_id || badge.projects?.created_by !== claims.sub) {
        return NextResponse.json(
          { data: null, error: { code: 'FORBIDDEN', message: 'Project Leads can only award own project Participation badges' } },
          { status: 403 }
        );
      }

      const { data: approvedMember } = await supabaseAdmin
        .from('applications')
        .select('application_id')
        .eq('project_id', badge.project_id)
        .eq('user_id', body.user_id)
        .eq('status', 'Approved')
        .maybeSingle<{ application_id: string }>();

      if (!approvedMember) {
        return NextResponse.json(
          { data: null, error: { code: 'FORBIDDEN', message: 'User is not an approved volunteer on this project' } },
          { status: 403 }
        );
      }
    }

    const { data: existingAward } = await supabaseAdmin
      .from('user_badges')
      .select('user_badge_id')
      .eq('user_id', body.user_id)
      .eq('badge_id', badgeId)
      .maybeSingle<{ user_badge_id: string }>();

    if (existingAward) {
      return NextResponse.json(
        { data: null, error: { code: 'CONFLICT', message: 'Badge has already been awarded to this user' } },
        { status: 409 }
      );
    }

    const { data: award, error: insertError } = await supabaseAdmin
      .from('user_badges')
      .insert({
        user_id: body.user_id,
        badge_id: badgeId,
        awarded_by: claims.sub,
        note: body.note ?? null,
      })
      .select()
      .single<UserBadge>();

    if (insertError || !award) {
      return NextResponse.json(
        { data: null, error: { code: 'VALIDATION_ERROR', message: insertError?.message || 'Failed to award badge' } },
        { status: 400 }
      );
    }

    await supabaseAdmin
      .from('notifications')
      .insert({
        user_id: body.user_id,
        sent_to_email: null,
        sent_to_slack_user_id: null,
        channel: 'InApp',
        event_type: 'Badge Awarded',
        subject: null,
        body: `You were awarded a badge: ${badge.name}`,
        status: 'Sent',
      });

    return NextResponse.json({ data: award, error: null }, { status: 201 });
  } catch {
    return NextResponse.json(
      { data: null, error: { code: 'VALIDATION_ERROR', message: 'Internal Server Error' } },
      { status: 500 }
    );
  }
}
