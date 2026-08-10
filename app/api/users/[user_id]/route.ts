/**
 * app/api/users/[user_id]/route.ts
 * GET /api/users/:user_id
 */
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { extractClaims } from '@/lib/auth';
import type { ApiResponse } from '@/types/api';

type DirectoryBadge = {
  badge_id: string;
  name: string;
  badge_category: string;
  image_url: string | null;
  awarded_at: string;
};

type ProjectHistory = {
  project_id: string;
  project_name: string;
  chapter_name: string;
  type_name: string;
  approved_at: string;
};

type UserProfileResponse = {
  user_id: string;
  first_name: string;
  last_name: string;
  org_role_name: string;
  chapter_name: string;
  bio: string | null;
  badges: DirectoryBadge[];
  project_history: ProjectHistory[];
};

type RawBadgeJoin = {
  awarded_at: string;
  badges: {
    badge_id: string;
    name: string;
    badge_category: string;
    image_url: string | null;
  };
};

type RawApplicationJoin = {
  reviewed_at: string;
  projects: {
    project_id: string;
    name: string;
    chapters: { name: string } | { name: string }[];
    project_types: { type_name: string } | { type_name: string }[];
  };
};

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ user_id: string }> }
): Promise<NextResponse<ApiResponse<UserProfileResponse>>> {
  try {
    // 1. Verify Supabase JWT via auth.getUser
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

    // 2. Decode custom claims from now-verified JWT payload
    const claims = extractClaims(token);
    
    if (!claims || !claims.sub) {
      return NextResponse.json(
        { data: null, error: { code: 'UNAUTHORIZED', message: 'Invalid token payload' } },
        { status: 401 }
      );
    }

    const { user_id: targetUserId } = await params;

    // 3. Fetch the target user's basic public info (No sensitive fields)
    const { data: targetUser, error: userError } = await supabaseAdmin
      .from('users')
      .select(`
        user_id,
        first_name,
        last_name,
        chapter_id,
        org_roles!inner ( role_name ),
        chapters!inner ( name ),
        directory_profiles ( bio )
      `)
      .eq('user_id', targetUserId)
      .maybeSingle();

    if (userError || !targetUser) {
      return NextResponse.json(
        { data: null, error: { code: 'NOT_FOUND', message: 'User not found' } },
        { status: 404 }
      );
    }

    // 4. Enforce Scope: Non-Board users can only view members of their own chapter
    const { data: viewerData } = await supabaseAdmin
      .from('users')
      .select('org_role_id, chapter_id')
      .eq('user_id', claims.sub)
      .maybeSingle();

    const orgRoleId = viewerData?.org_role_id ?? 1;
    const chapterId = viewerData?.chapter_id ?? null;

    if (orgRoleId !== 3 && targetUser.chapter_id !== chapterId) {
      return NextResponse.json(
        { data: null, error: { code: 'FORBIDDEN', message: 'Cannot view members outside your chapter' } },
        { status: 403 }
      );
    }

    // 5. Fetch Badges
    const { data: userBadges } = await supabaseAdmin
      .from('user_badges')
      .select(`
        awarded_at,
        badges!inner (
          badge_id,
          name,
          badge_category,
          image_url
        )
      `)
      .eq('user_id', targetUserId)
      .returns<RawBadgeJoin[]>();

    // 6. Fetch Project History (Approved applications)
    const { data: applications } = await supabaseAdmin
      .from('applications')
      .select(`
        reviewed_at,
        projects!inner (
          project_id,
          name,
          chapters!inner ( name ),
          project_types!inner ( type_name )
        )
      `)
      .eq('user_id', targetUserId)
      .eq('status', 'Approved')
      .returns<RawApplicationJoin[]>();

    // 7. Map and safely extract joins
    const orgRole = Array.isArray(targetUser.org_roles) ? targetUser.org_roles[0] : targetUser.org_roles;
    const chapter = Array.isArray(targetUser.chapters) ? targetUser.chapters[0] : targetUser.chapters;
    const dirProfile = Array.isArray(targetUser.directory_profiles) ? targetUser.directory_profiles[0] : targetUser.directory_profiles;

    const badges: DirectoryBadge[] = (userBadges || []).map(ub => ({
      badge_id: ub.badges.badge_id,
      name: ub.badges.name,
      badge_category: ub.badges.badge_category,
      image_url: ub.badges.image_url,
      awarded_at: ub.awarded_at
    }));

    const projectHistory: ProjectHistory[] = (applications || []).map(app => ({
      project_id: app.projects.project_id,
      project_name: app.projects.name,
      chapter_name: Array.isArray(app.projects.chapters) ? app.projects.chapters[0].name : app.projects.chapters.name,
      type_name: Array.isArray(app.projects.project_types) ? app.projects.project_types[0].type_name : app.projects.project_types.type_name,
      approved_at: app.reviewed_at
    }));

    return NextResponse.json({
      data: {
        user_id: targetUser.user_id,
        first_name: targetUser.first_name,
        last_name: targetUser.last_name,
        org_role_name: orgRole?.role_name || '',
        chapter_name: chapter?.name || '',
        bio: dirProfile?.bio || null,
        badges,
        project_history: projectHistory
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
