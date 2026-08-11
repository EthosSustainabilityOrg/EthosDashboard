/**
 * app/api/onboarding/connect-slack/route.ts
 * POST /api/onboarding/connect-slack
 */
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { extractClaims } from '@/lib/auth';
import type { ApiResponse } from '@/types/api';

type ConnectSlackResponse = {
  slack_user_id: string;
  slack_connected: boolean;
};

type ConnectSlackInput = {
  slack_code: string;
};

type SlackOAuthSuccess = {
  ok: true;
  authed_user: {
    id: string;
  };
};

type SlackOAuthFailure = {
  ok: false;
  error?: string;
};

function isConnectSlackInput(value: unknown): value is ConnectSlackInput {
  if (!value || typeof value !== 'object') return false;
  const body = value as Record<string, unknown>;
  return typeof body.slack_code === 'string' && body.slack_code.trim().length > 0;
}

function isSlackOAuthSuccess(value: unknown): value is SlackOAuthSuccess {
  if (!value || typeof value !== 'object') return false;

  const response = value as Record<string, unknown>;
  const authedUser = response.authed_user as Record<string, unknown> | undefined;

  return response.ok === true && typeof authedUser?.id === 'string';
}

function isSlackOAuthFailure(value: unknown): value is SlackOAuthFailure {
  if (!value || typeof value !== 'object') return false;
  const response = value as Record<string, unknown>;
  return response.ok === false;
}

export async function POST(req: NextRequest): Promise<NextResponse<ApiResponse<ConnectSlackResponse>>> {
  try {
    // 1. Verify Auth
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

    const claims = extractClaims(token);
    if (!claims?.sub) {
      return NextResponse.json(
        { data: null, error: { code: 'UNAUTHORIZED', message: 'Invalid token payload' } },
        { status: 401 }
      );
    }

    // 2. Validate Body
    const rawBody: unknown = await req.json().catch(() => null);
    if (!isConnectSlackInput(rawBody)) {
      return NextResponse.json(
        { data: null, error: { code: 'VALIDATION_ERROR', message: 'A Slack authorization code is required' } },
        { status: 400 }
      );
    }

    const slackClientId = process.env.SLACK_CLIENT_ID;
    const slackClientSecret = process.env.SLACK_CLIENT_SECRET;

    if (!slackClientId || !slackClientSecret) {
      return NextResponse.json(
        { data: null, error: { code: 'INTEGRATION_ERROR', message: 'Slack OAuth is not configured' } },
        { status: 502 }
      );
    }

    // 3. Exchange Slack OAuth Code
    const slackResponse = await fetch('https://slack.com/api/oauth.v2.access', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: rawBody.slack_code,
        client_id: slackClientId,
        client_secret: slackClientSecret,
      }),
    });

    const slackData: unknown = await slackResponse.json().catch(() => null);

    if (!slackResponse.ok || !isSlackOAuthSuccess(slackData)) {
      const slackError = isSlackOAuthFailure(slackData) && slackData.error
        ? slackData.error
        : 'Slack OAuth exchange failed';

      return NextResponse.json(
        { data: null, error: { code: 'INTEGRATION_ERROR', message: slackError } },
        { status: 502 }
      );
    }

    const slackUserId = slackData.authed_user.id;
    const now = new Date().toISOString();

    // 4. Store Slack user ID on users
    const { error: userUpdateError } = await supabaseAdmin
      .from('users')
      .update({ slack_user_id: slackUserId })
      .eq('user_id', claims.sub);

    if (userUpdateError) {
      return NextResponse.json(
        { data: null, error: { code: 'VALIDATION_ERROR', message: userUpdateError.message } },
        { status: 400 }
      );
    }

    // 5. Mark onboarding Slack step complete
    const { data: onboarding, error: onboardingUpdateError } = await supabaseAdmin
      .from('onboarding')
      .update({
        slack_connected: true,
        slack_connected_at: now,
      })
      .eq('user_id', claims.sub)
      .select('slack_connected')
      .maybeSingle();

    if (onboardingUpdateError || !onboarding) {
      return NextResponse.json(
        {
          data: null,
          error: {
            code: 'NOT_FOUND',
            message: onboardingUpdateError?.message || 'Onboarding record not found',
          },
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      data: {
        slack_user_id: slackUserId,
        slack_connected: onboarding.slack_connected,
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
